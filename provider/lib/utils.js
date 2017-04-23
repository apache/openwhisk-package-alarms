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
            if (dataTrigger.triggersLeft === 0) {
                that.disableTrigger(triggerIdentifier, undefined, 'Automatically disabled after reaching max triggers');
                logger.error(method, 'no more triggers left, disabled', triggerIdentifier);
            }
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
                        if (!error && that.shouldDisableTrigger(response.statusCode)) {
                            //disable trigger
                            var message = 'Automatically disabled after receiving a ' + response.statusCode + ' status code when firing the trigger';
                            that.disableTrigger(triggerIdentifier, response.statusCode, message);
                            reject('Disabled trigger ' + triggerIdentifier + ' due to status code: ' + response.statusCode);
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
                        resolve(triggerIdentifier);
                    }
                }
                catch(err) {
                    reject('Exception occurred while firing trigger ' + err);
                }
            });
        });
    };

    this.shouldDisableTrigger = function (statusCode) {
        return ((statusCode >= 400 && statusCode < 500) && [408, 429].indexOf(statusCode) === -1);
    };

    this.disableTrigger = function (triggerIdentifier, statusCode, message) {

        var method = 'disableTrigger';

        if (that.triggers[triggerIdentifier]) {
            if (that.triggers[triggerIdentifier].cronHandle) {
                that.triggers[triggerIdentifier].cronHandle.stop();
            }
            delete that.triggers[triggerIdentifier];
            logger.info(method, 'trigger', triggerIdentifier, 'successfully disabled');

            that.disableTriggerInDB(triggerIdentifier, statusCode, message);
            return true;
        }
        else {
            logger.info(method, 'trigger', triggerIdentifier, 'could not be found');
            return false;
        }
    };

    this.disableTriggerInDB = function (triggerIdentifier, statusCode, message) {

        var method = 'disableTriggerInDB';

        that.triggerDB.get(triggerIdentifier, function (err, existing) {
            if (!err) {
                if (!existing.status || existing.status.active === true) {
                    var updatedTrigger = existing;
                    var status = {
                        'active': false,
                        'dateChanged': new Date().toISOString(),
                        'reason': {'kind': 'AUTO', 'statusCode': statusCode, 'message': message}
                    };
                    updatedTrigger.status = status;

                    that.triggerDB.insert(updatedTrigger, triggerIdentifier, function (err) {
                        if (err) {
                            logger.error(method, 'there was an error while disabling', triggerIdentifier, 'in database.', err);
                        }
                        else {
                            logger.info(method, 'trigger', triggerIdentifier, 'successfully disabled in database');
                        }
                    });
                }
            }
            else {
                logger.error(method, 'could not find', triggerIdentifier, 'in database');
            }
        });
    };

    this.deleteTrigger = function (triggerIdentifier) {

        var method = 'deleteTrigger';

        if (that.triggers[triggerIdentifier]) {
            if (that.triggers[triggerIdentifier].cronHandle) {
                that.triggers[triggerIdentifier].cronHandle.stop();
            }
            delete that.triggers[triggerIdentifier];
            logger.info(method, 'trigger', triggerIdentifier, 'successfully deleted from memory');
        }
        //trigger may be disabled (removed from memory, but still exist in db)
       return that.deleteTriggerFromDB(triggerIdentifier);
    };

    this.deleteTriggerFromDB = function (triggerIdentifier) {

        var method = 'deleteTriggerFromDB';

        return new Promise(function(resolve, reject) {

            that.triggerDB.get(triggerIdentifier, function (err, existing) {
                if (!err) {
                    that.triggerDB.destroy(existing._id, existing._rev, function (err) {
                        if (err) {
                            var errorMessage = 'there was an error while deleting ' + triggerIdentifier + ' from database. ' + err;
                            logger.error(method, errorMessage);
                            reject(errorMessage);
                        }
                        else {
                            var message = 'trigger ' + triggerIdentifier + ' successfully deleted';
                            logger.info(method, message);
                            resolve(message);
                        }
                    });
                }
                else {
                    var message = 'could not find ' + triggerIdentifier + ' in database';
                    logger.error(method, message);
                    reject(message);
                }
            });
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
                    if (!trigger.doc.status || trigger.doc.status.active === true) {
                        //check if trigger still exists in whisk db
                        var namespace = trigger.doc.namespace;
                        var name = trigger.doc.name;
                        var apikey = trigger.doc.apikey;
                        var triggerIdentifier = that.getTriggerIdentifier(apikey, namespace, name);
                        logger.info(method, 'Checking if trigger', triggerIdentifier, 'still exists');

                        var host = 'https://' + routerHost + ':' + 443;
                        var triggerURL = host + '/api/v1/namespaces/' + namespace + '/triggers/' + name;
                        var auth = apikey.split(':');

                        request({
                            method: 'get',
                            url: triggerURL,
                            auth: {
                                user: auth[0],
                                pass: auth[1]
                            }
                        }, function (error, response) {
                            //disable trigger in database if trigger is dead
                            if (!error && that.shouldDisableTrigger(response.statusCode)) {
                                var message = 'Automatically disabled after receiving a ' + response.statusCode + ' status code when re-creating the trigger';
                                that.disableTriggerInDB(triggerIdentifier, response.statusCode, message);
                                logger.error(method, 'trigger', triggerIdentifier, 'has been disabled due to status code', response.statusCode);
                            }
                            else {
                                that.createTrigger(trigger.doc)
                                .then(triggerIdentifier => {
                                    logger.info(method, triggerIdentifier, 'created successfully');
                                }).catch(err => {
                                    var message = 'Automatically disabled after receiving an exception when re-creating the trigger';
                                    that.disableTriggerInDB(triggerIdentifier, undefined, message);
                                    logger.error(method, 'Disabled trigger', triggerIdentifier, 'due to exception:', err);
                                });
                            }
                        });
                    }
                    else {
                        logger.info(method, 'ignoring trigger', trigger.doc._id, 'since it is disabled.');
                    }
                });
            }
            else {
                logger.error(method, 'could not get latest state from database');
            }
        });
    };

    this.sendError = function (method, code, message, res) {
        logger.error(method, message);
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
