const axios = require('axios');

function isRestrictedPath(path) {
    const restrictedPath = ['/sources', '/plywood', '/plyql'];
    return restrictedPath.indexOf(path) > -1;
}


exports.plugin = function (app, pluginConfig, serverConfig, appConfig, logger) {
    app.use(async (req, res, next) => {
        // If path is not restricted, pass control to next handler. We restrict only `/settings` and `/plywood` endpoints
        if (!isRestrictedPath(req.path)) {
            next();
            return;
        }
        // Plugins have access to appSettings, so we get oauth settings from there
        const oauth = appConfig.oauth;
        // We read header with token. We can use tokenHeaderName to pick correct one.
        const token = req.header(oauth.tokenHeaderName);
        // If no token is present, we return 401 and Turnilo handles it on the client
        if (!token) {
            res.status(401).send();
            return;
        }
        // We send request to our identity server with token and client credentials. 
        // checkToken(token, pluginConfig.cas_server_url)
        //     .then((resp) => {
        //         // In turniloMetadata object we save user authorities to use in later plugins.
        //         req.turniloMetadata.authorities = resp.data.authorities;
        //         next();
        //     })
        //     .catch((error) => {
        //         // In case of error, we return 403 and Turnilo handles it on the client
        //         res.status(403).send();
        //     });
        axios.get(pluginConfig.cas_server_url, {
            params: {
                access_token: token
            }
        })
            .then(function (response) {
                // handle success
                next();
            })
            .catch(function (error) {
                // handle error
                res.status(403).send();
            });
    });
}