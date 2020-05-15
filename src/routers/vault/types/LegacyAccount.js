const GameAccount = require("./GameAccount.js");
const LegacyChar = require("./LegacyChar.js");

/**
 * represents a Legacy game account
 */
module.exports = class LegacyAccount extends GameAccount {
    /** account id of the target evol account (ported) */
    revoltId = null;
    /** reference to the EvolAccount of the target evol account */
    revoltAccount = null;
    /** Legacy game characters
     * @type {LegacyChar[]}
     */
    chars = [];

    /**
     * serialize for sending over the network
     * @param {*} key
     */
    toJSON (key) {
        return Object.assign({
            revoltId: this.revoltId,
        }, super.toJSON());
    }
}
