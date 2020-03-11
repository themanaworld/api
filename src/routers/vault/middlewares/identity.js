"use strict";
const uuidv4 = require("uuid/v4");
const nodemailer = require("nodemailer");
const Claim = require("../utils/claim.js");
const validate = require("../utils/validate.js");

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

        const ident = req.app.locals.identity_pending.get(secret);

        if (ident === null || ident === undefined) {
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

        req.app.locals.identity_pending.delete(secret);

        if (session !== null) {
            console.info(`Vault.identity: added a new identity <${session.vault}@vault> [${req.ip}]`);
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

    let session;

    try {
        [, session] = validate.get_session(req, res);
    } catch { return } // already handled

    let email;
    try {
        email = validate.get_email(req, res);
    } catch { return } // already handled

    for (const [key, pending] of req.app.locals.identity_pending) {
        if (pending.vault === session.vault && pending.email === email) {
            res.status(425).json({
                status: "error",
                error: "already pending",
            });
            req.app.locals.cooldown(req, 60e4);
            return;
        }
    }

    const find = await req.app.locals.vault.identity.findOne({
        where: {email}
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

    let uuid;
    do { // avoid collisions
        uuid =  uuidv4();
    } while (req.app.locals.session.get(uuid));

    req.app.locals.identity_pending.set(uuid, {
        ip: req.ip,
        vault: session.vault,
        email: email,
    });

    console.log(`Vault.session: starting identity validation <${session.vault}@vault> [${req.ip}]`);

    if (process.env.NODE_ENV === "development") {
        console.log(`uuid: ${uuid}`);
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
