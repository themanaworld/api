"use strict";
const Session = require("../types/Session.js");

/** thrown when the user attempts to bypass security measures */
class BypassAttempt extends Error {};
/** thrown when the received data does not match the expected format */
class ValidationError extends Error {};

/** the patterns used for parsing */
const regexes = {
    /** a Universally Unique Identifier */
    uuid: /^[0-9a-f]{8}(?:\-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i,
    /** tmwa password */
    any23: /^[^\s][^\t\r\n]{2,21}[^\s]$/,
    /** hercules password */
    any30: /^[^\s][^\t\r\n]{6,28}[^\s]$/,
    /** username */
    alnum23: /^\w{4,23}$/i,
    /** tmwa/hercules GID */
    gid: /^[23][0-9]{6}$/,
    /** RFC 5322 email, but must also have a TLD */
    email: /^(?:[a-zA-Z0-9.$&+=_~-]{1,255}@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,255}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,255}[a-zA-Z0-9])?){1,9})$/i,
};

/**
 * gets the name of the endpoint for pretty-printing
 * @param {Request} req
 * @returns {string} the pretty name
 */
const get_endpoint = req => `Vault.${req.path.slice(1).split("/").join(".")}`;

/**
 * log a bad action
 * @param {Request} req
 * @param {string} msg
 */
const warn = (req, msg) =>
    req.app.locals.logger.warn(`${get_endpoint(req)}: ${msg} [${req.ip}]`);

/**
 *  check the request ip against the session settings
 * @param {Request}
 * @param {Session} session
 * @returns {boolean} whether the ip is allowed to use this session
 */
const check_ip = (req, session) => !session.strictIPCheck || req.ip === session.ip;

/**
 * gets a property from the body or from the query
 * @param {Request} req
 * @param {string} prop - the name of the property to get
 * @returns {string} the property value
 */
const get_prop = (req, prop, regex = null) => {
    try {
        let value = "";

        if (req.body && Reflect.has(req.body, prop)) {
            value = String(req.body[prop]);
        } else if (req.query && Reflect.has(req.query, prop)) {
            value = String(req.query[prop]);
        }

        if (regex !== null && !value.match(regex)) {
            return ""; // does not match the provided regex
        }

        return value;
    } catch {
        return ""; // couldn't convert to string
    }
};

/**
 *  get the secret
 * @param {Request}
 * @returns {string} the session secret
 */
const get_secret = (req) => {
    const token = req.get("X-VAULT-TOKEN") || "";

    if (!token.match(regexes.uuid)) {
        res.status(400).json({
            status: "error",
            error: "missing secret key",
        });
        warn(req, "blocked an attempt to bypass authentication (missing secret)");
        req.app.locals.cooldown(req, 3e5);
        throw new BypassAttempt("missing secret");
    }

    return token;
};

/**
 * get the session without authenticating
 * @param {Request} req
 * @param {Response} res
 * @returns {[string, Session]} the session token and session
 */
const get_raw_session = (req, res) => {
    const token = String(req.get("X-VAULT-SESSION") || "");

    if (!token.match(regexes.uuid)) {
        res.status(400).json({
            status: "error",
            error: "missing session key",
        });
        warn(req, "blocked an attempt to bypass authentication (missing key)");
        req.app.locals.cooldown(req, 3e5);
        throw new BypassAttempt("missing session key");
    }

    return [token, req.app.locals.session.get(token) || null];
};

/**
 * check authentication and get the session
 * @param {Request} req
 * @param {Response} res
 * @returns {[string, Session]} the session token and session
 */
const get_session = (req, res) => {
    const [token, session] = get_raw_session(req, res);

    if (session === null) {
        res.status(410).json({
            status: "error",
            error: "session expired",
        });
        req.app.locals.cooldown(req, 5e3); // XXX: maybe a lower cooldown here
        throw new BypassAttempt("session not found");
    }

    if (get_secret(req) !== session.secret) {
        res.status(410).json({
            status: "error",
            error: "session expired", // yes, we lie to them
        });

        // max 3 attempts per 15 minutes
        if (req.app.locals.brute.consume(req, 3, 9e5)) {
            req.app.locals.cooldown(req, 5e3);
        } else {
            warn(req, "blocked an attempt to bypass authentication (wrong secret)");
            req.app.locals.cooldown(req, 3.6e6);
        }

        throw new BypassAttempt("wrong secret");
    }

    if (!session.authenticated) {
        // this should not be possible because they cannot know the secret
        // before authenticating, but we check just to be safe

        res.status(401).json({
            status: "error",
            error: "not authenticated",
        });
        warn(req, "blocked an attempt to bypass authentication (not authed)");
        req.app.locals.cooldown(req, 3e5);
        throw new BypassAttempt("session not authenticated");
    }

    if (!check_ip(req, session)) {
        // ip address has changed
        res.status(403).json({
            status: "error",
            error: "ip address mismatch",
        });
        req.app.locals.logger.warn(`${get_endpoint(req)}: ip address mismatch <${session.vault}@vault> [${req.ip}]`);
        req.app.locals.cooldown(req, 3e5);
        throw new ValidationError("ip mismatch");
    }

    return [token, session];
};

const get_email = (req) => {
    const email = get_prop(req, "email");

    if (!email.match(regexes.email) || email.length >= 320) {
        res.status(400).json({
            status: "error",
            error: "invalid email address",
        });
        warn(req, "blocked an attempt to bypass authentication (invalid email)");
        req.app.locals.cooldown(req, 3e5);
        throw new BypassAttempt("invalid email format");
    }

    return email;
};


module.exports = {
    regexes,
    check_ip,
    get_prop,
    get_email,
    get_endpoint,
    get_raw_session,
    get_session,
};
