const Sequelize = require("sequelize"); // from npm registry

module.exports = {
    fields: {
        legacyId: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            allowNull: false,
        },
        accountId: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
        },
        vaultId: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
        },
        ip: {
            type: "VARBINARY(16)",
            allowNull: false,
        },
        date: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.NOW,
        },
    },
    options: {
        indexes: [
            { fields: ["vault_id"] },
            { fields: ["account_id"] },
            { fields: ["ip"] },
        ]
    }
};
