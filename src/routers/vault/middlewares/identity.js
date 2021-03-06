"use strict";
const nodemailer = require("nodemailer");
const Claim = require("../utils/claim.js");
const validate = require("../utils/validate.js");
const Identity = require("../types/Identity.js");
const Session = require("../types/Session.js");

let transporter = nodemailer.createTransport({
    sendmail: true,
    newline: 'unix',
    path: '/usr/sbin/sendmail'
});

const get_identities = async (req, res, next) => {
    let session;

    try {
        [, session] = validate.get_session(req, res);
    } catch { return } // already handled

    if (session.identities.length === 0) {
        console.info(`Vault.identity: fetching identities <${session.vault}@vault> [${req.ip}]`);
        /** @type {Identity[]} */
        const rows = await req.app.locals.vault.identity.findAll({
            where: {userId: session.vault}
        });

        for (const ident of rows) {
            ident.isPrimary = session.primaryIdentity.id === ident.id;
            session.identities.push(ident);
        }
    }

    res.status(200).json({
        status: "success",
        identities: session.identities, // cached in the session
    });
    req.app.locals.cooldown(req, 1e3);
};

const add_identity = async (req, res, next) => {
    const token = String(req.get("X-VAULT-SESSION") || "");
    const secret = String(req.get("X-VAULT-TOKEN") || "");

    if (token === "" && secret !== "") {
        if (!secret.match(validate.regexes.uuid)) {
            res.status(400).json({
                status: "error",
                error: "missing secret",
            });
            req.app.locals.cooldown(req, 5e3);
            return;
        }

        // TODO: make an IdentityStore type similar to SessionStore and get rid of Ephemeral
        const ident = req.app.locals.identity_pending.get(secret);

        let email;
        try {
            email = validate.get_email(req, res);
        } catch { return } // already handled

        if (ident === null || ident === undefined || ident.email !== email) {
            res.status(410).json({
                status: "error",
                error: "token has expired",
            });

            // max 3 attempts per 15 minutes
            if (req.app.locals.brute.consume(req, 3, 9e5)) {
                req.app.locals.cooldown(req, 15e3);
            } else {
                req.app.locals.logger.warn(`Vault.identity: validation request flood [${req.ip}]`);
                req.app.locals.cooldown(req, 3.6e6);
            }
            return;
        }

        /** @type {Identity} */
        const newIdent = await req.app.locals.vault.identity.create({
            userId: ident.vault,
            email: ident.email,
        });

        req.app.locals.vault.identity_log.create({
            userId: ident.vault,
            identityId: newIdent.id,
            action: "ADD",
            ip: req.ip,
        });

        await Claim.claim_accounts(req, ident.email, ident.vault);

        /** @type {Session} */
        let session = null;
        for (const [, sess] of req.app.locals.session) {
            if (sess.vault === ident.vault && sess.authenticated) {
                sess.identities.push(newIdent);
                session = sess;
                break;
            }
        }

        req.app.locals.identity_pending.delete(secret);

        if (session !== null) {
            console.info(`Vault.identity: added a new identity <${session.vault}@vault> [${req.ip}]`);
        } else {
            console.info(`Vault.identity: added a new identity [${req.ip}]`);
        }

        res.status(201).json({
            status: "success",
            identity: newIdent,
        });
        req.app.locals.cooldown(req, 6e4);
        return;
    }

    // request to add

    let session, email;

    try {
        [, session] = validate.get_session(req, res);
        email = validate.get_email(req, res);
    } catch { return } // already handled

    for (const [, pending] of req.app.locals.identity_pending) {
        if (pending.vault === session.vault && pending.email === email) {
            res.status(425).json({
                status: "error",
                error: "already pending",
            });
            req.app.locals.cooldown(req, 60e4);
            return;
        }
    }

    if (session.identities.length === 0) {
        // we did not have enough time to fetch, so cowardly refuse
        res.status(409).json({
            status: "error",
            error: "already assigned",
        });
        req.app.locals.cooldown(req, 5e3);
        return;
    } else if (session.identities.length >= 20) {
        res.status(416).json({
            status: "error",
            error: "too many identities",
        });
        req.app.locals.cooldown(req, 3e4);
        return;
    }

    /** @type {Identity} */
    let find = null;

    for (const ident of session.identities) {
        if (ident.email === email) {
            find = ident;
            break;
        }
    }

    if (find === null) {
        find = await req.app.locals.vault.identity.findOne({
            where: {email}
        });
    }

    if (find !== null) {
        res.status(409).json({
            status: "error",
            error: "already assigned",
        });
        req.app.locals.cooldown(req, 5e3);
        return;
    }

    let uuid;
    do { // avoid collisions
        uuid = await Session.generateToken();
    } while (req.app.locals.session.get(uuid));

    req.app.locals.identity_pending.set(uuid, {
        ip: req.ip,
        vault: session.vault,
        email: email,
    });

    console.log(`Vault.session: starting identity validation <${session.vault}@vault> [${req.ip}]`);

    if (process.env.NODE_ENV === "development") {
        if (process.env.VAULT__BYPASS_LOGIN === "bypass") {
            // don't require copy-pasting the uuid
            res.status(200).json({
                status: "success",
                key: uuid,
            });
        } else {
            console.log(`uuid: ${uuid}`);
        }
        return;
    } else {
        // TODO: limit total number of emails that can be dispatched by a single ip in an hour
        transporter.sendMail({
            from: process.env.VAULT__MAILER__FROM,
            to: email,
            subject: "The Mana World identity validation",
            text: "You are receiving this email because someone (you?) has requested to link your email address "+
                   "to a TMW Vault account.\nIf you did not initiate this process, please ignore this email.\n\n"+
                   "To confirm, use this link:\n" + `${process.env.VAULT__URL__IDENTITY}${uuid}`
        }, (err, info) => {});
    }

    res.status(200).json({
        status: "success"
    });
    // TODO: split request and validation so that request has a cooldown of 6e4
    req.app.locals.cooldown(req, 5e3);
};

module.exports = exports = async (req, res, next) => {
    switch(req.method) {
        case "GET":
            // list identities
            return await get_identities(req, res, next);
        case "POST":
            // add identity
            return await add_identity(req, res, next);
        case "DELETE":
            // TODO: remove an identity
            //return await drop_identity(req, res, next);
        default:
            next(); // fallthrough to default endpoint (404)
    }
};
