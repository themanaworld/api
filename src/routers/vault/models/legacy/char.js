const Sequelize = require("sequelize"); // from npm registry

module.exports = {
    fields: {
        charId: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            allowNull: false,
        },
        revoltId: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: true,
        },
        accountId: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        name: { // char name
            type: Sequelize.STRING(30),
            allowNull: false,
            defaultValue: "",
        },
        class: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        baseLevel: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 1,
        },
        jobLevel: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 1,
        },
        baseExp: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        jobExp: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        zeny: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        str: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        agi: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        vit: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        int: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        dex: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        luk: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        statusPoint: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        skillPoint: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        partyId: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        partyIsleader: { // single BIT
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: 0,
        },
        hair: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        hairColor: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        partnerId: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        sex: { // NOTE: we must exclude S
            type: Sequelize.ENUM("M", "F", "N", "S"),
            allowNull: false,
            defaultValue: "N",
        },
    },
    options: {
        indexes: [
            {
                fields: ["revolt_id"],
                unique: true,
            },
            {
                fields: ["name"],
                unique: true,
            },
            {
                fields: ["account_id"],
            },
            {
                fields: ["party_id"],
            }
        ]
    }
};
