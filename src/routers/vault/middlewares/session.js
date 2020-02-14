"use strict";
const uuidv4 = require("uuid/v4");
const nodemailer = require("nodemailer");
const Claim = require("../utils/claim.js");
const Session = require("../types/Session.js");

let transporter = nodemailer.createTransport({
    sendmail: true,
    newline: 'unix',
    path: '/usr/sbin/sendmail'
});

const delete_session = async (req, res, next) => {
    const token = String(req.get("X-VAULT-SESSION") || "");

    if (!token.match(/^[a-zA-Z0-9-_]{6,128}$/)) {
        res.status(400).json({
            status: "error",
            error: "missing session key",
        });
        req.app.locals.logger.warn(`Vault.session: blocked an attempt to bypass authentication [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    const session = req.app.locals.session.get(token);
    req.app.locals.cooldown(1e4); // cooldown no matter what

    if (session === null || session === undefined) {
        // session is already expired
        res.status(200).json({
            status: "success",
        });
        return;
    }

    req.app.locals.vault.login_log.create({
        userId: session.vault,
        action: "LOGOUT",
        ip: req.app.locals.sequelize.vault.fn("INET6_ATON", req.ip),
    });

    req.app.locals.session.delete(token);

    console.log(`Vault.session: invalidating session ${token} (logout) [${req.ip}]`);

    res.status(200).json({
        status: "success",
    });
};

const auth_session = async (req, res, next) => {
    const token = String(req.get("X-VAULT-SESSION") || "");

    if (!token.match(/^[a-zA-Z0-9-_]{6,128}$/)) {
        res.status(400).json({
            status: "error",
            error: "missing session key",
        });
        req.app.locals.logger.warn(`Vault.session: blocked an attempt to bypass authentication [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        return;
    }

    const session = req.app.locals.session.get(token);

    if (session === null || session === undefined) {
        res.status(410).json({
            status: "error",
            error: "session expired",
            session: {
                expires: 0,
                identity: null,
            }
        });
        // don't log: this can get spammy
        req.app.locals.cooldown(req, 1e3);
        return;
    }

    if (session.authenticated === true) {
        // already authed, tell client
        res.status(200).json({
            status: "success",
            session: {
                expires: session.expires,
                identity: session.identity,
            }
        });
        req.app.locals.cooldown(req, 500);
        return;
    }

    if (session.vault === null && session.identity === null) {
        // this is a new account
        const user = await req.app.locals.vault.login.create({});

        req.app.locals.vault.login_log.create({
            userId: user.id,
            action: "CREATE",
            ip: req.app.locals.sequelize.vault.fn("INET6_ATON", req.ip),
        });

        const ident = await req.app.locals.vault.identity.create({
            userId: user.id,
            email: session.email,
        });

        req.app.locals.vault.identity_log.create({
            userId: user.id,
            identityId: ident.id,
            action: "ADD",
            ip: req.app.locals.sequelize.vault.fn("INET6_ATON", req.ip),
        });

        await req.app.locals.vault.identity.update({
            primaryIdentity: ident.id,
        }, {where: {
            id: user.id,
        }});

        req.app.locals.logger.info(`Vault.session: created a new Vault account {${user.id}} [${req.ip}]`);
        await Claim.claim_accounts(req, session.email, user.id, session);

        // update current session
        session.vault = user.id;
        session.identity = ident.id;
        session.primaryIdentity = ident.id;
        session.allowNonPrimary = user.allowNonPrimary;
        session.identities = [{
            // TODO: make this a class!
            email: ident.email,
            added: ident.addedDate,
            primary: true,
        }];
    } else {
        if (session.identity !== session.primaryIdentity && !session.allowNonPrimary) {
            // unexpected: a session was created when it shouldn't have been
            res.status(403).json({
                status: "error",
                error: "illegal identity"
            });
            req.app.locals.session.delete(token);
            req.app.locals.cooldown(req, 3e5);
            return;
        }

        // invalidate any active session
        for (const [key, sess] of req.app.locals.session) {
            if (sess.vault === session.vault && key !== token) {
                console.log(`Vault.session: invalidating token ${key}`);
                req.app.locals.session.delete(key);
            }
        }
        console.info(`Vault.session: accepted login {${session.vault}} [${req.ip}]`);
    }

    req.app.locals.cooldown(req, 6e4);

    // authenticate this session
    session.authenticated = true;

    req.app.locals.vault.login_log.create({
        userId: session.vault,
        action: "LOGIN",
        ip: req.app.locals.sequelize.vault.fn("INET6_ATON", req.ip),
    });

    if (session.identity !== session.primaryIdentity) {
        // user did not log in with their primary identity
        // TODO: allow to block logging in with non-primary identities
        const primary = await req.app.locals.vault.identity.findByPk(session.primaryIdentity);
        transporter.sendMail({
            from: process.env.VAULT__MAILER__FROM,
            to: primary.email,
            subject: "The Mana World security notice",
            text: "Someone has logged in to your Vault account using an email address that " +
                    "is not your primary address. If this wasn't you, please contact us immediately.\n\n" +
                    "To stop receiving login notices, use your primary email address when logging in."
        }, (err, info) => {});
    }

    // TODO: already cache the identities and accounts in the session

    res.status(200).json({
        status: "success",
        session: {
            expires: session.expires,
            identity: session.identity,
        }
    });
};

const new_session = async (req, res, next) => {
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

    const identity = await req.app.locals.vault.identity.findOne({where: {email: req.body.email}});

    if (identity === null) {
        // never logged in with this email address

        if (Reflect.has(req.body, "confirm") && req.body.confirm === true) {
            // account creation request
            const uuid = uuidv4();
            const session = new Session(req.ip, req.body.email);
            req.app.locals.session.set(uuid, session);

            console.log(`Vault.session: starting account creation process [${req.ip}]`);

            if (process.env.NODE_ENV === "development") {
                console.log(`uuid: ${uuid}`);
            } else {
                transporter.sendMail({
                    from: process.env.VAULT__MAILER__FROM,
                    to: req.body.email,
                    subject: "The Mana World account creation",
                    text: "You are receiving this email because someone (you?) has requested to link your email address "+
                           "to a new TMW Vault account.\nIf you did not initiate this process, please ignore this email.\n\n"+
                           "To confirm, use this link:\n" + `${process.env.VAULT__URL__AUTH}${uuid}`
                }, (err, info) => {});
            }

            res.status(200).json({
                status: "success"
            });
            req.app.locals.cooldown(req, 6e4);
            return;
        } else {
            res.status(202).json({
                status: "pending",
            });
            req.app.locals.cooldown(req, 1e3);
            return;
        }
    } else {
        const account = await req.app.locals.vault.login.findOne({where: {id: identity.userId}});
        if (account === null) {
            // unexpected: the account was deleted but not its identities
            await req.app.locals.vault.identity.destroy({where: {email: req.body.email}});
            res.status(409).json({
                status: "error",
                error: "data conflict",
            });
            req.app.locals.cooldown(req, 3e5);
            return;
        } else {
            // auth flow
            if (identity.id !== account.primaryIdentity && !account.allowNonPrimary) {
                res.status(423).json({
                    status: "error",
                    error: "non-primary login is disabled",
                });
                req.app.locals.cooldown(5e3);
                return;
            }

            // TODO: if account has WebAuthn do WebAuthn authentication flow

            const uuid = uuidv4();
            const session = new Session(req.ip, req.body.email);
            session.vault = account.id;
            session.primaryIdentity = account.primaryIdentity;
            session.allowNonPrimary = account.allowNonPrimary;
            session.identity = identity.id;
            req.app.locals.session.set(uuid, session);

            console.log(`Vault.session: starting authentication with identity ${identity.id} [${req.ip}]`);

            if (process.env.NODE_ENV === "development") {
                console.log(`uuid: ${uuid}`);
            } else {
                transporter.sendMail({
                    from: process.env.VAULT__MAILER__FROM,
                    to: req.body.email,
                    subject: "TMW Vault login",
                    text: `Here is your login link:\n${process.env.VAULT__URL__AUTH}${uuid}\n\n` +
                        "TMW staff members will never ask for your login link. Please do not " +
                        "share it with anyone."
                }, (err, info) => {});
            }

            res.status(200).json({
                status: "success"
            });
            req.app.locals.cooldown(req, 6e4);
        }
    }
};

module.exports = exports = async (req, res, next) => {
    switch(req.method) {
        case "GET":
            // authenticate a session
            return await auth_session(req, res, next);
        case "PUT":
            // request a new session
            return await new_session(req, res, next);
        case "DELETE":
            // explicit log out
            return await delete_session(req, res, next);
        default:
            next(); // fallthrough to default endpoint (404)
    }
};
