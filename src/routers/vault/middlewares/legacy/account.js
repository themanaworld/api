"use strict";
const md5saltcrypt = require("../../utils/md5saltcrypt.js");
const flatfile = require("../../utils/flatfile.js");
const LegacyAccount = require("../../types/LegacyAccount.js");
const LegacyChar = require("../../types/LegacyChar.js");
const EvolAccount = require("../../types/EvolAccount.js");
const EvolChar = require("../../types/EvolChar.js");
const validate = require("../../utils/validate.js");
const { Op } = require("sequelize");

const get_accounts = async (req, res, next) => {
    let session;

    try {
        [, session] = validate.get_session(req, res);
    } catch { return } // already handled

    res.status(200).json({
        status: "success",
        accounts: session.legacyAccounts,
    });

    req.app.locals.cooldown(req, 1e3);
};

const claim_by_password = async (req, res, next) => {
    let session;

    try {
        [, session] = validate.get_session(req, res);
    } catch { return } // already handled

    const data = {
        username: validate.get_prop(req, "username", validate.regexes.alnum23),
        password: validate.get_prop(req, "password", validate.regexes.any23),
    };

    if (!data.username || !data.password) {
        res.status(400).json({
            status: "error",
            error: "invalid format",
        });
        req.app.locals.cooldown(req, 5e3);
        return;
    }

    const legacy = await req.app.locals.legacy.login.findOne({
        where: {userid: data.username}
    });

    if (legacy === null) {
        res.status(404).json({
            status: "error",
            error: "not found",
        });

        // max 5 attempts per 15 minutes
        if (req.app.locals.brute.consume(req, 5, 9e5)) {
            // some attempts left
            console.warn(`Vault.legacy.account: failed to log in to Legacy account <${session.vault}@vault> [${req.ip}]`);
            req.app.locals.cooldown(req, 3e3);
        } else {
            // no attempts left: big cooldown
            req.app.locals.logger.warn(`Vault.legacy.account: login request flood <${session.vault}@vault> [${req.ip}]`);
            req.app.locals.cooldown(req, 3.6e6);
        }
        return;
    }

    if (!md5saltcrypt.verify(legacy.userPass, data.password)) {
        // check to see if the password has been updated since it was dumped to SQL
        const flatfile_account = await flatfile.findAccount(legacy.accountId, legacy.userid); // this operation is costly
        if (flatfile_account !== null &&
            md5saltcrypt.verify(flatfile_account.password, data.password)) {
            // update the password in SQL (deferred)
            console.log(`Vault.legacy.account: updating SQL password from flatfile for account ${legacy.accountId}`);
            legacy.userPass = md5saltcrypt.hash(data.password);
            legacy.save();
        } else {
            // the password is just plain wrong
            res.status(404).json({
                status: "error",
                error: "not found",
            });

            // max 5 attempts per 15 minutes
            if (req.app.locals.brute.consume(req, 5, 9e5)) {
                // some attempts left
                console.warn(`Vault.legacy.account: failed to log in to Legacy account <${session.vault}@vault> [${req.ip}]`);
                req.app.locals.cooldown(req, 3e3);
            } else {
                // no attempts left: big cooldown
                req.app.locals.logger.warn(`Vault.legacy.account: login request flood <${session.vault}@vault> [${req.ip}]`);
                req.app.locals.cooldown(req, 3.6e6);
            }
            return;
        }
    }

    const claimed = await req.app.locals.vault.claimed_legacy_accounts.findByPk(legacy.accountId);

    if (claimed !== null) {
        res.status(409).json({
            status: "error",
            error: "already assigned",
        });
        req.app.locals.logger.warn(`Vault.legacy.account: blocked an attempt to link an already-linked account <${session.vault}@vault> [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    await req.app.locals.vault.claimed_legacy_accounts.create({
        accountId: legacy.accountId,
        vaultId: session.vault,
    });

    // log this action:
    req.app.locals.vault.account_log.create({
        vaultId: session.vault,
        accountType: "LEGACY",
        actionType: "LINK",
        accountId: legacy.accountId,
        ip: req.ip,
    });

    // now we must update the session cache:
    const chars = await req.app.locals.legacy.char.findAll({
        where: {accountId: legacy.accountId},
    });

    const account = new LegacyAccount(legacy.accountId, legacy.userid);
    account.revoltId = legacy.revoltId;

    for (const char_ of chars) {
        const char = new LegacyChar(account, char_.charId, char_.name);
        char.revoltId = char_.revoltId;
        char.baseLevel = char_.baseLevel;
        char.gender = char_.sex;

        const char_vars = await req.app.locals.legacy.char_reg.findAll({
            where: {
                charId: char_.charId,
                [Op.or]: [
                    {name: "TUT_var"},
                    {name: "BOSS_POINTS"},
                ],
            },
            limit: 2, // for now we only use these 2 vars ^
        });

        for (const var_ of char_vars) {
            if (var_.name === "TUT_var") {
                char.creationTime = var_.value > 0xFF ? var_.value : 0;
            } else if (var_.name === "BOSS_POINTS") {
                char.bossPoints = Math.max(0, var_.value);
            }

            // in the future maybe here set the vars in a Map<name, value>
        }

        account.chars.push(char);
    }

    session.legacyAccounts.push(account);

    res.status(200).json({
        status: "success",
        account
    });

    req.app.locals.logger.info(`Vault.legacy.account: linked Legacy account ${legacy.accountId} to Vault account <${session.vault}@vault> [${req.ip}]`);
    req.app.locals.cooldown(req, 8e3);
};

const migrate = async (req, res, next) => {
    let session;

    try {
        [, session] = validate.get_session(req, res);
    } catch { return } // already handled

    const data = {
        accountId: +validate.get_prop(req, "accountId", validate.regexes.gid),
        username:   validate.get_prop(req, "username", validate.regexes.alnum23),
        password:   validate.get_prop(req, "password", validate.regexes.any30),
    };

    if (!data.username || !data.password) {
        res.status(400).json({
            status: "error",
            error: "invalid format",
        });
        req.app.locals.cooldown(req, 5e3);
        return;
    }

    let legacy = null;

    // check if we own it
    // NOTE: this cached data is never stale because we update it when operations are performed
    for (const acc of session.legacyAccounts) {
        if (acc.accountId === data.accountId) {
            legacy = acc;
            break;
        }
    }

    if (legacy === null) {
        res.status(404).json({
            status: "error",
            error: "not found",
        });
        req.app.locals.logger.warn(`Vault.legacy.account: blocked an attempt to migrate a Legacy account not owned by the user <${session.vault}@vault> [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    if (legacy.revoltId) {
        res.status(409).json({
            status: "error",
            error: "already migrated",
        });
        req.app.locals.logger.warn(`Vault.legacy.account: blocked an attempt to migrate an already-migrated Legacy account <${session.vault}@vault> [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    // lots of queries (expensive!):

    // this check is necessary because login.userid has no UNIQUE constraint
    const existing = await req.app.locals.evol.login.findOne({
        where: {userid: data.username}
    });

    if (existing !== null) {
        res.status(409).json({
            status: "error",
            error: "already exists",
        });
        req.app.locals.cooldown(req, 2e3);
        return;
    }

    const evol_acc = await req.app.locals.evol.login.create({
        userid: data.username,
        userPass: data.password,
        email: `${session.vault}@vault`, // setting an actual email is pointless
    });

    // store the vault account id as a global account var
    await req.app.locals.evol.global_acc_reg_num_db.bulkCreate([
        {
            accountId: evol_acc.accountId,
            key: "##VAULT", index: 0,
            value: session.vault,
        },
        {
            accountId: evol_acc.accountId,
            key: "##LEGACY", index: 0,
            value: legacy.accountId, // the max value uses only 22 bits so we have some room
        },
        {
            accountId: evol_acc.accountId,
            key: "##LEGACY", index: 1,
            value: Math.ceil(Date.now() / 1000),
        },
    ]);

    req.app.locals.vault.migration_log.create({
        vaultId: session.vault,
        legacyId: legacy.accountId,
        accountId: evol_acc.accountId,
        ip: req.ip,
    });

    // immediately claim it
    await req.app.locals.vault.claimed_game_accounts.create({
        accountId: evol_acc.accountId,
        vaultId: session.vault,
    });

    const evol_account = new EvolAccount(evol_acc.accountId, evol_acc.userid);
    evol_account.legacyId = legacy.accountId;
    evol_account.legacyAccount = legacy;

    // update legacy account cache
    legacy.revoltId = evol_acc.accountId;
    legacy.revoltAccount = evol_acc;

    await req.app.locals.legacy.login.update({ // update sql
        revoltId: evol_acc.accountId,
    }, {where: {
        accountId: legacy.accountId,
    }});

    // XXX: ideally we should be using createBulk but we also want to update
    for (const [num, char] of legacy.chars.entries()) {
        if (char.revoltId) {
            // already migrated
            continue;
        }

        let evol_char;
        try {
            evol_char = await req.app.locals.evol.char.create({
                name: char.name,
                charNum: num,
                accountId: evol_acc.accountId,
                hairColor: Math.floor(Math.random() * 21), // range: [0,21[
                hair: (Math.floor(Math.random() * 28) + 1), // range: [1,28]
                sex: char.gender === "F" ? "F" : (char.gender === "M" ? "M" : "U"), // non-binary is undefined in evol
            });
        } catch (err) {
            // char.name has a UNIQUE constraint but an actual collision would never happen
            console.error(err);
            continue;
        }

        // set the legacy variables
        await req.app.locals.evol.char_reg_num_db.bulkCreate([
            {
                charId: evol_char.charId,
                key: "LEGACY", index: 0,
                value: char.charId,
            },
            {
                charId: evol_char.charId,
                key: "LEGACY", index: 1,
                value: (char.baseLevel & 0xFF) | ((char.bossPoints & 0x7FFFFF) << 8),
            },
            {
                charId: evol_char.charId,
                key: "LEGACY", index: 2,
                value: char.creationTime,
            },
        ]);

        // remove the name reservation
        req.app.locals.evol.char_reservation.destroy({
            where: { name: char.name }
        });

        // update the evol cache
        const evol_char_ = new EvolChar(evol_account, evol_char.charId, evol_char.name);
        evol_char_.legacyChar = char;
        evol_char_.legacyId = char.charId;
        evol_char_.gender = evol_char.sex;

        evol_account.chars.push(evol_char_);

        // update legacy cache
        char.revoltId = evol_char.charId;
        char.revoltAccount = evol_account;

        await req.app.locals.legacy.char.update({ // update sql
            revoltId: evol_char.charId,
        }, {where: {
            charId: char.charId,
        }});
    }

    session.gameAccounts.push(evol_account);

    // TODO: try/catch each of the await operations

    res.status(200).json({
        status: "success",
        session,
        account: evol_account,
    });

    req.app.locals.logger.info(`Vault.legacy.account: migrated Legacy account ${legacy.accountId} <${session.vault}@vault> [${req.ip}]`);
    req.app.locals.cooldown(req, 15e3);
};

module.exports = exports = async (req, res, next) => {
    switch(req.method) {
        case "GET":
            // list accounts
            return await get_accounts(req, res, next);
        case "POST":
            // add account (by password)
            return await claim_by_password(req, res, next);
        case "PATCH":
            // migrate to new server
            return await migrate(req, res, next);
        // TODO: password reset
        default:
            next(); // fallthrough to default endpoint (404)
    }
};
