const express = require("express"); // from npm registry
const fs = require("fs"); // built-in

const middlewares = {
    account: require("./middlewares/account.js"),
    server:  require("./middlewares/server.js"),
};

module.exports = exports = class TMWA {
    constructor(config, api, challenge) {
        // XXX: having to pass a reference to `api` is weird, we should instead
        //      store config in this.config and make the middlewares (somehow)
        //      access this.config. the problem is that we can't pass arguments
        //      to middlewares, so we might have to curry them

        this.api = api;
        this.api.locals.tmwa = config;
        this.api.locals.tmwa.status = "OfflineTemporarily"; // XXX: storing these in the class feels wrong, I don't think it should be exported... maybe we could use some more curry?
        this.api.locals.tmwa.num_online = 0;
        this.timeout = null;
        this.router = express.Router(["caseSensitive", "strict"]);

        this.router.get("/server", middlewares.server);

        this.router.all("/account", challenge); // require captcha
        this.router.all("/account", express.json(), middlewares.account);

        tmwa_poll(this); // first heartbeat

        console.info("Loaded TMWA router");
        return this.router;
    }
};

const tmwa_poll = (_this) => {
    fs.readFile("./online.txt", "utf8", (err, data) => {
        const lines = data.split("\n");

        if (err || lines.length < 2) {
            console.error("TMWA: encountered an error while retrieving online.txt", err);
            _this.timeout = setTimeout(() => tmwa_poll(_this), 30000); // <= it failed, so check again later
            return;
        }

        const last_online = Date.parse(lines[0].match(/\((.+)\)/)[1] + ` ${_this.api.locals.tmwa.timezone}`);

        if (Date.now() - last_online < 30000) {
            const num = lines[lines.length - 2].match(/([0-9]+) users are online./);
            _this.api.locals.tmwa.status = "Online";
            _this.api.locals.tmwa.num_online = num ? num[1] : 0;
        } else {
            _this.api.locals.tmwa.status = "OfflineTemporarily";
            _this.api.locals.tmwa.num_online = 0;
        }

        _this.timeout = setTimeout(() => tmwa_poll(_this), 2000);
    });
};
