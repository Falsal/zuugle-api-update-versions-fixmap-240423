//configuration allows a server to accept requests from specific domains ("whitelist") and reject requests from all other domains.
export const getZuugleCors = () => {
    const whitelist = ['http://localhost:3000', 'http://localhost:8080', 'https://www.zuugle.at', 'https://www.zuugle.de', 'https://www.zuugle.ch', 'https://www.zuugle.it', 'https://www2.zuugle.at', 'https://www.zuugle.si', 'https://www.zuugle.fr']
    const corsOptions = {
        origin: function (origin, callback) {
            if (origin === undefined || whitelist.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'))
            }
        }
    }
    return corsOptions;
}

export const hostMiddleware = (req, res, next) => {
    const isPostman = !!req.headers['user-agent'] && req.headers['user-agent'].indexOf('Postman') >= 0;
    const hostWhitelist = ['localhost:8080', 'localhost:3000', 'localhost:4000', 'www.zuugle.at', 'www.zuugle.de', 'www.zuugle.ch', 'www.zuugle.it', 'www2.zuugle.at', 'www.zuugle.fr', 'www.zuugle.si'];
    try {
        const host = req.headers['host'];
        if(hostWhitelist.indexOf(host) === -1 || isPostman){
            res.status(500).json({});
            return;
        } else {
            next();
        }
    } catch(e){
        console.error(e);
    }
}