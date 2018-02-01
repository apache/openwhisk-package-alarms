const request = require('request');

module.exports = function(logger, triggerDB, uriHost) {

    var sanitizer = this;

    this.deleteTriggerFromDB = function(triggerID, retryCount) {
        var method = 'deleteTriggerFromDB';

        //delete from database
        triggerDB.get(triggerID, function (err, existing) {
            if (!err) {
                triggerDB.destroy(existing._id, existing._rev, function (err) {
                    if (err) {
                        if (err.statusCode === 409 && retryCount < 5) {
                            setTimeout(function () {
                                sanitizer.deleteTriggerFromDB(triggerID, (retryCount + 1));
                            }, 1000);
                        }
                        else {
                            logger.error(method, triggerID, 'there was an error deleting the trigger from the database');
                        }
                    }
                });
            }
            else {
                logger.error(method, triggerID, 'could not find the trigger in the database');
            }
        });
    };

    this.deleteTriggerAndRules = function(dataTrigger) {
        var method = 'deleteTriggerAndRules';

        var triggerIdentifier = dataTrigger.triggerID;
        var auth = dataTrigger.apikey.split(':');

        request({
            method: 'get',
            uri: dataTrigger.uri,
            auth: {
                user: auth[0],
                pass: auth[1]
            },
        }, function(error, response, body) {
            logger.info(method, triggerIdentifier, 'http get request, STATUS:', response ? response.statusCode : undefined);
            if (error || response.statusCode >= 400) {
                logger.error(method, triggerIdentifier, 'trigger get request failed');
            }
            else if (body) {
                try {
                    var jsonBody = JSON.parse(body);
                    for (var rule in jsonBody.rules) {
                        sanitizer.deleteRule(rule, auth);
                    }
                }
                catch(err) {
                    logger.error(method, triggerIdentifier, err);
                }
            }
            sanitizer.deleteTrigger(dataTrigger);
        });
    };

    this.deleteTrigger = function(dataTrigger) {
        var method = 'deleteTrigger';

        var triggerIdentifier = dataTrigger.triggerID;
        var auth = dataTrigger.apikey.split(':');
        request({
            method: 'delete',
            uri: dataTrigger.uri,
            auth: {
                user: auth[0],
                pass: auth[1]
            },
        }, function(error, response) {
            logger.info(method, triggerIdentifier, 'http delete request, STATUS:', response ? response.statusCode : undefined);
            if (error || response.statusCode >= 400) {
                logger.error(method, triggerIdentifier, 'trigger delete request failed');
            }
            else {
                logger.info(method, triggerIdentifier, 'trigger delete request was successful');
            }
        });
    };

    this.deleteRule = function(rule, auth) {
        var method = 'deleteRule';

        var qualifiedName = rule.split('/');
        var uri = uriHost + '/api/v1/namespaces/' + qualifiedName[0] + '/rules/' + qualifiedName[1];

        request({
            method: 'delete',
            uri: uri,
            auth: {
                user: auth[0],
                pass: auth[1]
            },
        }, function(error, response) {
            logger.info(method, rule, 'http delete rule request, STATUS:', response ? response.statusCode : undefined);
            if (error || response.statusCode >= 400) {
                logger.error(method, rule, 'rule delete request failed');
            }
            else {
                logger.info(method, rule, 'rule delete request was successful');
            }
        });
    };

};
