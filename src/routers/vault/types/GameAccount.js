const Char = require("./Char.js");

/**
 * represents a generic game account
 */
module.exports = class GameAccount {
    /** the GID of the account */
    accountId = 0;
    /** the login username */
    userid = "";
    /** the email address associated with the account */
    email = null;
    /** game characters
     * @type {Char[]}
     */
    chars = [];
    /** the last time the account logged in */
    lastLogin = null;
    /** the last IP that was used to log in */
    lastIP = null;
    /** the total number of times the account logged in */
    loginCount = 0;
    /** whether the account is banned */
    banned = false;

    constructor (id, name) {
        this.accountId = id;
        this.userid = name;
    }

    /**
     * serialize for sending over the network
     * @param {*} key
     */
    toJSON (key) {
        return {
            accountId: this.accountId,
            name: this.userid,
            chars: this.chars,
        };
    }
}
