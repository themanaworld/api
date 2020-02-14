const Sequelize = require("sequelize"); // from npm registry

module.exports = {
    fields: {
        charId: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true,
        },
        accountId: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        charNum: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        name: { // char name
            type: Sequelize.STRING(30),
            allowNull: false,
            defaultValue: "",
        },
        class: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        baseLevel: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 1,
        },
        jobLevel: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 1,
        },
        baseExp: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        jobExp: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        zeny: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        str: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 1,
        },
        agi: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 1,
        },
        vit: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 1,
        },
        int: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 1,
        },
        dex: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 1,
        },
        luk: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 1,
        },
        maxHp: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        hp: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 1,
        },
        maxSp: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        sp: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        statusPoint: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 48,
        },
        skillPoint: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        option: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        karma: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        manner: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        partyId: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        guildId: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        clanId: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        petId: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        homunId: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        elementalId: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        hair: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 1,
        },
        hairColor: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        clothesColor: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        body: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        weapon: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        shield: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        headTop: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        headMid: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        headBottom: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        robe: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        lastLogin: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        lastMap: {
            type: Sequelize.STRING(11),
            allowNull: false,
            defaultValue: "000-0",
        },
        lastX: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 22,
        },
        lastY: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 24,
        },
        saveMap: {
            type: Sequelize.STRING(11),
            allowNull: false,
            defaultValue: "000-0",
        },
        saveX: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 22,
        },
        saveY: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 24,
        },
        partnerId: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        online: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        father: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        mother: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        child: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        fame: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        rename: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        deleteDate: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        slotchange: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        charOpt: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        font: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        unbanTime: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        uniqueitemCounter: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        sex: {
            type: Sequelize.ENUM("M", "F", "U"),
            allowNull: false,
            defaultValue: "U",
        },
        hotkeyRowshift: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        hotkeyRowshift2: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        attendanceTimer: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        titleId: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        inventorySize: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 100,
        },
    },
    options: {
        engine: "InnoDB",
        initialAutoIncrement: 150000,
        indexes: [
            {
                fields: ["name"],
                unique: true,
            },
            {
                fields: ["account_id"],
            },
            {
                fields: ["party_id"],
            },
            {
                fields: ["guild_id"],
            },
            {
                fields: ["online"],
            },
        ]
    }
};
