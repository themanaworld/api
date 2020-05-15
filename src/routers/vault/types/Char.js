/**
 * represents a generic game character
 */
module.exports = class Char {
    /** reference to the parent GameAccount */
    account = null;
    /** the ID of this char */
    charId = 0;
    /** the public name */
    name = "";
    /** the level of the char */
    baseLevel = 1;
    /** gender of the char */
    gender = "N";
    /** when the char was created */
    creationTime = 0;

    constructor (acc, id, name) {
        this.account = acc;
        this.charId = id;
        this.name = name;
    }

    /**
     * serialize for sending over the network
     * @param {*} key
     */
    toJSON (key) {
        return {
            charId: this.charId,
            name: this.name,
            level: this.baseLevel,
            sex: this.gender,
        };
    }
}
