"use strict";
const uuidv4 = require("uuid/v4");
const md5saltcrypt = require("../../utils/md5saltcrypt.js");
const flatfile = require("../../utils/flatfile.js");

const regexes = {
    token: /^[a-zA-Z0-9-_]{6,128}$/, // UUID
    any23: /^[^\s][^\t\r\n]{6,21}[^\s]$/, // tmwa password (this looks scary)
    any30: /^[^\s][^\t\r\n]{6,28}[^\s]$/, // herc password (this looks scary)
    alnum23: /^[a-zA-Z0-9_]{4,23}$/, // mostly for username
    gid: /^[23][0-9]{6}$/, // account id
};

const get_account_list = async (req, vault_id) => {
    const accounts = [];
    const claimed = await req.app.locals.vault.claimed_legacy_accounts.findAll({
        where: {vaultId: vault_id},
    });

    for (let acc of claimed) {
        acc = await req.app.locals.legacy.login.findByPk(acc.accountId);
        const chars = [];
        const chars_ = await req.app.locals.legacy.char.findAll({
            where: {accountId: acc.accountId},
        });

        for (const char of chars_) {
            chars.push({
                name: char.name,
                charId: char.charId,
                revoltId: char.revoltId,
                level: char.baseLevel,
                sex: char.sex,
            });
        }

        accounts.push({
            name: acc.userid,
            accountId: acc.accountId,
            revoltId: acc.revoltId,
            chars,
        });
    }

    return accounts;
};

