var _ = require('lodash');
var request = require('request');
var CronJob = require('cron').CronJob;
var constants = require('./constants.js');

module.exports = function(
  logger,
  app,
  triggerDB,
  routerHost
) {

    this.logger = logger;
    this.app = app;
    this.triggerDB = triggerDB;
    this.routerHost = routerHost;

    // this is the default trigger fire limit (in the event that is was not set during trigger creation)
    this.defaultTriggerFireLimit = constants.DEFAULT_MAX_TRIGGERS;
    this.retryDelay = constants.RETRY_DELAY;
    this.retryAttempts = constants.RETRY_ATTEMPTS;

    // Log HTTP Requests
    app.use(function(req, res, next) {
        if (req.url.indexOf('/alarmtriggers') === 0) {
            logger.info('HttpRequest', req.method, req.url);
        }
        next();
    });

    this.module = 'utils';
    this.triggers = {};

    var that = this;

    this.createTrigger = function(newTrigger) {

        var method = 'createTrigger';

        try {
            var triggerIdentifier = that.getTriggerIdentifier(newTrigger.apikey, newTrigger.namespace, newTrigger.name);
            var cronHandle;

            return new Promise(function(resolve, reject) {

                // to avoid multiple cron jobs for the same trigger we will only create a cron job if
                // the trigger is not already in the list of identified triggers
                if (!(triggerIdentifier in that.triggers)) {
                    cronHandle = new CronJob(newTrigger.cron,
                        function onTick() {
                            var triggerHandle = that.triggers[triggerIdentifier];
                            if (triggerHandle && (triggerHandle.maxTriggers === -1 || triggerHandle.triggersLeft > 0)) {
                                try {
                                    that.fireTrigger(newTrigger.namespace, newTrigger.name, newTrigger.payload, newTrigger.apikey);
                                } catch (e) {
                                    logger.error(method, 'Exception occurred while firing trigger', triggerIdentifier,  e);
                                }
                            }
                        }
                    );
                    logger.info(method, triggerIdentifier, 'starting cron job');
                    cronHandle.start();

                    that.triggers[triggerIdentifier] = {
                        cron: newTrigger.cron,
                        cronHandle: cronHandle,
                        triggersLeft: newTrigger.maxTriggers,
                        maxTriggers: newTrigger.maxTriggers,
                        apikey: newTrigger.apikey,
                        name: newTrigger.name,
                        namespace: newTrigger.namespace
                    };
                }
                else {
                    logger.info(method, triggerIdentifier, 'already exists');
                }
                resolve(triggerIdentifier);
            });

        } catch (err) {
            return Promise.reject(err);
        }
    };

    this.fireTrigger = function (namespace, name, payload, apikey) {
        var method = 'fireTrigger';
        var triggerIdentifier = that.getTriggerIdentifier(apikey, namespace, name);
        var routerHost = process.env.ROUTER_HOST;
        var host = "https://" + routerHost + ":443";
        // https://github.com/openwhisk/openwhisk-alarms-trigger/issues/9
        // resolved this in create.js by validating apikey and failing with a useful message if it is
        // not present
        var auth = apikey.split(':');
        var dataTrigger = that.triggers[triggerIdentifier];
        var uri = host + '/api/v1/namespaces/' + namespace + '/triggers/' + name;

        that.postTrigger(dataTrigger, payload, uri, auth, that.retryAttempts)
        .then(triggerId => {
            logger.info(method, 'Trigger', triggerId, 'was successfully fired');
        }).catch(err => {
            logger.error(method, err);
        });
    };

    this.postTrigger = function (dataTrigger, payload, uri, auth, retryCount) {
        var method = 'postTrigger';

        return new Promise(function(resolve, reject) {

            request({
                method: 'post',
                uri: uri,
                auth: {
                    user: auth[0],
                    pass: auth[1]
                },
                json: payload
            }, function(error, response) {
                try {
                    var triggerIdentifier = that.getTriggerIdentifier(dataTrigger.apikey, dataTrigger.namespace, dataTrigger.name);
                    logger.info(method, triggerIdentifier, 'http post request, STATUS:', response ? response.statusCode : response);

                    if (error || response.statusCode >= 400) {
                        logger.error(method, 'there was an error invoking', triggerIdentifier, response ? response.statusCode : error);
                        if (!error && [408, 429, 500, 502, 503, 504].indexOf(response.statusCode) === -1) {
                            //delete dead triggers
                            that.deleteTrigger(dataTrigger.namespace, dataTrigger.name, dataTrigger.apikey);
                            reject('Deleted dead trigger ' + triggerIdentifier);
                        }
                        else {
                            if (retryCount > 0) {
                                logger.info(method, 'attempting to fire trigger again', triggerIdentifier, 'Retry Count:', (retryCount - 1));
                                setTimeout(function () {
                                    that.postTrigger(dataTrigger, payload, uri, auth, (retryCount - 1))
                                    .then(triggerId => {
                                        resolve(triggerId);
                                    }).catch(err => {
                                        reject(err);
                                    });
                                }, that.retryDelay);
                            } else {
                                reject('Unable to reach server to fire trigger ' + triggerIdentifier);
                            }
                        }
                    } else {
                        // only manage trigger fires if they are not infinite
                        if (dataTrigger.maxTriggers !== -1) {
                            dataTrigger.triggersLeft--;
                        }
                        logger.info(method, 'fired', triggerIdentifier, dataTrigger.triggersLeft, 'triggers left');

                        if (dataTrigger.triggersLeft === 0) {
                            logger.info(method, 'no more triggers left, deleting', triggerIdentifier);
                            that.deleteTrigger(dataTrigger.namespace, dataTrigger.name, dataTrigger.apikey);
                        }
                        resolve(triggerIdentifier);
                    }
                }
                catch(err) {
                    reject('Exception occurred while firing trigger ' + err);
                }
            });
        });
    };

    this.deleteTrigger = function (namespace, name, apikey) {

        var method = 'deleteTrigger';

        var triggerIdentifier = that.getTriggerIdentifier(apikey, namespace, name);
        if (that.triggers[triggerIdentifier]) {
            if (that.triggers[triggerIdentifier].cronHandle) {
                that.triggers[triggerIdentifier].cronHandle.stop();
            }
            delete that.triggers[triggerIdentifier];

            logger.info(method, 'trigger', triggerIdentifier, 'successfully deleted');

            that.deleteTriggerFromDB(triggerIdentifier);
            return true;
        }
        else {
            logger.info(method, 'trigger', triggerIdentifier, 'could not be found');
            return false;
        }
    };

    this.deleteTriggerFromDB = function (triggerIdentifier) {

        var method = 'deleteTriggerFromDB';

        that.triggerDB.get(triggerIdentifier, function (err, body) {
            if (!err) {
                that.triggerDB.destroy(body._id, body._rev, function (err) {
                    if (err) {
                        logger.error(method, 'there was an error while deleting', triggerIdentifier, 'from database');
                    }
                    else {
                        logger.info(method, 'trigger', triggerIdentifier, 'successfully deleted from database');
                    }
                });
            }
            else {
                logger.error(method, 'there was an error while deleting', triggerIdentifier, 'from database');
            }
        });
    };

    this.getTriggerIdentifier = function (apikey, namespace, name) {
        return apikey + '/' + namespace + '/' + name;
    };

    this.initAllTriggers = function () {
        var method = 'initAllTriggers';
        logger.info(method, 'resetting system from last state');
        that.triggerDB.view('filters', 'only_triggers', {include_docs: true}, function(err, body) {
            if (!err) {
                body.rows.forEach(function(trigger) {
                    //check if trigger still exists in whisk db
                    var namespace = trigger.doc.namespace;
                    var name = trigger.doc.name;
                    var apikey = trigger.doc.apikey;
                    var triggerIdentifier = that.getTriggerIdentifier(apikey, namespace, name);
                    logger.info(method, 'Checking if trigger', triggerIdentifier, 'still exists');

                    var host = 'https://' + routerHost +':'+ 443;
                    var triggerURL = host + '/api/v1/namespaces/' + namespace + '/triggers/' + name;
                    var auth = apikey.split(':');

                    request({
                        method: 'get',
                        url: triggerURL,
                        auth: {
                            user: auth[0],
                            pass: auth[1]
                        }
                    }, function(error, response) {
                        //delete from database if trigger no longer exists (404)
                        if (!error && response.statusCode === 404) {
                            logger.info(method, 'trigger', triggerIdentifier, 'could not be found');
                            that.deleteTriggerFromDB(triggerIdentifier);
                        }
                        else {
                            that.createTrigger(trigger.doc)
                            .then(triggerIdentifier => {
                                logger.info(method, triggerIdentifier, 'created successfully');
                            })
                            .catch(err => {
                                logger.error(method, err);
                                that.deleteTriggerFromDB(triggerIdentifier);
                            });
                        }
                    });
                });
            }
            else {
                logger.error(method, 'could not get latest state from database');
            }
        });
    };

    this.sendError = function (method, code, message, res) {
        logger.warn(method, message);
        res.status(code).json({error: message});
    };

    this.authorize = function(req, res, next) {
        if (!req.headers.authorization) {
            return that.sendError(400, 'Malformed request, authentication header expected', res);
        }

        var parts = req.headers.authorization.split(' ');
        if (parts[0].toLowerCase() !== 'basic' || !parts[1]) {
            return that.sendError(400, 'Malformed request, basic authentication expected', res);
        }

        var auth = new Buffer(parts[1], 'base64').toString();
        auth = auth.match(/^([^:]*):(.*)$/);
        if (!auth) {
            return that.sendError(400, 'Malformed request, authentication invalid', res);
        }

        req.user = {
            uuid: auth[1],
            key: auth[2]
        };

        next();
    };

};
