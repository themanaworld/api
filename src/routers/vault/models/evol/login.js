const Sequelize = require("sequelize"); // from npm registry

module.exports = {
    fields: {
        accountId: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        userid: { // username
            type: Sequelize.STRING(23),
            allowNull: false,
            defaultValue: "",
        },
        userPass: { // plaintext
            type: Sequelize.STRING(32),
            allowNull: false,
            defaultValue: "",
        },
        sex: { // NOTE: we must exclude S
            type: Sequelize.ENUM("M", "F", "S"), // TODO: add N when evol-hercules supports it
            allowNull: false,
            defaultValue: "M", // TODO: change to N
        },
        email: { // limited email length
            type: Sequelize.STRING(39),
            allowNull: false,
            defaultValue: "",
        },
        groupId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        state: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        unbanTime: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        expirationTime: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        logincount: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        lastlogin: {
            type: Sequelize.DATE,
            allowNull: true,
        },
        lastIp: {
            type: Sequelize.STRING(100),
            allowNull: false,
            defaultValue: "",
        },
        birthdate: {
            type: Sequelize.DATE,
            allowNull: true,
        },
        characterSlots: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0, // 0 means MAX_CHARS(12)
        },
        pincode: {
            type: Sequelize.STRING(4), // TODO: use this for TOTP
            allowNull: false,
            defaultValue: "",
        },
        pincodeChange: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
    },
    options: {
        engine: "InnoDB",
        initialAutoIncrement: 2000000,
        indexes: [
            {
                fields: ["userid"],
            }
        ]
    }
};
