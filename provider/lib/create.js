var request = require('request');

module.exports = function (logger, utils) {

    // Test Endpoint
    this.endPoint = '/triggers';

    // Create Logic
    this.create = function (req, res) {

        var method = 'POST /triggers';

        utils.logger.info(method, 'Got trigger', req.body);

        var newTrigger = req.body;

        // early exits
        if (!newTrigger.namespace) {
            return utils.sendError(method, 400, 'no namespace provided', res);
        }
        if (!newTrigger.name) {
            return utils.sendError(method, 400, 'no name provided', res);
        }
        if (!newTrigger.cron) {
            return utils.sendError(method, 400, 'no cron provided', res);
        }

        // if the trigger creation request has not set the max trigger fire limit
        // we will set it here (default value can be updated in ./constants.js)
        if (!newTrigger.maxTriggers) {
            newTrigger.maxTriggers = utils.defaultTriggerFireLimit;
        }

        if (!req.user.uuid) {
            return utils.sendError(method, 400, 'no user uuid was detected', res);
        }
        if (!req.user.key) {
            return utils.sendError(method, 400, 'no user key was detected', res);
        }
        newTrigger.apikey = req.user.uuid + ':' + req.user.key;

        //Check that user has access rights to create a trigger
        var host = 'https://' + utils.routerHost +':'+ 443;
        var triggerURL = host + '/api/v1/namespaces/' + newTrigger.namespace + '/triggers/' + newTrigger.name;

        logger.info(method, 'Checking if user has access rights to create a trigger');
        request({
            method: 'get',
            url: triggerURL,
            auth: {
                user: req.user.uuid,
                pass: req.user.key
            }
        }, function(error, response, body) {
            if (error || response.statusCode >= 400) {
                var errorMsg = 'Trigger authentication request failed.';
                logger.error(method, errorMsg, error);
                if (error) {
                    res.status(400).json({
                        message: errorMsg,
                        error: error.message
                    });
                }
                else {
                    var info = JSON.parse(body);
                    res.status(response.statusCode).json({
                        message: errorMsg,
                        error: info.error
                    });
                }
            }
            else {
                try {
                    utils.createTrigger(newTrigger);
                }
                catch (e) {
                    logger.error(method, e);
                    return utils.sendError(method, 400, 'error creating alarm trigger', res);
                }

                var triggerIdentifier = utils.getTriggerIdentifier(newTrigger.apikey, newTrigger.namespace, newTrigger.name);
                utils.triggerDB.insert(newTrigger, triggerIdentifier, function (err) {
                    if (!err) {
                        res.status(200).json({ok: 'your trigger was created successfully'});
                    }
                });
            }
        });
    }; // end create

};
