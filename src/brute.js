const limiters = new Map(); // Map<route, Map<ip, counter>>

const consume = (req, max = 5, expire = 3.6e6) => {
    const route = req.method + req.baseUrl + req.path;
    const route_map = limiters.get(route) || limiters.set(route, new Map()).get(route);
    const attempts = route_map.get(req.ip) || route_map.set(req.ip, []).get(req.ip);

    if (attempts.length >= max) {
        return 0;
    } else {
        attempts.push(setTimeout(() => attempts.pop(), expire));
        return max - attempts.length;
    }
};

module.exports = {
    consume,
};
