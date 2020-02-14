const Sequelize = require("sequelize"); // from npm registry

module.exports = {
    fields: {
        accountId: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            primaryKey: true,
        },
        vaultId: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
        },
    },
    options: {
        indexes: [
            {
                fields: ["vault_id"], // BUG: {underscored: true} does not work on indexes
            },
        ]
    }
};
