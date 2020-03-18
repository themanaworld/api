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
        email: {
            type: Sequelize.STRING(320),
            allowNull: false,
        },
        addedDate: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.NOW,
        },
    },
    options: {
        tableName: "identity",
        freezeTableName: true,
        indexes: [
            {
                fields: ["user_id"],  // BUG: table option {underscored: true} does not work on indexes
            },
            {
                fields: ["email"],
                unique: true,
            }
        ]
    }
};
