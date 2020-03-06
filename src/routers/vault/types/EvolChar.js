const Char = require("./Char.js");

/**
 * represents an Evol game char
 */
module.exports = class EvolChar extends Char {
    /** char id of the source legacy char (ported) */
    legacyId = null;
    /** reference to the LegacyChar */
    legacyChar = null;
    /** evol gender (different than tmwa) */
    gender = "U";

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
