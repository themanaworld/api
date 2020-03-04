const express = require("express"); // from npm registry
const https = require("https"); // built-in
const Limiter = require("./limiter.js");
const Logger = require("./logger.js");
const Brute = require("./brute.js");
const api = express();

if (!process.env.NODE_ENV) {
    console.error("must be started with 'npm run start'");
    process.exit(1);
}

// env-based config
const dotenv = require("lazy-universal-dotenv");
const [nodeEnv, buildTarget] = [process.env.NODE_ENV, process.env.BUILD_TARGET];
const conf = dotenv.getEnvironment({ nodeEnv, buildTarget }).raw;
Object.assign(process.env, conf); // override


if (process.env.PORT === undefined) {
    console.error("Please run this package with `npm start`");
    process.exit(1);
}

// config common to all routers:
api.locals = Object.assign({
    cooldown: Limiter.cooldown,
    mailer: {
        from: process.env.MAILER__FROM,
    },
    logger: Logger,
    brute: Brute,
}, api.locals);



/*******************************
    BEGIN MIDDLEWARES
********************************/

const checkCaptcha = (req, res, next) => {
    const token = String(req.get("X-CAPTCHA-TOKEN") || "");

    if (!token.match(/^[a-zA-Z0-9-_]{20,800}$/)) {
        res.status(403).json({
            status: "error",
            error: "no token sent"
        });
        req.app.locals.cooldown(req, 300000);
        return false;
    }

    if (process.env.NODE_ENV === "development") {
        // local development: no challenge check
        next();
        return;
    }

    https.get(`https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA__SECRET}&response=${token}`, re => {
        re.setEncoding("utf8");
        re.on("data", response => {
            const data = JSON.parse(response);
            if (!Reflect.has(data, "success") || data.success !== true) {
                if (Reflect.has(data, "error-codes")) {
                    const error_codes = data["error-codes"].toString();
                    if (error_codes !== "invalid-input-response") {
                        console.error("reCAPTCHA returned an error: %s", error_codes);
                    }
                }
                res.status(403).json({
                    status: "error",
                    error: "captcha validation failed"
                });
                req.app.locals.cooldown(req, 300000);
                return false;
            }

            next(); // challenge passed, so process the request
        });
    }).on("error", error => {
        console.error(error);
        res.status(403).json({
            status: "error",
            error: "reCAPTCHA couldn't be reached"
        });
        console.warn("reCAPTCHA couldn't be reached");
        return false;
    })
};

// enables rapid local prototyping
api.use((req, res, next) => {
    if (process.env.NODE_ENV === "development") {
        res.append("Access-Control-Allow-Origin", "*");

        if (req.method === "OPTIONS") {
            res.append("Access-Control-Allow-Methods", "*");
            res.append("Access-Control-Allow-Headers", "*");
            res.status(200).json({});
            return;
        }
    }
    next();
});

// always check rate limiting
api.use(Limiter.check);

/*******************************
    END MIDDLEWARES
********************************/



/*******************************
    BEGIN ROUTERS
********************************/

const global_router = express.Router(["caseSensitive", "strict"]);

const tmwa_router = new (require("./routers/tmwa"))({
    timezone: process.env.TZ,
    name: process.env.TMWA__NAME,
    url: process.env.TMWA__URI,
    root: process.env.TMWA__ROOT,
    home: process.env.TMWA__HOME,
    reset: process.env.TMWA__RESET,
}, api, checkCaptcha);

const vault = new (require("./routers/vault"))
    (api, checkCaptcha);

global_router.use("/tmwa", tmwa_router);

vault.init().then(() => {
    global_router.use("/vault", vault.router);
})
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
});

api.set("trust proxy", "loopback"); // only allow localhost to communicate with the API
api.disable("x-powered-by"); // we don't need this header
console.log(`Running in ${process.env.NODE_ENV} mode`);
api.listen(process.env.PORT, () => console.info(`Listening on port ${process.env.PORT}`));
