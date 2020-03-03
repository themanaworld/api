const limiters = new Map(); // Map<route, Map<ip, {Timeout}>>
const bad_actors = new Map(); // Map<ip, badness>

const MAX_DANGER = 5; // ban after X bad things
const BAN_HOURS = 6; // ban X hours on max danger

const setLimiter = (req, cooldown = 1e3) => {
    const route = req.method + req.baseUrl + req.path;
    let route_map = limiters.get(route);
    if (route_map === undefined || route_map === null) {
        route_map = limiters.set(route, new Map()).get(route);
    }

    const active_timer = route_map.get(req.ip);
    if (active_timer) {
        clearTimeout(active_timer.timer);
    }

    // if cooldown is above 5min, assume they did something bad
    if (cooldown >= 3e5) {
        const bad_level = (bad_actors.get(req.ip) || 0) + 1;

        if (bad_level > MAX_DANGER) {
            console.warn(`Limiter: bad actor above max danger level [${req.ip}]`);
        } else {
            bad_actors.set(req.ip, bad_level);
            setTimeout(() => {
                const current_level = bad_actors.get(req.ip) || 1;
                bad_actors.set(req.ip, current_level - 1);

                if (current_level === MAX_DANGER) {
                    req.app.locals.logger.info(`Limiter: unbanning IP (ban expired) [${req.ip}]`);
                } else {
                    console.info(`Limiter: decreasing threat level of IP (was level ${current_level}) [${req.ip}]`);
                }
            }, BAN_HOURS * 3.6e6); // decrease danger level every X hours

            if (bad_level === MAX_DANGER) {
                req.app.locals.logger.warn(`Limiter: banning IP for ${BAN_HOURS} hours [${req.ip}]`);
            } else {
                console.warn(`Limiter: bad actor (threat level ${bad_level}) [${req.ip}]`);
            }
        }
    }

    route_map.set(req.ip, {
        timer: setTimeout(() => limiters.get(route).delete(req.ip), cooldown),
        expires: Date.now() + cooldown,
    });
};

const checkRateLimiter = (req, res, next) => {
    const route = req.method + req.path;
    const route_map = limiters.get(route);
    let timer;
    if (route_map && (timer = route_map.get(req.ip))) {
        const left = Math.ceil((timer.expires - Date.now()) / 1000);
        res.append("Retry-After", left);
        res.status(429).json({
            status: "error",
            error: "too many requests",
            retry: left,
        });
    } else if ((bad_actors.get(req.ip) || 0) >= MAX_DANGER) {
        // refuse to process request
        res.status(418).json({
            status: "GTFO",
        });
    } else {
        next();
    }
    return;
};

module.exports = {
    cooldown: setLimiter,
    check: checkRateLimiter,
};
