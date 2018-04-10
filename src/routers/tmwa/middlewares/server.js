module.exports = exports = (req, res, next) => {
    res.append("Access-Control-Allow-Origin", "*"); // CORS ready
    res.status(200).json({
        "@context": "http://schema.org",
        "@type": "GameServer",
        name: req.app.locals.tmwa.name,
        url: req.app.locals.tmwa.url,
        playersOnline: req.app.locals.tmwa.num_online,
        serverStatus: req.app.locals.tmwa.status,
    });
};
