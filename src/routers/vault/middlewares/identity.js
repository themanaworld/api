"use strict";
const uuidv4 = require("uuid/v4");
const nodemailer = require("nodemailer");
const Claim = require("../utils/claim.js");

let transporter = nodemailer.createTransport({
    sendmail: true,
    newline: 'unix',
    path: '/usr/sbin/sendmail'
});

const get_identities = async (req, res, next) => {
    const token = String(req.get("X-VAULT-SESSION") || "");

    if (!token.match(/^[a-zA-Z0-9-_]{6,128}$/)) {
        res.status(400).json({
            status: "error",
            error: "missing session key",
        });
        req.app.locals.logger.warn(`Vault.identity: blocked an attempt to bypass authentication [${req.ip}]`);
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
        req.app.locals.logger.warn(`Vault.identity: blocked an attempt to bypass authentication [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    if (session.identities.length === 0) {
        console.info(`Vault.identity: fetching identities {${session.vault}} [${req.ip}]`);
        const rows = await req.app.locals.vault.identity.findAll({
            where: {userId: session.vault}
        });

        for (const row of rows) {
            session.identities.push({
                // TODO: make this a class!
                id: row.id,
                email: row.email,
                added: row.addedDate,
                primary: session.primaryIdentity === row.id,
            });
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
    const validate = String(req.get("X-VAULT-TOKEN") || "");

    if (token === "" && validate !== "") {
        if (!validate.match(/^[a-zA-Z0-9-_]{6,128}$/)) {
            res.status(400).json({
                status: "error",
                error: "missing token",
            });
            req.app.locals.cooldown(req, 5e3);
            return;
        }

        const ident = req.app.locals.identity_pending.get(validate);

        if (ident === null || ident === undefined) {
            res.status(410).json({
                status: "error",
                error: "token has expired",
            });
            req.app.locals.cooldown(req, 15e3);
            return;
        }

        const newIdent = await req.app.locals.vault.identity.create({
            userId: ident.vault,
            email: ident.email,
        });

        req.app.locals.vault.identity_log.create({
            userId: ident.vault,
            identityId: newIdent.id,
            action: "ADD",
            ip: req.app.locals.sequelize.vault.fn("INET6_ATON", req.ip),
        });

        await Claim.claim_accounts(req, ident.email, ident.vault);

        let session = null;
        for (const [key, sess] of req.app.locals.session) {
            if (sess.vault === ident.vault && sess.authenticated) {
                sess.identities.push({
                    // TODO: make this a class!
                    id: newIdent.id,
                    email: newIdent.email,
                    added: newIdent.addedDate,
                    primary: false,
                });
                session = sess;
                break;
            }
        }

        req.app.locals.identity_pending.delete(validate);

        if (session !== null) {
            console.info(`Vault.identity: added a new identity {${session.vault}} [${req.ip}]`);
        } else {
            console.info(`Vault.identity: added a new identity [${req.ip}]`);
        }

        res.status(201).json({
            status: "success",
        });
        req.app.locals.cooldown(req, 6e4);
        return;
    }

    // request to add

    if (!token.match(/^[a-zA-Z0-9-_]{6,128}$/)) {
        res.status(400).json({
            status: "error",
            error: "missing session key",
        });
        req.app.locals.logger.warn(`Vault.identity: blocked an attempt to bypass authentication [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    if (!req.body || !Reflect.has(req.body, "email") ||
        !req.body.email.match(/^(?:[a-zA-Z0-9.$&+=_~-]{1,255}@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,255}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,255}[a-zA-Z0-9])?){1,9})$/) ||
        req.body.email.length >= 320) {
        res.status(400).json({
            status: "error",
            error: "invalid email address",
        });
        req.app.locals.cooldown(req, 1e3);
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
        req.app.locals.logger.warn(`Vault.identity: blocked an attempt to bypass authentication [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    for (const [key, pending] of req.app.locals.identity_pending) {
        if (pending.vault === session.vault && pending.email === req.body.email) {
            res.status(425).json({
                status: "error",
                error: "already pending",
            });
            req.app.locals.cooldown(req, 60e4);
            return;
        }
    }

    const find = await req.app.locals.vault.identity.findOne({
        where: {email: req.body.email}
    });

    if (find !== null) {
        res.status(409).json({
            status: "error",
            error: "already assigned",
        });
        req.app.locals.cooldown(req, 5e3);
        return;
    }

    const count = await req.app.locals.vault.identity.count({
        where: {userId: session.vault}
    });

    if (count >= 20) {
        res.status(416).json({
            status: "error",
            error: "too many identities",
        });
        req.app.locals.cooldown(req, 3e4);
        return;
    }

    const uuid = uuidv4();
    req.app.locals.identity_pending.set(uuid, {
        ip: req.ip,
        vault: session.vault,
        email: req.body.email,
    });

    console.log(`Vault.session: starting identity validation {${session.vault}} [${req.ip}]`);

    if (process.env.NODE_ENV === "development") {
        console.log(`uuid: ${uuid}`);
    } else {
        // TODO: limit total number of emails that can be dispatched by a single ip in an hour
        transporter.sendMail({
            from: process.env.VAULT__MAILER__FROM,
            to: req.body.email,
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

const update_identity = async (req, res, next) => {
    // TODO
};

const drop_identity = async (req, res, next) => {
    // TODO
};

module.exports = exports = async (req, res, next) => {
    switch(req.method) {
        case "GET":
            // list identities
            return await get_identities(req, res, next);
        case "POST":
            // add identity
            return await add_identity(req, res, next);
        case "PATCH":
            // set as primary
            //return await update_identity(req, res, next);
        case "DELETE":
            // remove an identity
            //return await drop_identity(req, res, next);
        default:
            next(); // fallthrough to default endpoint (404)
    }
};
