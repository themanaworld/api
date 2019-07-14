// this whole file would be a lot prettier with typescript interfaces
"use strict";
const uuidv4 = require("uuid/v4");
const execFile = require("child_process").execFile;
const ripgrep = require("ripgrep-bin");
const nodemailer = require("nodemailer");

const execAsync = (cmd, par) =>
    new Promise((resolve, reject) =>
        execFile(cmd, par, (error, stdout, stderr) =>
            resolve(error ? "" : (stdout ? stdout : stderr))));

const tmwa_account_regex = new RegExp("^(?<id>[0-9]+)\t(?<name>[^\t]+)\t[^\t]+\t(?<time>[^\t]+)\t[MFSN]\t(?<logins>[0-9]+)\t(?<state>[0-9]+)\t(?<email>[^\t]+)\t[^\t]+\t[0-9]+\t(?<ip>[0-9\.]+)");
const tmwa_char_regex = new RegExp("^(?<id>[0-9]+)\t(?<account>[0-9]+),[0-9]+\t(?<name>[^\t]+)\t");

const parseAccountLine = (line) => {
    const { groups: account } = tmwa_account_regex.exec(line);
    return {
        id: +account.id,
        name: account.name,
        last_login: Date.parse(account.time),
        active: !!+account.logins,
        banned: +account.state !== 0,
        email: account.email === "a@a.com" ? null : account.email,
        ip: (account.ip !== "0.0.0.0" && account.ip !== "127.0.0.1") ? account.ip : null,
    };
}

const parseCharLine = (line) => {
    const { groups: char } = tmwa_char_regex.exec(line);
    return {
        id: +char.id,
        account: +char.account,
        name: char.name,
    };
}

const findAccounts = async (regex, max) => {
    const stdout = await execAsync(ripgrep, ["--case-sensitive", `--max-count=${max}`, regex, "account.txt"]);
    const accounts = new Set();
    if (stdout.length)
        stdout.slice(0, -1).split("\n").forEach(line => accounts.add(parseAccountLine(line)));
    return accounts;
};

const findAccountsByID = async (account_id) => await findAccounts(`^${account_id}\t`, 1);
const findAccountsByName = async (name) => await findAccounts(`^[0-9]+\t${name}\t`, 1);
const findAccountsByEmail = async (email, max=20) => await findAccounts(`^[0-9]+\t[^\t]+\t[^\t]+\t[^\t]+\t[MFSN]\t[0-9]+\t[0-9]+\t${email}\t`, max);

const findChars = async (regex, max) => {
    const stdout = await execAsync(ripgrep, ["--case-sensitive", `--max-count=${max}`, regex, "athena.txt"]);
    const chars = new Set();
    if (stdout.length)
        stdout.slice(0, -1).split("\n").forEach(line => chars.add(parseCharLine(line)));
    return chars;
};

const findCharsByID = async (char_id) => await findChars(`^${char_id}\t`, 1);
const findCharsByName = async (name) => await findChars(`^[0-9]+\t[0-9]+,[0-9]+\t${name}\t`, 1);
const findCharsByAccount = async (account_id, max=20) => await findChars(`^[0-9]+\t${account_id},`, max);

const findCharsByAccountName = async (name) => {
    const accounts = await findAccountsByName(name);
    if (accounts.size > 0)
        return await findCharsByAccount(accounts.values().next().value.id);
    else
        return new Set();
};

const findCharsByEmail = async (email) => {
    const chars = new Set();
    const accounts = await findAccountsByEmail(email);
    for (const account of accounts) {
        const account_chars = await findCharsByAccount(account.id);
        account_chars.forEach(char =>
            chars.add(char))
    }
    return chars;
};

/// tmwa flatfile searching ^

let transporter = nodemailer.createTransport({
    sendmail: true,
    newline: 'unix',
    path: '/usr/sbin/sendmail'
});

