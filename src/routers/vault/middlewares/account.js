"use strict";
const validate = require("../utils/validate.js");
const Session = require("../types/Session.js");

const get_data = async (req, res, next) => {
    /** @type {Session} */
    let session;

    try {
        [, session] = validate.get_session(req, res);
    } catch { return } // already handled

    res.status(200).json({
        status: "success",
        data: session.getAccountData(),
    });
    req.app.locals.cooldown(req, 1e3);
};

const update_account = async (req, res, next) => {
    let session;

    try {
        [, session] = validate.get_session(req, res);
    } catch { return } // already handled

    const data = {
        primary:  +validate.get_prop(req, "primary"),
        allow:     validate.get_prop(req, "allow") === "true",
        strict:    validate.get_prop(req, "strict") === "true",
        2fa:       validate.get_prop(req, "2fa") === "true",
    };

    const update_fields = {};

    if (session.primaryIdentity.id !== data.primary) {
        // update primary identity
        let new_primary = null;

        for (const ident of session.identities) {
            if (ident.id === data.primary) {
                new_primary = ident.id;
                session.primaryIdentity = ident;
                break;
            }
        }

        if (new_primary === null) {
            res.status(404).json({
                status: "error",
                error: "not owned by you",
            });
            req.app.locals.cooldown(req, 3e5);
        }

        update_fields.primaryIdentity = new_primary;
    }
    if (session.allowNonPrimary !== data.allow) {
        // update allow non-primary
        update_fields.allowNonPrimary = data.allow;
    }
    if (session.strictIPCheck !== data.strict) {
        // update allow non-primary
        update_fields.strictIPCheck = data.strict;
    }
    if (session.allow2FA !== data.2fa) {
        // update allow 2FA auth
        update_fields.allow2FA = data.2fa;
    }

    // update SQL
    if (Object.keys(update_fields).length) {
        await req.app.locals.vault.login.update(update_fields, {
            where: { id: session.vault }
        });
    }

    // now update our cache
    session.allowNonPrimary = data.allow;
    session.strictIPCheck = data.strict;
    session.allow2FA = data.allow2FA;

    for (const ident of session.identities) {
        if (ident.id === session.primaryIdentity.id) {
            ident.isPrimary = true;
            session.primaryIdentity = ident;
        } else if (ident.isPrimary === true) {
            ident.isPrimary = false;
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
