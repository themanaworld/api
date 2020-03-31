const nanoid = require("nanoid");
const dictionaries = require("nanoid-dictionary");
const Identity = require("./Identity.js");
const EvolAccount = require("./EvolAccount.js");
const LegacyAccount = require("./LegacyAccount.js");

/** custom nanoid generators */
const newToken = {
    n23: nanoid.customAlphabet(dictionaries.nolookalikes, 23),
    n36: () => nanoid.nanoid(36),
};

/**
 * holds a cache of all the user data fetched from SQL
 */
module.exports = class Session {
    /**
     * expiry date
     */
    expires = new Date();
    /**
     * Vault account id
     * @type {number}
     */
    vault = null;
    /**
     * whether the user is properly authenticated
     */
    authenticated = false;
    /**
     * the identity that was used to log in
     * @type {Identity}
     */
    identity = null;
    /**
     * the email address of the identity that was used to log in
     * @type {string}
     */
    email;
    /**
     * the secret that is sent once to the client after authentication
     * @type {string}
     */
    secret;
    /**
     * cache holding all identities
     * @type {Identity[]}
     */
    identities = [];
    /**
     * id of the main identity of the account
     * @type {number}
     */
    primaryIdentity = null;
    /**
     * whether to allow logging in with a non-primary ident
     */
    allowNonPrimary = true;
    /**
     * cache holding all legacy game accounts
     * @type {LegacyAccount[]}
     */
    legacyAccounts = [];
    /**
     * cache holding all evol game accounts
     * @type {EvolAccount[]}
     */
    gameAccounts = [];
    /**
     * ip that was used to init the session
     * @type {string}
     */
    ip;
    /**
     * refuse to authenticate a session with a different IP
     */
    strictIPCheck = true;

    constructor (ip, email) {
        this.ip = ip;
        this.email = email.toLowerCase();
        this.secret = newToken.n36();
    }

    /**
     * generate a secure unique token that is shared with the end-user.
     * excludes lookalike characters but is still stronger than uuidv4
     * @param {number} - the token length
     */
    static async generateToken () {
        return newToken.n23();
    }

    /**
     * serialize for sending over the network
     */
    toJSON () {
        return {
            expires: this.expires,
            identity: this.identity.id,
        };
    }

    /**
     * serialize the account settings for sending over the network
     */
    getAccountData () {
        return {
            primaryIdentity: this.primaryIdentity.id,
            allowNonPrimary: this.allowNonPrimary,
            strictIPCheck: this.strictIPCheck,
            vaultId: this.vault,
        };
    }
}
