var _ = require('lodash');
var request = require('request');
var CronJob = require('cron').CronJob;
var constants = require('./constants.js');
var HttpStatus = require('http-status-codes');

module.exports = function(
  logger,
  triggerDB
) {
    this.module = 'utils';
    this.triggers = {};
    this.endpointAuth = process.env.ENDPOINT_AUTH;
    this.routerHost = process.env.ROUTER_HOST || 'localhost';
    this.active =  !(process.env.ACTIVE && process.env.ACTIVE.toLowerCase() === 'false');
    this.worker = process.env.WORKER || "worker0";

    var retryDelay = constants.RETRY_DELAY;
    var retryAttempts = constants.RETRY_ATTEMPTS;

    var ddname = 'triggers';
    var filter = 'only_triggers_by_worker';

    var utils = this;

    this.createTrigger = function(triggerIdentifier, newTrigger) {
        var method = 'createTrigger';

        try {
            var cronHandle;
            return new Promise(function(resolve, reject) {

                // to avoid multiple cron jobs for the same trigger we will only create a cron job if
                // the trigger is not already in the list of identified triggers
                if (!(triggerIdentifier in utils.triggers)) {
                    cronHandle = new CronJob(newTrigger.cron,
                        function onTick() {
                            if (utils.active) {
                                var triggerHandle = utils.triggers[triggerIdentifier];
                                if (triggerHandle && (triggerHandle.maxTriggers === -1 || triggerHandle.triggersLeft > 0)) {
                                    try {
                                        utils.fireTrigger(newTrigger.namespace, newTrigger.name, newTrigger.payload, newTrigger.apikey);
                                    } catch (e) {
                                        logger.error(method, 'Exception occurred while firing trigger', triggerIdentifier, e);
                                    }
                                }
                            }
                        }
                    );
                    logger.info(method, triggerIdentifier, 'starting cron job');
                    cronHandle.start();

                    var maxTriggers = newTrigger.maxTriggers || constants.DEFAULT_MAX_TRIGGERS;

                    utils.triggers[triggerIdentifier] = {
                        cron: newTrigger.cron,
                        cronHandle: cronHandle,
                        triggersLeft: maxTriggers,
                        maxTriggers: maxTriggers,
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

        var triggerIdentifier = utils.getTriggerIdentifier(apikey, namespace, name);
        var host = "https://" + utils.routerHost + ":443";
        var auth = apikey.split(':');
        var dataTrigger = utils.triggers[triggerIdentifier];
        var uri = host + '/api/v1/namespaces/' + namespace + '/triggers/' + name;

        utils.postTrigger(dataTrigger, payload, uri, auth, 0)
        .then(triggerId => {
            logger.info(method, 'Trigger', triggerId, 'was successfully fired');
            if (dataTrigger.triggersLeft === 0) {
                utils.disableTrigger(triggerIdentifier, undefined, 'Automatically disabled after reaching max triggers');
                logger.error(method, 'no more triggers left, disabled', triggerIdentifier);
            }
        }).catch(err => {
            logger.error(method, err);
        });
    };

    this.postTrigger = function (dataTrigger, payload, uri, auth, retryCount) {
        var method = 'postTrigger';

        return new Promise(function(resolve, reject) {

            // only manage trigger fires if they are not infinite
            if (dataTrigger.maxTriggers !== -1) {
                dataTrigger.triggersLeft--;
            }

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
                    var triggerIdentifier = utils.getTriggerIdentifier(dataTrigger.apikey, dataTrigger.namespace, dataTrigger.name);
                    logger.info(method, triggerIdentifier, 'http post request, STATUS:', response ? response.statusCode : response);

                    if (error || response.statusCode >= 400) {
                        // only manage trigger fires if they are not infinite
                        if (dataTrigger.maxTriggers !== -1) {
                            dataTrigger.triggersLeft++;
                        }
                        logger.error(method, 'there was an error invoking', triggerIdentifier, response ? response.statusCode : error);
                        if (!error && utils.shouldDisableTrigger(response.statusCode)) {
                            //disable trigger
                            var message = 'Automatically disabled after receiving a ' + response.statusCode + ' status code when firing the trigger';
                            utils.disableTrigger(triggerIdentifier, response.statusCode, message);
                            reject('Disabled trigger ' + triggerIdentifier + ' due to status code: ' + response.statusCode);
                        }
                        else {
                            if (retryCount < retryAttempts) {
                                logger.info(method, 'attempting to fire trigger again', triggerIdentifier, 'Retry Count:', (retryCount + 1));
                                setTimeout(function () {
                                    utils.postTrigger(dataTrigger, payload, uri, auth, (retryCount + 1))
                                    .then(triggerId => {
                                        resolve(triggerId);
                                    }).catch(err => {
                                        reject(err);
                                    });
                                }, retryDelay);
                            } else {
                                reject('Unable to reach server to fire trigger ' + triggerIdentifier);
                            }
                        }
                    } else {
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
        return ((statusCode >= 400 && statusCode < 500) &&
            [HttpStatus.REQUEST_TIMEOUT, HttpStatus.TOO_MANY_REQUESTS].indexOf(statusCode) === -1);
    };

    this.disableTrigger = function (triggerIdentifier, statusCode, message) {
        var method = 'disableTrigger';

        //only active/master provider should update the database
        if (utils.active) {
            triggerDB.get(triggerIdentifier, function (err, existing) {
                if (!err) {
                    if (!existing.status || existing.status.active === true) {
                        var updatedTrigger = existing;
                        var status = {
                            'active': false,
                            'dateChanged': new Date().toISOString(),
                            'reason': {'kind': 'AUTO', 'statusCode': statusCode, 'message': message}
                        };
                        updatedTrigger.status = status;

                        triggerDB.insert(updatedTrigger, triggerIdentifier, function (err) {
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
        }
    };

    this.deleteTrigger = function (triggerIdentifier) {
        var method = 'deleteTrigger';

        if (utils.triggers[triggerIdentifier].cronHandle) {
            utils.triggers[triggerIdentifier].cronHandle.stop();
        }
        delete utils.triggers[triggerIdentifier];
        logger.info(method, 'trigger', triggerIdentifier, 'successfully deleted from memory');
    };

    this.getTriggerIdentifier = function (apikey, namespace, name) {
        return apikey + '/' + namespace + '/' + name;
    };

    this.initAllTriggers = function () {
        var method = 'initAllTriggers';

        logger.info(method, 'resetting system from last state');

        triggerDB.changes({ since: 0, include_docs: true, filter: ddname + '/' + filter, worker: utils.worker }, (err, changes) => {
            if (!err) {
                changes.results.forEach(function (change) {
                    var triggerIdentifier = change.id;
                    var doc = change.doc;

                    if (!doc.status || doc.status.active === true) {
                        //check if trigger still exists in whisk db
                        var namespace = doc.namespace;
                        var name = doc.name;
                        var apikey = doc.apikey;
                        logger.info(method, 'Checking if trigger', triggerIdentifier, 'still exists');

                        var host = 'https://' + utils.routerHost + ':' + 443;
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
                            if (!error && utils.shouldDisableTrigger(response.statusCode)) {
                                var message = 'Automatically disabled after receiving a ' + response.statusCode + ' status code on init trigger';
                                utils.disableTrigger(triggerIdentifier, response.statusCode, message);
                                logger.error(method, 'trigger', triggerIdentifier, 'has been disabled due to status code', response.statusCode);
                            }
                            else {
                                utils.createTrigger(triggerIdentifier, doc)
                                .then(triggerIdentifier => {
                                    logger.info(method, triggerIdentifier, 'created successfully');
                                }).catch(err => {
                                    var message = 'Automatically disabled after receiving exception on init trigger: ' + err;
                                    utils.disableTrigger(triggerIdentifier, undefined, message);
                                    logger.error(method, 'Disabled trigger', triggerIdentifier, 'due to exception:', err);
                                });
                            }
                        });
                    }
                    else {
                        logger.info(method, 'ignoring trigger', triggerIdentifier, 'since it is disabled.');
                    }
                });
                utils.setupFollow(changes.last_seq);
            } else {
                logger.error(method, 'could not get latest state from database', err);
            }
        });
    };

    this.setupFollow = function setupFollow(seq) {
        var method = 'setupFollow';

        var feed = triggerDB.follow({ since: seq, include_docs: true, filter: ddname + '/' + filter, query_params: { worker: utils.worker } });

        feed.on('change', (change) => {
            var triggerIdentifier = change.id;
            var doc = change.doc;

            logger.info(method, 'got change for trigger', triggerIdentifier);

            if (utils.triggers[triggerIdentifier]) {
                if (doc.status && doc.status.active === false) {
                   utils.deleteTrigger(triggerIdentifier);
                }
            }
            else {
                //ignore changes to disabled triggers
                if (!doc.status || doc.status.active === true) {
                    utils.createTrigger(triggerIdentifier, doc)
                    .then(triggerIdentifier => {
                        logger.info(method, triggerIdentifier, 'created successfully');
                    }).catch(err => {
                        var message = 'Automatically disabled after receiving exception on create trigger: ' + err;
                        utils.disableTrigger(triggerIdentifier, undefined, message);
                        logger.error(method, 'Disabled trigger', triggerIdentifier, 'due to exception:', err);
                    });
                }
            }
        });
        feed.follow();
    };

    this.authorize = function(req, res, next) {
        var method = 'authorize';

        if (utils.endpointAuth) {

            if (!req.headers.authorization) {
                return utils.sendError(method, HttpStatus.BAD_REQUEST, 'Malformed request, authentication header expected', res);
            }

            var parts = req.headers.authorization.split(' ');
            if (parts[0].toLowerCase() !== 'basic' || !parts[1]) {
                return utils.sendError(method, HttpStatus.BAD_REQUEST, 'Malformed request, basic authentication expected', res);
            }

            var auth = new Buffer(parts[1], 'base64').toString();
            auth = auth.match(/^([^:]*):(.*)$/);
            if (!auth) {
                return utils.sendError(method, HttpStatus.BAD_REQUEST, 'Malformed request, authentication invalid', res);
            }

            var uuid = auth[1];
            var key = auth[2];

            var endpointAuth = utils.endpointAuth.split(':');

            if (endpointAuth[0] === uuid && endpointAuth[1] === key) {
                logger.info(method, 'Authentication successful');
                next();
            }
            else {
                logger.warn(method, 'Invalid key');
                return utils.sendError(method, HttpStatus.UNAUTHORIZED, 'Invalid key', res);
            }
        }
        else {
            next();
        }
    };

    this.sendError = function (method, code, message, res) {
        logger.error(method, message);
        res.status(code).json({error: message});
    };

};
