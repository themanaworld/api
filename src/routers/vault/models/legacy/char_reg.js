const { DataTypes } = require("sequelize"); // from npm registry

module.exports = {
    fields: {
        charId: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false,
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
            { fields: ["char_id"] },
        ],
    }
};
