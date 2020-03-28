const { DataTypes } = require("sequelize"); // from npm registry

module.exports = {
    fields: {
        accountId: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            allowNull: false,
        },
        key: {
            type: DataTypes.STRING.BINARY,
            primaryKey: true,
            allowNull: false,
        },
        index: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            allowNull: false,
            defaultValue: 0,
        },
        value: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
    },
    options: {
        engine: "InnoDB",
        indexes: [
            { fields: ["account_id"] },
        ],
    }
};
