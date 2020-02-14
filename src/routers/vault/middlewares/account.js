"use strict";

const regexes = {
    token: /^[a-zA-Z0-9-_]{6,128}$/, // UUID
};

const get_data = async (req, res, next) => {
    const token = String(req.get("X-VAULT-SESSION") || "");

    if (!token.match(/^[a-zA-Z0-9-_]{6,128}$/)) {
        res.status(400).json({
            status: "error",
            error: "missing session key",
        });
        req.app.locals.logger.warn(`Vault.account: blocked an attempt to bypass authentication [${req.ip}]`);
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
        req.app.locals.logger.warn(`Vault.account: blocked an attempt to bypass authentication [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    res.status(200).json({
        status: "success",
        data: {
            primaryIdentity: session.primaryIdentity,
            allowNonPrimary: session.allowNonPrimary,
        },
    });
    req.app.locals.cooldown(req, 1e3);
};

const update_account = async (req, res, next) => {
    const token = String(req.get("X-VAULT-SESSION") || "");

    if (!token.match(regexes.token)) {
        res.status(400).json({
            status: "error",
            error: "missing session key",
        });
        req.app.locals.logger.warn(`Vault.account: blocked an attempt to bypass authentication [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    if (!req.body || !Reflect.has(req.body, "primary") || !Reflect.has(req.body, "allow") ||
        !Number.isInteger(req.body.primary)) {
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
        req.app.locals.logger.warn(`Vault.account: blocked an attempt to bypass authentication [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    const update_fields = {};

    if (session.primaryIdentity !== req.body.primary) {
        // update primary identity
        let new_primary = null;

        for (const ident of session.identities) {
            if (ident.id === req.body.primary) {
                new_primary = ident.id;
                break;
            }
        }

        if (new_primary === null) {
            res.status(404).json({
                status: "error",
                error: "not owned by you",
            });
            req.app.locals.logger.warn(`Vault.account: blocked an attempt to bypass authentication [${req.ip}]`);
            req.app.locals.cooldown(req, 3e5);
        }

        update_fields.primaryIdentity = new_primary;
    }
    if (session.allowNonPrimary !== !!req.body.allow) {
        // update allow non-primary
        update_fields.allowNonPrimary = !!req.body.allow;
    }

    // update SQL
    if (Object.keys(update_fields).length) {
        await req.app.locals.vault.login.update(update_fields, {
            where: { id: session.vault }
        });
    }

    // now update our cache
    session.allowNonPrimary = !!req.body.allow;
    session.primaryIdentity = +req.body.primary;

    for (const ident of session.identities) {
        if (ident.id === session.primaryIdentity) {
            ident.primary = true;
        } else if (ident.primary === true) {
            ident.primary = false;
        }
    }

    res.status(200).json({
        status: "success",
    });

    req.app.locals.cooldown(req, 1e3);
};

module.exports = exports = async (req, res, next) => {
    switch(req.method) {
        case "GET":
            // get account data
            return await get_data(req, res, next);
        case "PATCH":
            // change account data
            return await update_account(req, res, next);
        default:
            next(); // fallthrough to default endpoint (404)
    }
};
