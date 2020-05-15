const Char = require("./Char.js");

/**
 * represents a Legacy game char
 */
module.exports = class LegacyChar extends Char {
    /** char id of the target evol char (ported) */
    revoltId = null;
    /** reference to the EvolChar */
    revoltChar = null;
    /** boss points */
    bossPoints = 0;

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