const pending_operations = new Map();

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

    findAccountsByName(req.body.username).then(acc => {
        if (acc.size > 0) {
            res.status(409).json({
                status: "error",
                error: "already exists"
            });
            req.app.locals.rate_limiting.add(req.ip);
            setTimeout(() => req.app.locals.rate_limiting.delete(req.ip), 2000);
            return;
        }

        const child = execFile(`${req.app.locals.tmwa.home}/.local/bin/tmwa-admin`, [], {
            cwd: `${req.app.locals.tmwa.root}/login/`,
            env: {
                LD_LIBRARY_PATH: `${req.app.locals.tmwa.home}/.local/lib`,
            }
        });

        const email = req.body.email.length >= 3 ? req.body.email : "a@a.com";

        child.stdin.write(`create ${req.body.username} N ${email} ${req.body.password}\n`);
        child.stderr.on("data", data => {
            console.error("TMWA.account: an unexpected tmwa-admin error occured: %s", data);
            return;
        });
        child.stdout.on("data", data => {
            if (!data.includes("successfully")) {
                if (!data.includes("have a connection"))
                    console.error("TMWA.account: an unexpected tmwa-admin error occured: %s", data);
                child.kill();
                return;
            }

            res.status(201).json({
                status: "success"
            });
            req.app.locals.logger.info(`TMWA.account: an account was created: ${req.body.username} [${req.ip}]`);
            req.app.locals.rate_limiting.add(req.ip);
            setTimeout(() => req.app.locals.rate_limiting.delete(req.ip), 300000);

            if (email === "a@a.com")
                return;

            transporter.sendMail({
                from: req.app.locals.mailer.from,
                to: email,
                subject: "The Mana World account registration",
                text: `Your account (\"${req.body.username}\") was created successfully.\nHave fun playing The Mana World!`
            }, (err, info) => {
                req.app.locals.logger.info(`TMWA.account: sent account creation email: ${req.body.username} ${info.messageId}`);
            });
        });
        child.stdin.end();
    });
};



