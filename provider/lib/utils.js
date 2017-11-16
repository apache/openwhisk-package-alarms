var request = require('request');
var HttpStatus = require('http-status-codes');
var lt =  require('long-timeout');
var constants = require('./constants.js');
var DateAlarm = require('./dateAlarm.js');
var CronAlarm = require('./cronAlarm.js');
var IntervalAlarm = require('./intervalAlarm.js');

module.exports = function(
  logger,
  triggerDB,
  redisClient
) {
    this.module = 'utils';
    this.triggers = {};
    this.endpointAuth = process.env.ENDPOINT_AUTH;
    this.routerHost = process.env.ROUTER_HOST || 'localhost';
    this.worker = process.env.WORKER || 'worker0';
    this.host = process.env.HOST_INDEX || 'host0';
    this.hostMachine = process.env.HOST_MACHINE;
    this.activeHost = 'host0'; //default value on init (will be updated for existing redis)
    this.redisClient = redisClient;
    this.redisHash = triggerDB.config.db + '_' + this.worker;
    this.redisKey = constants.REDIS_KEY;

    var retryDelay = constants.RETRY_DELAY;
    var retryAttempts = constants.RETRY_ATTEMPTS;
    var filterDDName = constants.FILTERS_DESIGN_DOC;
    var viewDDName = constants.VIEWS_DESIGN_DOC;
    var triggersByWorker = constants.TRIGGERS_BY_WORKER;
    var utils = this;

    this.createTrigger = function(triggerIdentifier, newTrigger) {
        var method = 'createTrigger';

        var callback = function onTick() {
            if (utils.activeHost === utils.host) {
                var triggerHandle = utils.triggers[triggerIdentifier];
                if (triggerHandle && (!triggerHandle.maxTriggers || triggerHandle.maxTriggers === -1 || triggerHandle.triggersLeft > 0)) {
                    try {
                        utils.fireTrigger(triggerHandle);
                    } catch (e) {
                        logger.error(method, 'Exception occurred while firing trigger', triggerIdentifier, e);
                    }
                }
            }
        };

        var alarm;
        if (newTrigger.date) {
            alarm = new DateAlarm(logger, newTrigger);
        }
        else if (newTrigger.minutes) {
            alarm = new IntervalAlarm(logger, newTrigger);
        }
        else {
            alarm = new CronAlarm(logger, newTrigger);
        }

        return alarm.scheduleAlarm(triggerIdentifier, callback);
    };

    this.fireTrigger = function(dataTrigger) {
        var method = 'fireTrigger';

        var triggerIdentifier = utils.getTriggerIdentifier(dataTrigger.apikey, dataTrigger.namespace, dataTrigger.name);
        var host = 'https://' + utils.routerHost + ':443';
        var auth = dataTrigger.apikey.split(':');
        var uri = host + '/api/v1/namespaces/' + dataTrigger.namespace + '/triggers/' + dataTrigger.name;

        logger.info(method, 'Alarm fired for', triggerIdentifier, 'attempting to fire trigger');
        utils.postTrigger(dataTrigger, uri, auth, 0)
        .then(triggerId => {
            logger.info(method, 'Trigger', triggerId, 'was successfully fired');
            utils.disableExtinctTriggers(triggerIdentifier, dataTrigger);
        })
        .catch(err => {
            logger.error(method, err);
            utils.disableExtinctTriggers(triggerIdentifier, dataTrigger);
        });
    };

    this.postTrigger = function(dataTrigger, uri, auth, retryCount) {
        var method = 'postTrigger';

        return new Promise(function(resolve, reject) {

            // only manage trigger fires if they are not infinite
            if (dataTrigger.maxTriggers && dataTrigger.maxTriggers !== -1) {
                dataTrigger.triggersLeft--;
            }

            request({
                method: 'post',
                uri: uri,
                auth: {
                    user: auth[0],
                    pass: auth[1]
                },
                json: dataTrigger.payload
            }, function(error, response) {
                try {
                    var triggerIdentifier = utils.getTriggerIdentifier(dataTrigger.apikey, dataTrigger.namespace, dataTrigger.name);
                    logger.info(method, triggerIdentifier, 'http post request, STATUS:', response ? response.statusCode : response);

                    if (error || response.statusCode >= 400) {
                        // only manage trigger fires if they are not infinite
                        if (dataTrigger.maxTriggers && dataTrigger.maxTriggers !== -1) {
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
                                    utils.postTrigger(dataTrigger, uri, auth, (retryCount + 1))
                                    .then(triggerId => {
                                        resolve(triggerId);
                                    })
                                    .catch(err => {
                                        reject(err);
                                    });
                                }, retryDelay);
                            } else {
                                reject('Unable to reach server to fire trigger ' + triggerIdentifier);
                            }
                        }
                    } else {
                        logger.info(method, 'fired', triggerIdentifier);
                        resolve(triggerIdentifier);
                    }
                }
                catch(err) {
                    reject('Exception occurred while firing trigger ' + err);
                }
            });
        });
    };

    this.shouldDisableTrigger = function(statusCode) {
        return ((statusCode >= 400 && statusCode < 500) &&
            [HttpStatus.REQUEST_TIMEOUT, HttpStatus.TOO_MANY_REQUESTS].indexOf(statusCode) === -1);
    };

    this.disableExtinctTriggers = function(triggerIdentifier, dataTrigger) {
        var method = 'disableExtinctTriggers';

        if (dataTrigger.date) {
            utils.disableTrigger(triggerIdentifier, undefined, 'Automatically disabled after firing once');
            logger.info(method, 'the fire once date has expired, disabled', triggerIdentifier);
        }
        else if (dataTrigger.stopDate) {
            //check if the next scheduled trigger is after the stop date
            if (dataTrigger.cronHandle && dataTrigger.cronHandle.nextDate().isAfter(new Date(dataTrigger.stopDate))) {
                utils.disableTrigger(triggerIdentifier, undefined, 'Automatically disabled after firing last scheduled cron trigger');
                logger.info(method, 'last scheduled cron trigger before stop date, disabled', triggerIdentifier);
            }
            else if (dataTrigger.minutes && (Date.now() + (dataTrigger.minutes * 1000 * 60) > new Date(dataTrigger.stopDate).getTime())) {
                utils.disableTrigger(triggerIdentifier, undefined, 'Automatically disabled after firing last scheduled interval trigger');
                logger.info(method, 'last scheduled interval trigger before stop date, disabled', triggerIdentifier);
            }
        }
        else if (dataTrigger.maxTriggers && dataTrigger.triggersLeft === 0) {
            utils.disableTrigger(triggerIdentifier, undefined, 'Automatically disabled after reaching max triggers');
            logger.warn(method, 'no more triggers left, disabled', triggerIdentifier);
        }

    };

    this.disableTrigger = function(triggerIdentifier, statusCode, message) {
        var method = 'disableTrigger';

        triggerDB.get(triggerIdentifier, function (err, existing) {
            if (!err) {
                if (!existing.status || existing.status.active === true) {
                    var updatedTrigger = existing;
                    var status = {
                        'active': false,
                        'dateChanged': Date.now(),
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
                logger.info(method, 'could not find', triggerIdentifier, 'in database');
                //make sure it is removed from memory as well
                utils.deleteTrigger(triggerIdentifier);
            }
        });
    };

    this.deleteTrigger = function(triggerIdentifier) {
        var method = 'deleteTrigger';

        if (utils.triggers[triggerIdentifier]) {
            if (utils.triggers[triggerIdentifier].cronHandle) {
                utils.triggers[triggerIdentifier].cronHandle.stop();
            }
            else if (utils.triggers[triggerIdentifier].intervalHandle) {
                lt.clearInterval(utils.triggers[triggerIdentifier].intervalHandle);
            }
            delete utils.triggers[triggerIdentifier];
            logger.info(method, 'trigger', triggerIdentifier, 'successfully deleted from memory');
        }
    };

    this.getTriggerIdentifier = function(apikey, namespace, name) {
        return apikey + '/' + namespace + '/' + name;
    };

    this.initAllTriggers = function() {
        var method = 'initAllTriggers';

        //follow the trigger DB
        utils.setupFollow('now');

        logger.info(method, 'resetting system from last state');
        triggerDB.view(viewDDName, triggersByWorker, {reduce: false, include_docs: true, key: utils.worker}, function(err, body) {
            if (!err) {
                body.rows.forEach(function (trigger) {
                    var triggerIdentifier = trigger.id;
                    var doc = trigger.doc;

                    if (!(triggerIdentifier in utils.triggers)) {
                        //check if trigger still exists in whisk db
                        var namespace = doc.namespace;
                        var name = doc.name;
                        var apikey = doc.apikey;
                        var host = 'https://' + utils.routerHost + ':' + 443;
                        var triggerURL = host + '/api/v1/namespaces/' + namespace + '/triggers/' + name;
                        var auth = apikey.split(':');

                        logger.info(method, 'Checking if trigger', triggerIdentifier, 'still exists');
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
                                var message = 'Automatically disabled after receiving a ' + response.statusCode + ' status code on trigger initialization';
                                utils.disableTrigger(triggerIdentifier, response.statusCode, message);
                                logger.error(method, 'trigger', triggerIdentifier, 'has been disabled due to status code:', response.statusCode);
                            }
                            else {
                                utils.createTrigger(triggerIdentifier, doc)
                                .then(cachedTrigger => {
                                    utils.triggers[triggerIdentifier] = cachedTrigger;
                                    logger.info(method, triggerIdentifier, 'created successfully');
                                    if (cachedTrigger.intervalHandle && utils.activeHost === utils.host) {
                                        try {
                                            utils.fireTrigger(cachedTrigger);
                                        } catch (e) {
                                            logger.error(method, 'Exception occurred while firing trigger', triggerIdentifier, e);
                                        }
                                    }
                                })
                                .catch(err => {
                                    var message = 'Automatically disabled after receiving error on trigger initialization: ' + err;
                                    utils.disableTrigger(triggerIdentifier, undefined, message);
                                    logger.error(method, 'Disabled trigger', triggerIdentifier, err);
                                });
                            }
                        });
                    }
                });
            } else {
                logger.error(method, 'could not get latest state from database', err);
            }
        });
    };

    this.setupFollow = function(seq) {
        var method = 'setupFollow';

        try {
            var feed = triggerDB.follow({
                since: seq,
                include_docs: true,
                filter: filterDDName + '/' + triggersByWorker,
                query_params: {worker: utils.worker}
            });

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
                        .then(cachedTrigger => {
                            utils.triggers[triggerIdentifier] = cachedTrigger;
                            logger.info(method, triggerIdentifier, 'created successfully');
                            if (cachedTrigger.intervalHandle && utils.activeHost === utils.host) {
                                try {
                                    utils.fireTrigger(cachedTrigger);
                                } catch (e) {
                                    logger.error(method, 'Exception occurred while firing trigger', triggerIdentifier, e);
                                }
                            }
                        })
                        .catch(err => {
                            var message = 'Automatically disabled after receiving error on trigger creation: ' + err;
                            utils.disableTrigger(triggerIdentifier, undefined, message);
                            logger.error(method, 'Disabled trigger', triggerIdentifier, err);
                        });
                    }
                }
            });

            feed.on('error', function (err) {
                logger.error(method, err);
            });

            feed.follow();
        }
        catch (err) {
            logger.error(method, err);
        }
    };

    this.authorize = function(req, res, next) {
        var method = 'authorize';

        if (utils.endpointAuth) {

            if (!req.headers.authorization) {
                res.set('www-authenticate', 'Basic realm="Private"');
                res.status(HttpStatus.UNAUTHORIZED);
                return res.send('');
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

    this.sendError = function(method, code, message, res) {
        logger.error(method, message);
        res.status(code).json({error: message});
    };

    this.initRedis = function() {
        var method = 'initRedis';

        return new Promise(function(resolve, reject) {

            if (redisClient) {
                var subscriber = redisClient.duplicate();

                //create a subscriber client that listens for requests to perform swap
                subscriber.on('message', function (channel, message) {
                    if (message === 'host0' || message === 'host1') {
                        logger.info(method, message, 'set to active host in channel', channel);
                        utils.activeHost = message;
                    }
                });

                subscriber.on('error', function (err) {
                    logger.error(method, 'Error connecting to redis', err);
                    reject(err);
                });

                subscriber.subscribe(utils.redisHash);

                redisClient.hgetAsync(utils.redisHash, utils.redisKey)
                .then(activeHost => {
                    return utils.initActiveHost(activeHost);
                })
                .then(resolve)
                .catch(err => {
                    reject(err);
                });
            }
            else {
                resolve();
            }
        });
    };

    this.initActiveHost = function(activeHost) {
        var method = 'initActiveHost';

        if (activeHost === null) {
            //initialize redis key with active host
            logger.info(method, 'redis hset', utils.redisHash, utils.redisKey, utils.activeHost);
            return redisClient.hsetAsync(utils.redisHash, utils.redisKey, utils.activeHost);
        }
        else {
            utils.activeHost = activeHost;
            return Promise.resolve();
        }
    };

};
