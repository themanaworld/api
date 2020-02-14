const Sequelize = require("sequelize"); // from npm registry

// NOTE: to get the ip, use something like
//     select *, INET6_NTOA(ip) as ip_ from vault.login_log;
// and to search by ip use something like
//     select * from vault.login_log where ip = INET6_ATON("ip addr");

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
        action: {
            type: Sequelize.ENUM("LOGIN", "LOGOUT", "CREATE"),
            allowNull: false,
            defaultValue: "LOGIN",
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
                fields: ["ip"],
            }
        ]
    }
};
