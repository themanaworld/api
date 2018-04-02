const express = require("express");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const https = require("https");
const fs = require("fs");
const api = express();

const tmwa = {
    status: "OfflineTemporarily",
    num_online: 0,
    interval: null,
    poll: () => {
        fs.readFile("./online.txt", "utf8", (err, data) => {
            const lines = data.split("\n");
            const last_online = Date.parse(lines[0].match(/\((.+)\)/)[1] + ` ${process.env.npm_package_config_timezone}`);

            if (Date.now() - last_online < 30000) {
                tmwa.status = "Online";
                tmwa.num_online = lines[lines.length - 2].match(/([0-9]+) users are online./)[1];
            } else {
                tmwa.status = "OfflineTemporarily";
                tmwa.num_online = 0;
            }

            setTimeout(tmwa.poll, 2000);
        });
    }
};

const checkCaptcha = (req, res, next) => {
    const token = String(req.get("X-CAPTCHA-TOKEN"));

    if (!token.match(/^[a-zA-Z0-9-_]{8,}$/)) {
        res.status(403).json({
            status: "error",
            error: "no token sent"
        });
        console.info("a request with an empty token was received", req.ip);
        return;
    }

    https.get(`https://www.google.com/recaptcha/api/siteverify?secret=${process.env.npm_package_config_recaptcha_secret}&response=${token}`, re => {
        re.setEncoding("utf8");
        re.on("data", response => {
            const data = JSON.parse(response);
            if (!data.success) {
                console.error(`recaptcha returned an error: ${response}`);
                res.status(403).json({
                    status: "error",
                    error: "captcha validation failed"
                });
                console.info("a request failed to validate", req.ip);
                return;
            }

            next(); // challenge passed, so process the request
        });
    }).on("error", error => {
        console.error(error);
        res.status(403).json({
            status: "error",
            error: "recaptcha couldn't be reached"
        });
        console.warn("reCaptcha couldn't be reached");
        return;
    })
};

api.get("/api/tmwa", (req, res) => {
    res.append("Access-Control-Allow-Origin", "*"); // CORS ready
    res.status(200).json({
        "@context": "http://schema.org",
        "@type": "GameServer",
        name: process.env.npm_package_config_tmwa_name,
        url: process.env.npm_package_config_tmwa_url,
        playersOnline: tmwa.num_online,
        serverStatus: tmwa.status,
    });
});

api.use(checkCaptcha);
api.use(bodyParser.json());
api.post("/api/account", (req, res) => {
    if (!req.body || !Reflect.has(req.body, "username") ||
        !Reflect.has(req.body, "password") || !Reflect.has(req.body, "email") ||
        !req.body.username.match(/^[a-zA-Z0-9]{4,23}$/) ||
        !req.body.password.match(/^[a-zA-Z0-9]{4,23}$/) ||
        !req.body.email.match(/^|(?:[a-zA-Z0-9.$&+=_~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/) ||
        req.body.email.length >= 40)
    {
        res.status(400).json({
            status: "error",
            error: "malformed request"
        });
        console.info("a malformed request was received", req.ip, req.body);
        return;
    }

    const account = {
        username: req.body.username,
        password: req.body.password,
        email: req.body.email || "a@a.com"
    };

    const db = mysql.createConnection({
        host     : process.env.npm_package_config_sql_host,
        user     : process.env.npm_package_config_sql_user,
        password : process.env.npm_package_config_sql_password,
        database : process.env.npm_package_config_sql_database
    });

    db.connect(err => {
        if (err) {
            res.status(500).json({
                status: "error",
                error: "couldn't reach the database"
            });
            console.warn("a connection with the database couldn't be established");
            return;
        }

        db.query({sql: `INSERT INTO ${process.env.npm_package_config_sql_table} (USERNAME, PASSWORD, EMAIL, GENDER) VALUES ("${account.username}", "${account.password}", "${account.email}", "N")`}, (err, rows, fields) => {
            if (err) {
                if (err.code === "ER_DUP_ENTRY") {
                    res.status(409).json({
                        status: "error",
                        error: "already exists"
                    });
                    console.info("a request to create an already-existent account was received", req.ip, account.username);
                } else {
                    res.status(500).json({
                        status: "error",
                        error: "couldn't add the user"
                    });
                    console.error("an unexpected sql error occured", err);
                }
            } else {
                res.status(201).json({
                    status: "success"
                });
                console.info(`an account was created: ${account.username}`);
            }

            db.end();
        });
    });
});



api.use((req, res, next) => {
    res.status(404).json({
        status: "error",
        error: "unknown endpoint"
    });
    console.info("a request for an unknown endpoint was received", req.ip, req.originalUrl);
});

if (process.env.npm_package_config_port === undefined) {
    console.error("Please run this package with `npm start`");
    process.exit(1);
}

api.set("trust proxy", "loopback"); // only allow localhost to communicate with the API
api.listen(process.env.npm_package_config_port, () => console.info(`Listening on port ${process.env.npm_package_config_port}`));
tmwa.poll();
