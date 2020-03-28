"use strict";
const EvolAccount = require("../../types/EvolAccount.js");
const validate = require("../../utils/validate.js");

const get_accounts = async (req, res, next) => {
    let session;

    try {
        [, session] = validate.get_session(req, res);
    } catch { return } // already handled

    res.status(200).json({
        status: "success",
        accounts: session.gameAccounts,
    });

    req.app.locals.cooldown(req, 1e3);
};

const new_account = async (req, res, next) => {
    let session;

    try {
        [, session] = validate.get_session(req, res);
    } catch { return } // already handled

    const data = {
        username: validate.get_prop(req, "username", validate.regexes.alnum23),
        password: validate.get_prop(req, "password", validate.regexes.any30),
    };

    if (!data.username || !data.password) {
        res.status(400).json({
            status: "error",
            error: "invalid format",
        });
        req.app.locals.cooldown(req, 5e3);
        return;
    }

    // this check is necessary because login.userid has no UNIQUE constraint
    const existing = await req.app.locals.evol.login.findOne({
        where: {userid: data.username}
    });

    if (existing !== null) {
        res.status(409).json({
            status: "error",
            error: "already exists",
        });
        req.app.locals.cooldown(1e3);
        return;
    }

    const evol_acc = await req.app.locals.evol.login.create({
        userid: data.username,
        userPass: data.password,
        email: `${session.vault}@vault`, // setting an actual email is pointless
    });

    req.app.locals.vault.account_log.create({
        vaultId: session.vault,
        accountType: "EVOL",
        actionType: "CREATE",
        accountId: evol_acc.accountId,
        ip: req.ip,
    });

    // immediately claim it
    await req.app.locals.vault.claimed_game_accounts.create({
        accountId: evol_acc.accountId,
        vaultId: session.vault,
    });

    // now add it to the evol cache
    const account = new EvolAccount(evol_acc.accountId, evol_acc.userid);
    session.gameAccounts.push(account);

    req.app.locals.logger.info(`Vault.evol.account: created a new game account: ${account.accountId} <${session.vault}@vault> [${req.ip}]`);

    res.status(200).json({
        status: "success",
        account,
    });

    req.app.locals.cooldown(5e3);
};

const update_account = async (req, res, next) => {
    let session;

    try {
        [, session] = validate.get_session(req, res);
    } catch { return } // already handled

    const data = {
        accountId: +validate.get_prop(req, "accountId", validate.regexes.gid),
        username:   validate.get_prop(req, "username", validate.regexes.alnum23),
        password:   validate.get_prop(req, "password", validate.regexes.any30),
    };

    if (!data.username && !data.password) {
        res.status(400).json({
            status: "error",
            error: "invalid format",
        });
        req.app.locals.cooldown(req, 5e3);
        return;
    }

    let account = null;
    for (const acc of session.gameAccounts) {
        if (acc.accountId === data.accountId) {
            account = acc;
            break;
        }
    }

    if (account === null) {
        res.status(404).json({
            status: "error",
            error: "account not found",
        });
        req.app.locals.logger.warn(`Vault.evol.account: blocked an attempt to modify a game account not owned by the user <${session.vault}@vault> [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    let update_fields = {};
    if (data.username) {
        // check if the name exists
        const existing = await req.app.locals.evol.login.findOne({
            where: {userid: data.username}
        });

        if (existing !== null) {
            res.status(409).json({
                status: "error",
                error: "already exists",
            });
            req.app.locals.cooldown(req, 500);
            return;
        }

        update_fields = {
            userid: data.username,
        };
        account.userid  = data.username;
        req.app.locals.logger.info(`Vault.evol.account: changed username of game account ${account.accountId} <${session.vault}@vault> [${req.ip}]`);
        req.app.locals.vault.account_log.create({
            vaultId: session.vault,
            accountType: "EVOL",
            actionType: "UPDATE",
            details: "username",
            accountId: account.accountId,
            ip: req.ip,
        });
    } else {
        update_fields = {
            userPass: data.password,
        };
        req.app.locals.logger.info(`Vault.evol.account: changed password of game account ${account.accountId} <${session.vault}@vault> [${req.ip}]`);
        req.app.locals.vault.account_log.create({
            vaultId: session.vault,
            accountType: "EVOL",
            actionType: "UPDATE",
            details: "password",
            accountId: account.accountId,
            ip: req.ip,
        });
    }

    await req.app.locals.evol.login.update(update_fields, {where: {
        accountId: account.accountId,
    }});

    res.status(200).json({
        status: "success",
        account,
    });

    req.app.locals.cooldown(req, 5e3);
};

module.exports = exports = async (req, res, next) => {
    switch(req.method) {
        case "GET": // list accounts
            return await get_accounts(req, res, next);
        case "POST": // new account
            return await new_account(req, res, next);
        case "PATCH": // change username/password
            return await update_account(req, res, next);
        // TODO: PUT: move char
        // TODO: DELETE: delete account and related data
        default:
            next(); // fallthrough to default endpoint (404)
    }
};
