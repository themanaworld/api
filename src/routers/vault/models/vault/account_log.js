const Sequelize = require("sequelize"); // from npm registry

module.exports = {
    fields: {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        vaultId: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
        },
        accountType: {
            type: Sequelize.ENUM("EVOL", "LEGACY", "FORUMS", "WIKI"),
            allowNull: false,
        },
        accountId: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
        },
        actionType: {
            type: Sequelize.ENUM("CREATE", "DELETE", "LINK", "UNLINK", "UPDATE"),
            allowNull: false,
            defaultValue: "CREATE",
        },
        details: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        ip: {
            type: "VARBINARY(16)",
            allowNull: false,
            set (raw) {
                this.setDataValue("ip", Sequelize.fn("INET6_ATON", raw));
            },
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
