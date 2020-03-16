const Sequelize = require("sequelize"); // from npm registry

module.exports = {
    fields: {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        primaryIdentity: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: true,
        },
        allowNonPrimary: {
            type: Sequelize.BOOLEAN,
            defaultValue: true,
            allowNull: false,
        },
        strictIPCheck: {
            field: "strict_ip_check",
            type: Sequelize.BOOLEAN,
            defaultValue: false,
            allowNull: false,
        },
        creationDate: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.NOW,
        },
        state: {
            type: Sequelize.ENUM("OK", "BANNED"),
            allowNull: false,
            defaultValue: "OK",
        },
    }
};
