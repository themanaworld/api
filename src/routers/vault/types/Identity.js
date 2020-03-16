"use strict";

const { Sequelize, Model } = require("sequelize");

class Identity extends Model {
    /**
     * primary key
     * @type {number}
     */
    //id;
    /**
     * the Date when the Identity was confirmed
     * @type {Date}
     */
    //addedDate;
    /**
     * the email address of the identity
     * @type {string}
     */
    //email;
    /**
     * the Vault user id
     * @type {number}
     */
    //userId;

    /**
     * whether it is the primary identity of the vault account
     * @virtual
     */
    isPrimary = false;


    /**
     * initialize the model (must be called prior to first use)
     * @param {Sequelize} sequelize - the Sequelize instance
     */
    static define (sequelize) {
        const {fields, options} = require("../models/vault/identity.js");
        Identity.init(fields, { sequelize, ...options });

        return Identity; // the instantiated Model
    }

    /**
     * serialize for sending over the network
     */
    toJSON () {
        return {
            id: this.id,
            email: this.email,
            added: this.addedDate,
            primary: this.isPrimary,
        };
    }
}

module.exports = Identity;
