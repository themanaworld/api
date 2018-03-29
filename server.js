const express = require("express");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const https = require("https");
const config = require("./config.json");
const api = express();

const db = mysql.createConnection({
    host     : config.sql.host,
    user     : config.sql.user,
    password : config.sql.password,
    database : config.sql.database
});

const checkCaptcha = (req, res, next) => {
    const token = String(req.get("X-CAPTCHA-TOKEN"));

    if (!token.match(/^[a-zA-Z0-9-_]{8,}$/)) {
        res.status(403).json({
            status: "error",
            error: "no token sent"
        });
        return;
    }

    https.get(`https://www.google.com/recaptcha/api/siteverify?secret=${config.recaptcha.secret}&response=${token}`, (re) => {
        re.setEncoding("utf8");
        re.on("data", response => {
            const data = JSON.parse(response);
            if (!data.success) {
                console.error(`recaptcha returned an error: ${JSON.stringify(data)}`);
                res.status(403).json({
                    status: "error",
                    error: "captcha validation failed"
                });
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
        return;
    })
};



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
        return;
    }

    let account = {
        username: req.body.username,
        password: req.body.password,
        email: req.body.email || "a@a.com"
    };

    db.connect();
    db.query(`SELECT COUNT(*) FROM ${config.sql.table} WHERE USERNAME="${account.username}"`, (err, rows, fields) => {
        if (err) {
            res.status(500).json({
                status: "error",
                error: "couldn't reach the database"
            });
        } else if (rows[0].count > 0) {
            res.status(409).json({
                status: "error",
                error: "already exists"
            });
        } else {
            db.query(`INSERT INTO ${config.sql.table} (USERNAME, PASSWORD, EMAIL, GENDER) VALUES ("${account.username}", "${account.password}", "${account.email}", "N")`, (err, rows, fields) => {
                if (err) {
                    res.status(500).json({
                        status: "error",
                        error: "couldn't add the user"
                    });
                } else {
                    res.status(201).json({
                        status: "success"
                    });
                }
            });
        }
    });

    db.close();
});



api.use((req, res, next) => {
    res.status(404).json({
        status: "error",
        error: "unknown endpoint"
    });
});

api.set("trust proxy", "loopback"); // only allow localhost to communicate with the API
api.listen(config.port, () => console.info(`Listening on port ${config.port}`));
