const randomNumber = require("random-number-csprng");

const create_account = (req, res, next) => {
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
        req.app.locals.rate_limiting.add(req.ip);
        setTimeout(() => req.app.locals.rate_limiting.delete(req.ip), 300000);
        return;
    }

    req.app.locals.tmwa.db_pool.getConnection((err, db) => {
        if (err) {
            res.status(500).json({
                status: "error",
                error: "couldn't reach the database"
            });
            console.warn("TMWA.account: a connection with the database couldn't be established");
            return;
        }

        const query_params = {
            "USERNAME": req.body.username,
            "PASSWORD": req.body.password,
            "EMAIL": req.body.email || "a@a.com",
            "GENDER": "N",
        };

        db.query(`INSERT INTO ${req.app.locals.tmwa.db_tables.register} SET ?`, query_params, (err, rows, fields) => {
            if (err) {
                if (err.code === "ER_DUP_ENTRY") {
                    res.status(409).json({
                        status: "error",
                        error: "already exists"
                    });
                    req.app.locals.rate_limiting.add(req.ip);
                    setTimeout(() => req.app.locals.rate_limiting.delete(req.ip), 2000);
                } else {
                    res.status(500).json({
                        status: "error",
                        error: "couldn't add the user"
                    });
                    console.error("TMWA.account: an unexpected sql error occured: %s", err.code);
                }
            } else {
                res.status(201).json({
                    status: "success"
                });
                console.info("TMWA.account: an account was created: %s [%s]", query_params.USERNAME, req.ip);
                req.app.locals.rate_limiting.add(req.ip);
                setTimeout(() => req.app.locals.rate_limiting.delete(req.ip), 300000);
            }

            db.release(); // return this connection to the pool
        });
    });
};



const reset_password = async (req, res, next) => {
    if (req.body && Reflect.has(req.body, "email") &&
        Reflect.has(req.body, "username") &&
        req.body.username.match(/^[a-zA-Z0-9]{4,23}$/) &&
        req.body.email.match(/^(?:[a-zA-Z0-9.$&+=_~-]{1,34}@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,35}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,34}[a-zA-Z0-9])?){0,9})$/) &&
        req.body.email.length >= 3 && req.body.email.length < 40)
    {
        req.app.locals.tmwa.db_pool.getConnection(async (err, db) => {
            if (err) {
                res.status(500).json({
                    status: "error",
                    error: "couldn't reach the database"
                });
                console.warn("TMWA.account: a connection with the database couldn't be established");
                return;
            }

            // XXX: we might want to use uuid instead, and put the value in the url directly
            const rng = await randomNumber(1000000, 999999999999);
            const code = String(rng).padStart(12, "0");

            const query_params = { // SET
                "PASSWORD": code,
                "STATE": 3,
            };

            db.query(`UPDATE ${req.app.locals.tmwa.db_tables.register} SET ? WHERE USERNAME = ? AND EMAIL = ? AND STATE = 1`, [query_params, req.body.username, req.body.email], (err, rows, fields) => {
                if (err) {
                    res.status(500).json({
                        status: "error",
                        error: "couldn't send a password reset"
                    });
                    console.error("TMWA.account: an unexpected sql error occured: %s", err.code);
                } else {
                    res.status(200).json({
                        status: "success"
                    });
                    req.app.locals.rate_limiting.add(req.ip);
                    setTimeout(() => req.app.locals.rate_limiting.delete(req.ip), 5000);

                    // TODO: make the request expire and change the STATE back to 1 upon expiration
                }

                db.release(); // return this connection to the pool
            });
        });
        return;
    }

    if (!req.body || !Reflect.has(req.body, "username") ||
        !Reflect.has(req.body, "password") || !Reflect.has(req.body, "code") ||
        !req.body.username.match(/^[a-zA-Z0-9]{4,23}$/) ||
        !req.body.password.match(/^[a-zA-Z0-9]{4,23}$/) ||
        !req.body.code.match(/^[a-zA-Z0-9-_]{6,128}$/))
    {
        res.status(400).json({
            status: "error",
            error: "malformed request"
        });
        req.app.locals.rate_limiting.add(req.ip);
        setTimeout(() => req.app.locals.rate_limiting.delete(req.ip), 300000);
        return;
    }

    req.app.locals.tmwa.db_pool.getConnection((err, db) => {
        if (err) {
            res.status(500).json({
                status: "error",
                error: "couldn't reach the database"
            });
            console.warn("TMWA.account: a connection with the database couldn't be established");
            return;
        }

        const query_params = { // SET
            "PASSWORD": req.body.password,
            "STATE": 5,
        };

        db.query(`UPDATE ${req.app.locals.tmwa.db_tables.register} SET ? WHERE USERNAME = ? AND PASSWORD = ? AND STATE = 4`, [query_params, req.body.username, req.body.code], (err, rows, fields) => {
            if (err) {
                res.status(500).json({
                    status: "error",
                    error: "couldn't change the password"
                });
                console.error("TMWA.account: an unexpected sql error occured: %s", err.code);
            } else if (rows.affectedRows < 1) {
                res.status(403).json({
                    status: "error",
                    error: "invalid code"
                });
                req.app.locals.rate_limiting.add(req.ip);
                setTimeout(() => req.app.locals.rate_limiting.delete(req.ip), 2000);
                return;
            } else {
                res.status(200).json({
                    status: "success"
                });
                console.info("TMWA.account: a password was reset: %s [%s]", query_params.USERNAME, req.ip);
                req.app.locals.rate_limiting.add(req.ip);
                setTimeout(() => req.app.locals.rate_limiting.delete(req.ip), 300000);
            }

            db.release(); // return this connection to the pool
        });
    });
};



module.exports = exports = (req, res, next) => {
    switch(req.method) {
        case "POST":
            return create_account(req, res, next);
        case "PUT":
            return reset_password(req, res, next);
        default:
            next(); // fallthrough to default endpoint (404)
    }
};
