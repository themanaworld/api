const Fetch = require("node-fetch"); // from npm registry

// wraps the (match group) with some markdown syntax
const markdown = [
    [ /^(?:[^ ]{1,3} )?([a-z.]+)/i, "**" ], // endpoint
    [ /\{(\d+)\} (?:\[[a-z0-9.:]+\])?$/i, "_" ], // vault account
    [ /\[([a-z0-9.:]+)\]$/i, "`" ], // ip address
];

const md_prettify = (msg) => {
    for (const R of markdown) {
        msg = msg.replace(R[0], (m, p) => {
            const i = m.indexOf(p), l = p.length;
            return m.slice(0, i) + R[1] + p + R[1] + m.slice(i + l);
        });
    }

    return msg;
};

const send_hook = (msg) => {
    console.log(msg);

    if (process.env.LOGGER__WEBHOOK) {
        Fetch(process.env.LOGGER__WEBHOOK, {
            method: "POST",
            cache: "no-cache",
            redirect: "follow",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                content: md_prettify(msg),
            }),
        });
    }
};

module.exports = {
    log: msg => send_hook(`${msg}`),
    info: msg => send_hook(`ℹ ${msg}`),
    warn: msg => send_hook(`⚠ ${msg}`),
    error: msg => send_hook(`❌ ${msg}`),
};
