module.exports = exports = (req, res, next) => {
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
            console.warn("a connection with the database couldn't be established");
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
                    console.info("a request to create an already-existent account was received", req.ip, query_params.USERNAME);
                    req.app.locals.rate_limiting.add(req.ip);
                    setTimeout(() => req.app.locals.rate_limiting.delete(req.ip), 2000);
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
                req.app.locals.rate_limiting.add(req.ip);
                setTimeout(() => req.app.locals.rate_limiting.delete(req.ip), 300000);
            }

            db.release(); // return this connection to the pool
        });
    });
};