const reset_password = async (req, res, next) => {
    if (req.body && Reflect.has(req.body, "email") &&
        req.body.email.match(/^(?:[a-zA-Z0-9.$&+=_~-]{1,34}@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,35}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,34}[a-zA-Z0-9])?){0,9})$/) &&
        req.body.email.length >= 3 && req.body.email.length < 40 &&
        req.body.email !== "a@a.com") {

        const accounts = await findAccountsByEmail(req.body.email);

        if (accounts.size < 1) {
            res.status(404).json({
                status: "error",
                error: "no accounts found"
            });
            req.app.locals.rate_limiting.add(req.ip);
            setTimeout(() => req.app.locals.rate_limiting.delete(req.ip), 8000);
            return;
        }

        for (const [u, op] of pending_operations) {
            if (op.type !== "reset")
                continue;
            for (const account of op.accounts) {
                if (account.email === req.body.email) {
                    res.status(429).json({
                        status: "error",
                        error: "operation already pending"
                    });
                    req.app.locals.rate_limiting.add(req.ip);
                    setTimeout(() => req.app.locals.rate_limiting.delete(req.ip), 5000);
                    return;
                }
            }
        }

        let account_names = "";
        for (const ac of accounts) {
            account_names += `${ac.name}\n`;
        }

        const uuid = uuidv4();
        transporter.sendMail({
            from: req.app.locals.mailer.from,
            to: req.body.email,
            subject: "The Mana World password reset",
            text: "You are receiving this email because someone (you?) has requested a password reset on The Mana World "+
                   "with your email address.\nIf you did not request a password reset please ignore this email.\n\n"+
                   "The following accounts are associated with this email address:\n" + account_names + "\n"+
                   "To proceed with the password reset:\n" + `${req.app.locals.tmwa.reset}${uuid}`
        }, (err, info) => {
            pending_operations.set(uuid, {
                type: "reset",
                accounts: accounts,
                initiated: Date.now(),
                ip: req.ip,
                timeout: setTimeout(() => pending_operations.delete(uuid), 3600000), // 60 minutes
            });
            res.status(200).json({
                status: "success"
            });
            req.app.locals.logger.info(`TMWA.account: initiated password reset: ${info.messageId} [${req.ip}]`);
        });

        req.app.locals.rate_limiting.add(req.ip);
        setTimeout(() => req.app.locals.rate_limiting.delete(req.ip), 8000);
        return;
    } else if (req.body && Reflect.has(req.body, "username") &&
        !Reflect.has(req.body, "password") &&
        req.body.username.match(/^[a-zA-Z0-9]{4,23}$/)) {
        // recover by username (currently unsupported)
        res.status(501).json({
            status: "error",
            error: "not yet implemented"
        });
        return;
    }

    if (!req.body || !Reflect.has(req.body, "password") ||
        !Reflect.has(req.body, "username") ||
        !Reflect.has(req.body, "code") ||
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

    // actual reset happens here
    if (!pending_operations.has(req.body.code)) {
        res.status(408).json({
            status: "error",
            error: "request expired"
        });
        req.app.locals.rate_limiting.add(req.ip);
        setTimeout(() => req.app.locals.rate_limiting.delete(req.ip), 300000);
        return;
    }

    if (pending_operations.get(req.body.code).type !== "reset") {
        res.status(400).json({
            status: "error",
            error: "invalid type"
        });
        req.app.locals.rate_limiting.add(req.ip);
        setTimeout(() => req.app.locals.rate_limiting.delete(req.ip), 300000);
        pending_operations.delete(req.body.code);
        req.app.locals.logger.warn(`TMWA.account: attempted reset account with invalid uuid: ${req.body.username} [${req.ip}]`);
        return;
    }

    for (const account of pending_operations.get(req.body.code).accounts) {
        if (account.name === req.body.username) {
            pending_operations.delete(req.body.code);
            const child = execFile(`${req.app.locals.tmwa.home}/.local/bin/tmwa-admin`, [], {
                cwd: `${req.app.locals.tmwa.root}/login/`,
                env: {
                    LD_LIBRARY_PATH: `${req.app.locals.tmwa.home}/.local/lib`,
                }
            });

            child.stdin.write(`password ${req.body.username} ${req.body.password}\n`);
            child.stderr.on("data", data => {
                console.error("TMWA.account: an unexpected tmwa-admin error occured: %s", data);
                return;
            });
            child.stdout.on("data", data => {
                if (!data.includes("successfully")) {
                    if (!data.includes("have a connection"))
                        console.error("TMWA.account: an unexpected tmwa-admin error occured: %s", data);
                    child.kill();
                    return;
                }

                res.status(200).json({
                    status: "success"
                });
                req.app.locals.logger.info(`TMWA.account: password has been reset: ${req.body.username} [${req.ip}]`);
                req.app.locals.rate_limiting.add(req.ip);
                setTimeout(() => req.app.locals.rate_limiting.delete(req.ip), 300000);

                transporter.sendMail({
                    from: req.app.locals.mailer.from,
                    to: account.email,
                    subject: "The Mana World password reset",
                    text: `You have successfully reset the password for account \"${req.body.username}\".\nHave fun playing The Mana World!\n\n⚠ If you did not perform this password reset, please contact us ASAP to secure your account.`
                }, (err, info) => {
                    req.app.locals.logger.info(`TMWA.account: sent password reset confirmation email: ${req.body.username} ${info.messageId}`);
                });
            });
            child.stdin.end();
            return;
        }
    }

    res.status(401).json({
        status: "error",
        error: "foreign account"
    });
    req.app.locals.rate_limiting.add(req.ip);
    setTimeout(() => req.app.locals.rate_limiting.delete(req.ip), 300000);
    pending_operations.delete(req.body.code);
    req.app.locals.logger.warn(`TMWA.account: attempted reset account not owned by user: ${req.body.username} [${req.ip}]`);
    return;
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
