const express = require("express");
const mysql = require("mysql");
const https = require("https");
const fs = require("fs");
const api = express();

const rate_limiting = new Set();

const register_db = mysql.createPool({
    connectionLimit: 10,
    host           : process.env.npm_package_config_sql_host,
    user           : process.env.npm_package_config_sql_user,
    password       : process.env.npm_package_config_sql_password,
    database       : process.env.npm_package_config_sql_database
});

const tmwa = {
    status: "OfflineTemporarily",
    num_online: 0,
    timeout: null,
    poll: () => {
        fs.readFile("./online.txt", "utf8", (err, data) => {
            const lines = data.split("\n");

            if (err || lines.length < 2) {
                console.error("encountered an error while retrieving online.txt", err);
                tmwa.timeout = setTimeout(tmwa.poll, 30000); // <= it failed, so check again later
                return;
            }

            const last_online = Date.parse(lines[0].match(/\((.+)\)/)[1] + ` ${process.env.npm_package_config_timezone}`);

            if (Date.now() - last_online < 30000) {
                const num = lines[lines.length - 2].match(/([0-9]+) users are online./);
                tmwa.status = "Online";
                tmwa.num_online = num ? num[1] : 0;
            } else {
                tmwa.status = "OfflineTemporarily";
                tmwa.num_online = 0;
            }

            tmwa.timeout = setTimeout(tmwa.poll, 2000);
        });
    }
};

const checkRateLimiting = (req, res, next) => {
    if (rate_limiting.has(req.ip)) {
        res.status(429).json({
            status: "error",
            error: "too many requests"
        });
    } else {
        next();
    }
    return;
};

const checkCaptcha = (req, res, next) => {
    const token = String(req.get("X-CAPTCHA-TOKEN"));

    if (!token.match(/^[a-zA-Z0-9-_]{8,}$/)) {
        res.status(403).json({
            status: "error",
            error: "no token sent"
        });
        console.info("a request with an empty token was received", req.ip);
        rate_limiting.add(req.ip);
        setTimeout(() => rate_limiting.delete(req.ip), 300000);
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
                rate_limiting.add(req.ip);
                setTimeout(() => rate_limiting.delete(req.ip), 300000);
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

api.use(checkRateLimiting);
api.use(checkCaptcha);
api.use(express.json());
api.post("/api/account", (req, res) => {
    if (!req.body || !Reflect.has(req.body, "username") ||
        !Reflect.has(req.body, "password") || !Reflect.has(req.body, "email") ||
        !req.body.username.match(/^[a-zA-Z0-9]{4,23}$/) ||
        !req.body.password.match(/^[a-zA-Z0-9]{4,23}$/) ||
        !req.body.email.match(/^$|^(?:[a-zA-Z0-9.$&+=_~-]{1,34}@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,35}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,34}[a-zA-Z0-9])?){0,9})$/) ||
        req.body.email.length >= 40)
    {
        res.status(400).json({
            status: "error",
            error: "malformed request"
        });
        console.info("a malformed request was received", req.ip, req.body);
        rate_limiting.add(req.ip);
        setTimeout(() => rate_limiting.delete(req.ip), 300000);
        return;
    }

    const db = mysql.createConnection({
        host     : process.env.npm_package_config_sql_host,
        user     : process.env.npm_package_config_sql_user,
        password : process.env.npm_package_config_sql_password,
        database : process.env.npm_package_config_sql_database
    });

    register_db.getConnection((err, db) => {
        if (err) {
            res.status(500).json({
                status: "error",
                error: "couldn't reach the database"
            });
            console.warn("a connection with the database couldn't be established");
            return;
        }

        const query_params = {
            "USERNAME": req.body.username,
            "PASSWORD": req.body.password,
            "EMAIL": req.body.email || "a@a.com",
            "GENDER": "N",
        };

        db.query(`INSERT INTO ${process.env.npm_package_config_sql_table} SET ?`, query_params, (err, rows, fields) => {
            if (err) {
                if (err.code === "ER_DUP_ENTRY") {
                    res.status(409).json({
                        status: "error",
                        error: "already exists"
                    });
                    console.info("a request to create an already-existent account was received", req.ip, query_params.USERNAME);
                    rate_limiting.add(req.ip);
                    setTimeout(() => rate_limiting.delete(req.ip), 2000);
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
                console.info(`an account was created: ${query_params.USERNAME}`);
                rate_limiting.add(req.ip);
                setTimeout(() => rate_limiting.delete(req.ip), 300000);
            }

            db.release(); // return this connection to the pool
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
api.disable("x-powered-by"); // we don't need this header
api.listen(process.env.npm_package_config_port, () => console.info(`Listening on port ${process.env.npm_package_config_port}`));
tmwa.poll();
