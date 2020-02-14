const Sequelize = require("sequelize"); // from npm registry

module.exports = {
    fields: {
        accountId: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            allowNull: false,
        },
        revoltId: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: true,
        },
        userid: { // username
            type: Sequelize.STRING(23),
            allowNull: false,
            defaultValue: "",
        },
        userPass: { // weak athena hashing
            type: Sequelize.STRING(32),
            allowNull: false,
            defaultValue: "",
        },
        lastlogin: {
            type: Sequelize.DATE,
            allowNull: true,
        },
        logincount: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        state: { // ideally this should've been an enum, but whatever
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        email: { // tmwa has a very limited email length
            type: Sequelize.STRING(39),
            allowNull: true,
        },
        lastIp: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        unbanTime: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
    },
    options: {
        indexes: [
            {
                fields: ["revolt_id"],
                unique: true,
            },
            {
                fields: ["userid"],
            }
        ]
    }
};
