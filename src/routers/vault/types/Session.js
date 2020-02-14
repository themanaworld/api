/**
 * holds a cache of all the user data fetched from SQL
 */
module.exports = class Session {
    expires = new Date(); // expiry Date
    vault = null; // Vault account id
    authenticated = false; // whether the user logged in
    identity = null; // the identity that was used to log in
    email; // the email address of the identity that was used to log in
    identities = []; // cache holding all identities
    primaryIdentity = null; // the main identity of the account
    allowNonPrimary = true; // whether to allow logging in with a non-primary ident
    legacyAccounts = []; // cache holding all legacy game accounts
    gameAccounts = []; // cache holding all evol game accounts
    ip; // ip that was used to init the session

    constructor (ip, email) {
        this.ip = ip;
        this.email = email;
    }
}
