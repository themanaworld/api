"use strict";
const uuidv4 = require("uuid/v4");
const nodemailer = require("nodemailer");
const Claim = require("../utils/claim.js");
const Session = require("../types/Session.js");
const game_accounts = require("../utils/game_accounts.js");
const validate = require("../utils/validate.js");
const Identity = require("../types/Identity.js");

let transporter = nodemailer.createTransport({
    sendmail: true,
    newline: 'unix',
    path: '/usr/sbin/sendmail'
});

const delete_session = async (req, res) => {
    let token, session;

    try {
        [token, session] = validate.get_session(req, res);
    } catch { return } // already handled

    req.app.locals.cooldown(1e4); // cooldown no matter what

    if (session === null) {
        // session is already expired
        res.status(200).json({
            status: "success",
        });
        return;
    }

    req.app.locals.vault.login_log.create({
        userId: session.vault,
        action: "LOGOUT",
        ip: req.ip,
    });

    req.app.locals.session.delete(token);

    console.log(`Vault.session: invalidating session ${token} (logout) [${req.ip}]`);

    res.status(200).json({
        status: "success",
    });
};

const auth_session = async (req, res) => {
    let token, session;

    try {
        [token, session] = validate.get_raw_session(req, res);
    } catch { return } // already handled

    if (session === null) {
        res.status(410).json({
            status: "error",
            error: "session expired",
            session: {
                expires: 0,
                identity: null,
            }
        });

        // max 3 attempts per 15 minutes
        if (req.app.locals.brute.consume(req, 3, 9e5)) {
            req.app.locals.cooldown(req, 1e3);
        } else {
            req.app.locals.logger.warn(`Vault.session: authentication request flood [${req.ip}]`);
            req.app.locals.cooldown(req, 3.6e6);
        }
        return;
    }

    if (!validate.check_ip(req, session)) {
        res.status(403).json({
            status: "error",
            error: "ip address mismatch",
            session: {
                expires: 0,
                identity: null,
            }
        });

        console.warn(`Vault.session: ip address mismatch <${session.vault}@vault> [${req.ip}]`);
        req.app.locals.cooldown(req, 5e3);
        return;
    }

    if (session.authenticated === true) {
        // already authed, tell client
        res.status(200).json({
            status: "success",
            session,
        });
        req.app.locals.cooldown(req, 500);
        return;
    }

    let email;
    try {
        email = validate.get_email(req, res);
    } catch { return } // already handled

    if (email !== session.email) {
        res.status(410).json({
            status: "error",
            error: "session expired",
            session: {
                expires: 0,
                identity: null,
            }
        });

        // max 3 attempts per 15 minutes
        if (req.app.locals.brute.consume(req, 3, 9e5)) {
            req.app.locals.cooldown(req, 1e3);
        } else {
            req.app.locals.logger.warn(`Vault.session: authentication request flood [${req.ip}]`);
            req.app.locals.cooldown(req, 3.6e6);
        }
        return;
    }

    if (session.vault === null && session.identity === null) {
        // this is a new account
        const user = await req.app.locals.vault.login.create({});

        req.app.locals.vault.login_log.create({
            userId: user.id,
            action: "CREATE",
            ip: req.ip,
        });

        /** @type {Identity} */
        const ident = await req.app.locals.vault.identity.create({
            userId: user.id,
            email: session.email,
        });

        req.app.locals.vault.identity_log.create({
            userId: user.id,
            identityId: ident.id,
            action: "ADD",
            ip: req.ip,
        });

        user.primaryIdentity = ident.id;
        await user.save();

        req.app.locals.logger.info(`Vault.session: created a new Vault account <${user.id}@vault> [${req.ip}]`);
        await Claim.claim_accounts(req, session.email, user.id, session);

        // update current session
        session.vault = user.id;
        session.identity = ident;
        session.primaryIdentity = ident;
        session.allowNonPrimary = user.allowNonPrimary;
        session.strictIPCheck = user.strictIPCheck;
        session.identities.push(ident);
    } else {
        if (session.identity !== session.primaryIdentity && !session.allowNonPrimary) {
            // unexpected: a session was created when it shouldn't have been
            res.status(403).json({
                status: "error",
                error: "illegal identity"
            });

            console.error(`Vault.session: dangling session [${req.ip}]`);
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
        console.info(`Vault.session: accepted login <${session.vault}@vault> [${req.ip}]`);
    }

    req.app.locals.cooldown(req, 6e4);

    // pre-cache the accounts and chars in the session cache
    await game_accounts.get_legacy(req, session);
    await game_accounts.get_evol(req, session);

    // authenticate this session
    session.authenticated = true;

    req.app.locals.vault.login_log.create({
        userId: session.vault,
        action: "LOGIN",
        ip: req.ip,
    });

    if (session.identity !== session.primaryIdentity) {
        // user did not log in with their primary identity
        if (session.primaryIdentity === null || session.primaryIdentity === undefined) {
            // the vault account has no primary identity (bug): let's fix this
            console.warn(`Vault.session: fixing account with a deleted primary identity <${session.vault}@vault> [${req.ip}]`);
            await req.app.locals.vault.login.update({
                primaryIdentity: session.identity.id,
            }, {where: {
                id: session.vault,
            }});
            session.primaryIdentity = session.identity;
        } else {
            transporter.sendMail({
                from: process.env.VAULT__MAILER__FROM,
                to: session.primaryIdentity.email,
                subject: "The Mana World security notice",
                text: "Someone has logged in to your Vault account using an email address that " +
                        "is not your primary address. If this wasn't you, please contact us immediately.\n\n" +
                        "To stop receiving login notices, use your primary email address when logging in."
            }, (err, info) => {});
        }
    }

    // immediately change the session uuid
    const new_uuid = uuidv4();
    req.app.locals.session.set(new_uuid, session);
    req.app.locals.session.delete(token); // revoke the old uuid

    res.status(200).json({
        status: "success",
        session: {
            key: new_uuid,
            secret: session.secret, // give them the session secret (only shared once)
            expires: session.expires,
            identity: session.identity.id,
        },
    });
};

const new_session = async (req, res, next) => {
    let email;
    try {
        email = validate.get_email(req, res);
    } catch { return } // already handled

    /** @type {Identity} */
    const identity = await req.app.locals.vault.identity.findOne({where: {email: email}});

    if (identity === null) {
        // never logged in with this email address
        const confirm = validate.get_prop(req, "confirm");

        if (confirm) {
            // account creation request
            let uuid;
            do { // avoid collisions
                uuid =  uuidv4();
            } while (req.app.locals.session.get(uuid));

            const session = new Session(req.ip, email);
            req.app.locals.session.set(uuid, session);

            console.log(`Vault.session: starting account creation process [${req.ip}]`);

            if (process.env.NODE_ENV === "development") {
                console.log(`uuid: ${uuid}`);
            } else {
                transporter.sendMail({
                    from: process.env.VAULT__MAILER__FROM,
                    to: email,
                    subject: "The Mana World account creation",
                    text: "You are receiving this email because someone (you?) has requested to link your email address "+
                           "to a new TMW Vault account.\nIf you did not initiate this process, please ignore this email.\n\n"+
                           "To confirm, use this link:\n" + `${process.env.VAULT__URL__AUTH}${uuid}`
                }, (err, info) => {});
            }

            res.status(200).json({
                status: "success"
            });

            // max 5 attempts per 15 minutes
            if (req.app.locals.brute.consume(req, 5, 9e5)) {
                req.app.locals.cooldown(req, 6e4);
            } else {
                req.app.locals.logger.warn(`Vault.session: account creation request flood [${req.ip}]`);
                req.app.locals.cooldown(req, 3.6e6);
            }
            return;
        } else {
            res.status(202).json({
                status: "pending",
            });

            // max 5 attempts per 15 minutes
            if (req.app.locals.brute.consume(req, 5, 9e5)) {
                req.app.locals.cooldown(req, 1e3);
            } else {
                req.app.locals.logger.warn(`Vault.session: email check flood [${req.ip}]`);
                req.app.locals.cooldown(req, 3.6e6);
            }
            return;
        }
    } else {
        const account = await req.app.locals.vault.login.findByPk(identity.userId);
        if (account === null) {
            // unexpected: the account was deleted but not its identities
            console.log(`Vault.session: removing dangling identity [${req.ip}]`);
            await identity.destroy();
            res.status(409).json({
                status: "error",
                error: "data conflict",
            });
            req.app.locals.cooldown(req, 3e5);
            return;
        } else {
            /** @type {Identity} */
            let primary = null;

            if (identity.id !== account.primaryIdentity) {
                try {
                    primary = await req.app.locals.vault.identity.findByPk(account.primaryIdentity);
                } catch {}
            } else {
                primary = identity;
            }

            // auth flow
            if (primary === null) {
                // the vault account has no primary identity (bug): let's fix this
                console.warn(`Vault.session: fixing account with no primary identity <${account.id}@vault> [${req.ip}]`);
                account.primaryIdentity = identity.id;
                primary = identity;
                await account.save();
            } else if (identity.id !== primary.id && !account.allowNonPrimary) {
                res.status(423).json({
                    status: "error",
                    error: "non-primary login is disabled",
                });
                req.app.locals.cooldown(5e3);
                return;
            }

            // TODO: if account has WebAuthn do WebAuthn authentication flow

            let uuid;
            do { // avoid collisions
                uuid =  uuidv4();
            } while (req.app.locals.session.get(uuid));

            const session = new Session(req.ip, email);
            session.vault = account.id;
            session.primaryIdentity = primary;
            session.allowNonPrimary = account.allowNonPrimary;
            session.strictIPCheck = account.strictIPCheck;
            session.identity = identity;
            req.app.locals.session.set(uuid, session);

            console.log(`Vault.session: starting authentication with identity ${identity.id} [${req.ip}]`);

            if (process.env.NODE_ENV === "development") {
                console.log(`uuid: ${uuid}`);
            } else {
                transporter.sendMail({
                    from: process.env.VAULT__MAILER__FROM,
                    to: email,
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
