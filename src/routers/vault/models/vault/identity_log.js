const Sequelize = require("sequelize"); // from npm registry

module.exports = {
    fields: {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        userId: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
        },
        identityId: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
        },
        action: {
            type: Sequelize.ENUM("ADD", "REMOVE"),
            allowNull: false,
            defaultValue: "ADD",
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
            {
                fields: ["user_id"], // BUG: {underscored: true} does not work on indexes
            },
            {
                fields: ["identity_id"], // BUG: {underscored: true} does not work on indexes
            },
            {
                fields: ["ip"],
            }
        ]
    }
};
