"use strict";
const EvolAccount = require("../../types/EvolAccount.js");

const regexes = {
    token: /^[a-zA-Z0-9-_]{6,128}$/, // UUID
    any30: /^[^\s][^\t\r\n]{6,28}[^\s]$/, // herc password (this looks scary)
    alnum23: /^[a-zA-Z0-9_]{4,23}$/, // mostly for username
    gid: /^[23][0-9]{6}$/, // account id
};

const get_accounts = async (req, res, next) => {
    const token = String(req.get("X-VAULT-SESSION") || "");

    if (!token.match(regexes.token)) {
        res.status(400).json({
            status: "error",
            error: "missing session key",
        });
        req.app.locals.logger.warn(`Vault.evol.account: blocked an attempt to bypass authentication [${req.ip}]`);
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
        req.app.locals.logger.warn(`Vault.evol.account: blocked an attempt to bypass authentication [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    res.status(200).json({
        status: "success",
        accounts: session.gameAccounts,
    });

    req.app.locals.cooldown(req, 1e3);
};

const new_account = async (req, res, next) => {
    const token = String(req.get("X-VAULT-SESSION") || "");

    if (!token.match(regexes.token)) {
        res.status(400).json({
            status: "error",
            error: "missing session key",
        });
        req.app.locals.logger.warn(`Vault.evol.account: blocked an attempt to bypass authentication [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    if (!req.body ||
        !Reflect.has(req.body, "username") || !Reflect.has(req.body, "password") ||
        !req.body.username.match(regexes.alnum23) ||
        !req.body.password.match(regexes.any30)) { // FIXME: this is unsafe: can cause a promise rejection if something else than a string is passed (no Number.match() exists)
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
        req.app.locals.logger.warn(`Vault.evol.account: blocked an attempt to bypass authentication [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    // this check is necessary because login.userid has no UNIQUE constraint
    const existing = await req.app.locals.evol.login.findOne({
        where: {userid: req.body.username}
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
        userid: req.body.username,
        userPass: req.body.password,
        email: `${session.vault}@vault`, // setting an actual email is pointless
    });

    req.app.locals.vault.account_log.create({
        vaultId: session.vault,
        accountType: "EVOL",
        actionType: "CREATE",
        accountId: evol_acc.accountId,
        ip: req.app.locals.sequelize.vault.fn("INET6_ATON", req.ip),
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
    const token = String(req.get("X-VAULT-SESSION") || "");

    if (!token.match(regexes.token)) {
        res.status(400).json({
            status: "error",
            error: "missing session key",
        });
        req.app.locals.logger.warn(`Vault.evol.account: blocked an attempt to bypass authentication [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    if (!req.body || !Reflect.has(req.body, "accountId") ||
        !String(req.body.accountId).match(regexes.gid) || !(
        (Reflect.has(req.body, "username") && req.body.username.match(regexes.alnum23)) ||
        (Reflect.has(req.body, "password") && req.body.password.match(regexes.any30)))) { // FIXME: this is unsafe: can cause a promise rejection if something else than a string is passed (no Number.match() exists)
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
        req.app.locals.logger.warn(`Vault.evol.account: blocked an attempt to bypass authentication [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    let account = null;
    for (const acc of session.gameAccounts) {
        if (acc.accountId === req.body.accountId) {
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
    if (Reflect.has(req.body, "username")) {
        // check if the name exists
        const existing = await req.app.locals.evol.login.findOne({
            where: {userid: req.body.username}
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
            userid: req.body.username,
        };
        account.name  = req.body.username;
        req.app.locals.logger.info(`Vault.evol.account: changed username of game account ${account.accountId} <${session.vault}@vault> [${req.ip}]`);
        req.app.locals.vault.account_log.create({
            vaultId: session.vault,
            accountType: "EVOL",
            actionType: "UPDATE",
            details: "username",
            accountId: account.accountId,
            ip: req.app.locals.sequelize.vault.fn("INET6_ATON", req.ip),
        });
    } else {
        update_fields = {
            userPass: req.body.password,
        };
        req.app.locals.logger.info(`Vault.evol.account: changed password of game account ${account.accountId} <${session.vault}@vault> [${req.ip}]`);
        req.app.locals.vault.account_log.create({
            vaultId: session.vault,
            accountType: "EVOL",
            actionType: "UPDATE",
            details: "password",
            accountId: account.accountId,
            ip: req.app.locals.sequelize.vault.fn("INET6_ATON", req.ip),
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
