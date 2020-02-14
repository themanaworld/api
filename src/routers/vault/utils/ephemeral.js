// TODO: use Redis for in-memory caching of sessions

// this was originally a Proxy<Map<String, Session>> but was replaced because of a nodejs bug
// XXX: maybe we should use an already-existing Express session manager // NIH syndrome
const timeout_symbol = Symbol("timeout");
const hydrate_symbol = Symbol("hydrate");
const container_symbol = Symbol("container");
const session_handler = {
    [container_symbol]: new Map(),
    [hydrate_symbol] (key, obj) {
        if (obj === null || obj === undefined)
            return obj;

        if (Reflect.has(obj, timeout_symbol))
            clearTimeout(obj[timeout_symbol]);

        let expires = new Date();
        expires.setUTCHours(expires.getUTCHours() + 6);
        obj.expires = expires // this could also be a symbol
        obj[timeout_symbol] = setTimeout(() => session_handler.delete(key), 6 * 3600000); // 6 hours

        return obj;
    },
    has (key) {
        return session_handler[container_symbol].has(key);
    },
    get (key) {
        return session_handler[hydrate_symbol](key, session_handler[container_symbol].get(key));
    },
    set (key, obj) {
        return session_handler[container_symbol].set(key, session_handler[hydrate_symbol](key, obj));
    },
    delete (key) {
        if (session_handler[container_symbol].get(key) && session_handler[container_symbol].get(key)[timeout_symbol])
            clearTimeout(session_handler[container_symbol].get(key)[timeout_symbol]);
        return session_handler[container_symbol].delete(key);
    },
    [Symbol.iterator]: function* () {
        for (const [key, obj] of session_handler[container_symbol]) {
            yield [key, obj];
        }
    },
};

// TODO: DRY this shit
const identity_handler = {
    [container_symbol]: new Map(),
    [hydrate_symbol] (key, obj) {
        if (obj === null || obj === undefined)
            return obj;

        if (Reflect.has(obj, timeout_symbol))
            clearTimeout(obj[timeout_symbol]);

        let expires = new Date();
        expires.setUTCMinutes(expires.getUTCMinutes() + 30);
        obj.expires = expires // this could also be a symbol
        obj[timeout_symbol] = setTimeout(() => identity_handler.delete(key), 30 * 60000); // 30 minutes

        return obj;
    },
    has (key) {
        return identity_handler[container_symbol].has(key);
    },
    get (key) {
        return identity_handler[container_symbol].get(key);
    },
    set (key, obj) {
        return identity_handler[container_symbol].set(key, identity_handler[hydrate_symbol](key, obj));
    },
    delete (key) {
        if (identity_handler[container_symbol].get(key) && identity_handler[container_symbol].get(key)[timeout_symbol])
            clearTimeout(identity_handler[container_symbol].get(key)[timeout_symbol]);
        return identity_handler[container_symbol].delete(key);
    },
    [Symbol.iterator]: function* () {
        for (const [key, obj] of identity_handler[container_symbol]) {
            yield [key, obj];
        }
    },
};


module.exports = {
    session_handler,
    identity_handler,
}
