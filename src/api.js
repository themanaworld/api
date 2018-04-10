const express = require("express"); // from npm registry
const mysql = require("mysql"); // from npm registry
const https = require("https"); // built-in
const api = express();

if (process.env.npm_package_config_port === undefined) {
    console.error("Please run this package with `npm start`");
    process.exit(1);
}



// config common to all routers:
api.locals = Object.assign({
    rate_limiting: new Set(), // XXX: or do we want routers to each have their own rate limiter?
}, api.locals);



/*******************************
    BEGIN MIDDLEWARES
********************************/

const checkRateLimiting = (req, res, next) => {
    if (req.app.locals.rate_limiting.has(req.ip)) {
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
    const token = String(req.get("X-CAPTCHA-TOKEN") || "");

    if (!token.match(/^[a-zA-Z0-9-_]{30,60}$/)) {
        res.status(403).json({
            status: "error",
            error: "no token sent"
        });
        console.info("a request with an empty token was received", req.ip);
        req.app.locals.rate_limiting.add(req.ip);
        setTimeout(() => req.app.locals.rate_limiting.delete(req.ip), 300000);
        return false;
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
                req.app.locals.rate_limiting.add(req.ip);
                setTimeout(() => req.app.locals.rate_limiting.delete(req.ip), 300000);
                return false;
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
        return false;
    })
};

/*******************************
    END MIDDLEWARES
********************************/



/*******************************
    BEGIN ROUTERS
********************************/

const global_router = express.Router(["caseSensitive", "strict"]);

const tmwa_router = new (require("./routers/tmwa"))({
    timezone: process.env.npm_package_config_timezone,
    name: process.env.npm_package_config_tmwa_name,
    url: process.env.npm_package_config_tmwa_url,
    db_pool: mysql.createPool({
        connectionLimit: 10,
        host           : process.env.npm_package_config_sql_host,
        user           : process.env.npm_package_config_sql_user,
        password       : process.env.npm_package_config_sql_password,
        database       : process.env.npm_package_config_sql_database
    }),
    db_tables: {
        register: process.env.npm_package_config_sql_table,
    },
}, api, checkCaptcha, checkRateLimiting);

global_router.use("/tmwa", tmwa_router);
api.use("/api", global_router);

/*******************************
    END ROUTERS
********************************/



// default endpoint:
api.use((req, res, next) => {
    res.status(404).json({
        status: "error",
        error: "unknown endpoint"
    });
    console.info("a request for an unknown endpoint was received", req.ip, req.originalUrl);
});

api.set("trust proxy", "loopback"); // only allow localhost to communicate with the API
api.disable("x-powered-by"); // we don't need this header
api.listen(process.env.npm_package_config_port, () => console.info(`Listening on port ${process.env.npm_package_config_port}`));