const get_accounts = async (req, res, next) => {
    const token = String(req.get("X-VAULT-SESSION") || "");

    if (!token.match(regexes.token)) {
        res.status(400).json({
            status: "error",
            error: "missing session key",
        });
        req.app.locals.logger.warn(`Vault.legacy.account: blocked an attempt to bypass authentication [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    const session = req.app.locals.session.get(token);

    if (session === null || session === undefined) {
        res.status(410).json({
            status: "error",
            error: "session expired",
        });
        req.app.locals.cooldown(req, 5e3);
        return;
    }

    if (session.authenticated !== true) {
        res.status(401).json({
            status: "error",
            error: "not authenticated",
        });
        req.app.locals.logger.warn(`Vault.legacy.account: blocked an attempt to bypass authentication [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    let accounts = session.legacyAccounts;

    if (accounts.length < 1) {
        console.info(`Vault.legacy.account: fetching legacy accounts {${session.vault}} [${req.ip}]`);
        accounts = await get_account_list(req, session.vault);
        session.legacyAccounts = accounts;
        req.app.locals.cooldown(req, 3e3);
    } else {
        req.app.locals.cooldown(req, 1e3);
    }

    res.status(200).json({
        status: "success",
        accounts,
    });
};

const claim_by_password = async (req, res, next) => {
    const token = String(req.get("X-VAULT-SESSION") || "");

    if (!token.match(regexes.token)) {
        res.status(400).json({
            status: "error",
            error: "missing session key",
        });
        req.app.locals.logger.warn(`Vault.legacy.account: blocked an attempt to bypass authentication [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    if (!req.body || !Reflect.has(req.body, "username") || !Reflect.has(req.body, "password") ||
        !req.body.username.match(regexes.alnum23) ||
        !req.body.password.match(regexes.any23)) {
        res.status(400).json({
            status: "error",
            error: "invalid format",
        });
        req.app.locals.cooldown(req, 5e3);
        return;
    }

    const session = req.app.locals.session.get(token);

    if (session === null || session === undefined) {
        res.status(410).json({
            status: "error",
            error: "session expired",
        });
        req.app.locals.cooldown(req, 5e3);
        return;
    }

    if (session.authenticated !== true) {
        res.status(401).json({
            status: "error",
            error: "not authenticated",
        });
        req.app.locals.logger.warn(`Vault.legacy.account: blocked an attempt to bypass authentication [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    const legacy = await req.app.locals.legacy.login.findOne({
        where: {userid: req.body.username}
    });

    if (legacy === null) {
        res.status(404).json({
            status: "error",
            error: "not found",
        });
        req.app.locals.cooldown(req, 1e3);
        return;
    }

    if (!md5saltcrypt.verify(legacy.userPass, req.body.password)) {
        // check to see if the password has been updated since it was dumped to SQL
        const flatfile_account = await flatfile.findAccount(legacy.accountId, legacy.userid); // this operation is costly
        if (flatfile_account !== null &&
            md5saltcrypt.verify(flatfile_account.password, req.body.password)) {
            // update the password in SQL (deferred)
            console.log(`Vault.legacy.account: updating SQL password from flatfile for account ${legacy.accountId}`);
            legacy.userPass = md5saltcrypt.hash(req.body.password);
            legacy.save();
        } else {
            // the password is just plain wrong
            res.status(404).json({
                status: "error",
                error: "not found",
            });
            console.warn(`Vault.legacy.account: failed to log in to Legacy account {${session.vault}} [${req.ip}]`);
            req.app.locals.cooldown(req, 3e5);
            // TODO: huge cooldown after 8 attempts
            return;
        }
    }

    const claimed = await req.app.locals.vault.claimed_legacy_accounts.findByPk(legacy.accountId);

    if (claimed !== null) {
        res.status(409).json({
            status: "error",
            error: "already assigned",
        });
        req.app.locals.logger.warn(`Vault.legacy.account: blocked an attempt to link an already-linked account {${session.vault}} [${req.ip}]`);
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
        ip: req.app.locals.sequelize.vault.fn("INET6_ATON", req.ip),
    });

    // now we must update the session cache:
    const chars = [];
    const chars_ = await req.app.locals.legacy.char.findAll({
        where: {accountId: legacy.accountId},
    });

    for (const char of chars_) {
        chars.push({
            // TODO: make this a class
            name: char.name,
            charId: char.charId,
            revoltId: char.revoltId,
            level: char.baseLevel,
            sex: char.sex,
        });
    }

    const account = {
        name: legacy.userid,
        accountId: legacy.accountId,
        revoltId: legacy.revoltId,
        chars,
    };
    session.legacyAccounts.push(account);

    res.status(200).json({
        status: "success",
        account
    });

    req.app.locals.logger.info(`Vault.legacy.account: linked Legacy account ${legacy.accountId} to Vault account {${session.vault}} [${req.ip}]`);
    req.app.locals.cooldown(req, 8e3);
};

const migrate = async (req, res, next) => {
    const token = String(req.get("X-VAULT-SESSION") || "");

    if (!token.match(regexes.token)) {
        res.status(400).json({
            status: "error",
            error: "missing session key",
        });
        req.app.locals.logger.warn(`Vault.legacy.account: blocked an attempt to bypass authentication [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    if (!req.body || !Reflect.has(req.body, "accountId") ||
        !Reflect.has(req.body, "username") || !Reflect.has(req.body, "password") ||
        !req.body.username.match(regexes.alnum23) ||
        !req.body.password.match(regexes.any30) || // FIXME: this is unsafe: can cause a promise rejection if something else than a string is passed (no Number.match() exists)
        !String(req.body.accountId).match(regexes.gid)) {
        res.status(400).json({
            status: "error",
            error: "invalid format",
        });
        req.app.locals.cooldown(req, 5e3);
        return;
    }

    const session = req.app.locals.session.get(token);

    if (session === null || session === undefined) {
        res.status(410).json({
            status: "error",
            error: "session expired",
        });
        req.app.locals.cooldown(req, 5e3);
        return;
    }

    if (session.authenticated !== true) {
        res.status(401).json({
            status: "error",
            error: "not authenticated",
        });
        req.app.locals.logger.warn(`Vault.legacy.account: blocked an attempt to bypass authentication [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    let legacy = null;

    // check if we own it
    // NOTE: this cached data is never stale because we update it when operations are performed
    for (const acc of session.legacyAccounts) {
        if (acc.accountId === req.body.accountId) {
            legacy = acc;
            break;
        }
    }

    if (legacy === null) {
        res.status(404).json({
            status: "error",
            error: "not found",
        });
        req.app.locals.logger.warn(`Vault.legacy.account: blocked an attempt to migrate a Legacy account not owned by the user {${session.vault}} [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    if (legacy.revoltId) {
        res.status(409).json({
            status: "error",
            error: "already migrated",
        });
        req.app.locals.logger.warn(`Vault.legacy.account: blocked an attempt to migrate an already-migrated Legacy account {${session.vault}} [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    // lots of queries (expensive!):

    // this check is necessary because login.userid has no UNIQUE constraint
    const existing = await req.app.locals.evol.login.findOne({
        where: {userid: req.body.username}
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
        userid: req.body.username,
        userPass: req.body.password,
        email: `${session.vault}@vault`, // setting an actual email is pointless
    });

    req.app.locals.vault.migration_log.create({
        vaultId: session.vault,
        legacyId: legacy.accountId,
        accountId: evol_acc.accountId,
        ip: req.app.locals.sequelize.vault.fn("INET6_ATON", req.ip),
    });

    // immediately claim it
    await req.app.locals.vault.claimed_game_accounts.create({
        accountId: evol_acc.accountId,
        vaultId: session.vault,
    });

    // now add it to the evol cache
    const cache_key = session.gameAccounts.push({
        name: evol_acc.userid,
        accountId: evol_acc.accountId,
        chars: [],
    }) - 1;

    legacy.revoltId = evol_acc.accountId; // update legacy cache
    await req.app.locals.legacy.login.update({ // update sql
        revoltId: evol_acc.accountId,
    }, {where: {
        accountId: legacy.accountId,
    }});

    // XXX: ideally we should be using createBulk but we also want to update
    for (const [num, char] of legacy.chars.entries()) {
        if (char.revoltId) {
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
                sex: char.sex === "F" ? "F" : (char.sex === "M" ? "M" : "U"), // non-binary is undefined in evol
            });
        } catch (err) {
            // char.name has a UNIQUE constraint but an actual collision would never happen
            console.error(err);
            continue;
        }

        // remove the name reservation
        req.app.locals.evol.char_reservation.destroy({
            where: { name: char.name }
        });

        // update the evol cache
        session.gameAccounts[cache_key].chars.push({
            name: evol_char.name,
            charId: evol_char.charId,
            level: 1,
            sex: evol_char.sex,
        });

        char.revoltId = evol_char.charId; // update legacy cache
        await req.app.locals.legacy.char.update({ // update sql
            revoltId: evol_char.charId,
        }, {where: {
            charId: char.charId,
        }});
    }

    // TODO: try/catch each of the await operations

    res.status(200).json({
        status: "success",
        account: session.gameAccounts[cache_key],
    });

    req.app.locals.logger.info(`Vault.legacy.account: migrated Legacy account ${legacy.accountId} {${session.vault}} [${req.ip}]`);
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
