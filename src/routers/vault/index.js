const express = require("express"); // from npm registry
const Sequelize = require("sequelize"); // from npm registry
const Ephemeral = require("./utils/ephemeral.js");
const SessionStore = require("./types/SessionStore.js");

const models = {
    vault: [
        "login", "login_log",
        /*"identity",*/ "identity_log",
        "claimed_game_accounts",
        "claimed_legacy_accounts",
        "account_log",
        "migration_log",
    ],
    legacy: [
        "login",
        "char",
        //"inventory",
        //"storage",
        //"global_acc_reg",
        //"acc_reg",
        //"char_reg",
        //"party",
    ],
    evol: [
        "login",
        "char",
        "char_reservation",
    ],
};

const middlewares = {
    session: require("./middlewares/session.js"),
    identity: require("./middlewares/identity.js"),
    account: require("./middlewares/account.js"),
    legacy_account: require("./middlewares/legacy/account.js"),
    evol_account: require("./middlewares/evol/account.js"),
};



module.exports = exports = class Vault {
    constructor (api, challenge) {
        // XXX: having to pass a reference to `api` is weird, we should instead
        //      store config in this.config and make the middlewares (somehow)
        //      access this.config. the problem is that we can't pass arguments
        //      to middlewares, so we might have to curry them

        this.api = api;
        this.api.locals.session = new SessionStore();
        this.api.locals.identity_pending = Ephemeral.identity_handler;
        this.router = express.Router(["caseSensitive", "strict"]);
        this.sequelize = {};

        this.router.all("/session", /*challenge,*/ express.json(), middlewares.session);
        this.router.all("/identity", express.json(), middlewares.identity);
        this.router.all("/account", express.json(), middlewares.account);

        // legacy
        this.router.all("/legacy/account", express.json(), middlewares.legacy_account);

        // new server
        this.router.all("/evol/account", express.json(), middlewares.evol_account);


        console.info("Loaded Vault router");
        return this;
    }

    async init () {
        console.info("Vault: initializing database");

        for (const [db, db_models] of Object.entries(models)) {
            const DB = db.toUpperCase();
            this.sequelize[db] = await new Sequelize(
                process.env[`SQL__${DB}__DB`],
                process.env[`SQL__${DB}__USER`],
                process.env[`SQL__${DB}__PASS`], {
                    host: process.env[`SQL__${DB}__HOST`],
                    dialect: "mariadb",
                    dialectOptions: {
                        timezone: process.env.TZ,
                    },
                    logging: false, // don't print queries to console
                    benchmark: false,
                    pool: {
                        max: 10,
                        min: 1, // always have at least one connection open
                        idle: 10000,
                    },
                    define: {
                        engine: "ROCKSDB",
                        underscored: true, // convert camelCase to snake_case
                        freezeTableName: true, // why the fuck would you want it pluralized?
                        timestamps: false, // no thanks, I'll add my own timestamps
                    },
                });

            this.api.locals[db] = {};

            for (const table of db_models) {
                const model = require(`./models/${db}/${table}.js`);
                this.api.locals[db][table] = await this.sequelize[db].define(table, model.fields, model.options);
            }

            console.info(`Vault: loaded models for ${DB}`);
        }

        const Identity = require("./types/Identity.js");
        this.api.locals.vault.identity = Identity.define(this.sequelize.vault);

        await this.sequelize.vault.sync({alter: {drop: false}}); // update SQL tables

        this.api.locals.sequelize = this.sequelize; // for access to sequelize.fn
        console.info("Vault: database ready");

        return Promise.resolve(true);
    }
};
