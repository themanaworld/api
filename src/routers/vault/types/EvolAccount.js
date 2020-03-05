const GameAccount = require("./GameAccount.js");

/**
 * represents an Evol game account
 */
module.exports = class EvolAccount extends GameAccount {
    /** account id of the source legacy account (ported) */
    legacyId = null;
    /** reference to the LegacyAccount */
    legacyAccount = null;

    /**
     * serialize for sending over the network
     * @param {*} key
     */
    toJSON (key) {
        return Object.assign({
            legacyId: this.legacyId,
        }, super.toJSON());
    }
}
