"use strict";
const Session = require("./Session.js");

/**
 * we store the timeout directly in Session instances
 * @type {Symbol("session timeout")}
 */
const timeout_symbol = Symbol("session timeout");

/**
 * holds the Sessions and re-hydrates them when accessed
 */
class SessionStore {
    /**
     * a Map of all Session instances
     * @type {Map<string, Session>}
    */
    sessions = new Map();
    /** lifetime of an unauthenticated Session, in minutes */
    base_lifetime = 30;
    /** lifetime of a properly authenticated Session, in minutes */
    authed_lifetime = 60 * 6; // 6 hours

    /**
     * creates a new SessionStore
     * @param {number} base - the base Session lifetime, in minutes
     * @param {number} authed - the lifetime of an authenticated Session
     */
    constructor (base = 0, authed = 0) {
        this.base_lifetime = base || this.base_lifetime;
        this.authed_lifetime = authed || this.authed_lifetime;
    }

    /**
     * re-hydrates a Session by resetting the expiration
     * @param {string} key - the Session key
     * @param {Session} sess - the Session to hydrate
     * @returns {Session} the same Session
     */
    hydrate (key, sess) {
        /** the new expiration, in minutes */
        let minutes = this.base_lifetime;

        if (Reflect.has(sess, timeout_symbol)) {
            /** clear any existing timeout */
            clearTimeout(sess[timeout_symbol]);
        }

        if (sess.authenticated === true) {
            /** Session is properly authenticated: set lifetime accordingly */
            minutes = this.authed_lifetime;
        }

        /** the new expiry Date */
        const expires = new Date();
        expires.setUTCMinutes(expires.getUTCMinutes() + minutes); // update it
        sess.expires = expires; // swap the old for the new expiry
        sess[timeout_symbol] = setTimeout(() => this.delete(key), minutes * 60000);
        return sess;
    }

    /**
     * checks whether a Session with the given key exists
     * @param {string} key - the Session key
     */
    has (key) {
        return this.sessions.has(key);
    }

    /**
     * returns a Session with the matching key
     * @param {string} key - the Session key
     * @returns {Session} the found Session
     */
    get (key) {
        /** lookup the session by key */
        const sess = this.sessions.get(key);

        if (sess) {
            /** the Session, re-hydrated */
            return this.hydrate(key, sess);
        }

        /** session not found */
        return null;
    }

    /**
     * adds a Session to the store
     * @param {string} key - the Session key
     * @param {Session} sess - the Session
     */
    set (key, sess) {
        this.sessions.set(key, this.hydrate(key, sess));
    }

    /**
     * removes a Session with the matching key from the store
     *
     * NOTE: this does not actually delete the Session instance
     * @param {string} key - the Session key
     */
    delete (key) {
        /** lookup the session by key */
        const sess = this.sessions.get(key);

        if (sess) {
            if (Reflect.has(sess, timeout_symbol)) {
                /** clear any existing timeout */
                clearTimeout(sess[timeout_symbol]);
            }

            return this.sessions.delete(key)
        }

        /** session not found */
        return false;
    }

    /**
     * iterator for use in for-of
     * @returns {Iterator<[string, Session]>} the Map iterator of the SessionStore instance
     */
    [Symbol.iterator] () {
        return this.sessions[Symbol.iterator]();
    }
}

module.exports = SessionStore;
