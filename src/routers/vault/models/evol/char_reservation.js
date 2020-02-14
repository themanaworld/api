const Sequelize = require("sequelize"); // from npm registry

module.exports = {
    fields: {
        name: { // char name
            type: Sequelize.STRING(30),
            primaryKey: true,
            allowNull: false,
        },
    },
    options: {
        engine: "InnoDB",
    }
};
