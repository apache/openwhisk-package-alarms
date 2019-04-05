/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var request = require('request');
var HttpStatus = require('http-status-codes');
var lt =  require('long-timeout');
var constants = require('./constants.js');
var DateAlarm = require('./dateAlarm.js');
var CronAlarm = require('./cronAlarm.js');
var IntervalAlarm = require('./intervalAlarm.js');
var Sanitizer = require('./sanitizer');
var authHandler = require('./authHandler');

module.exports = function(logger, triggerDB, redisClient) {

    var retryDelay = constants.RETRY_DELAY;
    var retryAttempts = constants.RETRY_ATTEMPTS;
    var filterDDName = constants.FILTERS_DESIGN_DOC;
    var viewDDName = constants.VIEWS_DESIGN_DOC;
    var triggersByWorker = constants.TRIGGERS_BY_WORKER;
    var redisKeyPrefix = process.env.REDIS_KEY_PREFIX || triggerDB.config.db;
    var self = this;

    this.triggers = {};
    this.endpointAuth = process.env.ENDPOINT_AUTH;
    this.routerHost = process.env.ROUTER_HOST || 'localhost';
    this.worker = process.env.WORKER || 'worker0';
    this.host = process.env.HOST_INDEX || 'host0';
    this.hostPrefix = this.host.replace(/\d+$/, '');
    this.activeHost = `${this.hostPrefix}0`; //default value on init (will be updated for existing redis)
    this.db = triggerDB;
    this.redisClient = redisClient;
    this.redisKey = redisKeyPrefix + '_' + this.worker;
    this.redisField = constants.REDIS_FIELD;
    this.uriHost ='https://' + this.routerHost;
    this.sanitizer = new Sanitizer(logger, this);
    this.monitorStatus = {};

    function createTrigger(triggerIdentifier, newTrigger) {
        var method = 'createTrigger';

        var callback = function onTick() {
            var triggerHandle = self.triggers[triggerIdentifier];
            if (triggerHandle && shouldFireTrigger(triggerHandle) && hasTriggersRemaining(triggerHandle)) {
                try {
                    fireTrigger(triggerHandle);
                } catch (e) {
                    logger.error(method, 'Exception occurred while firing trigger', triggerIdentifier, e);
                }
            }
        };

        newTrigger.uri = self.uriHost + '/api/v1/namespaces/' + newTrigger.namespace + '/triggers/' + newTrigger.name;
        newTrigger.triggerID = triggerIdentifier;

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
    }

    function fireTrigger(triggerData) {
        var method = 'fireTrigger';

        var triggerIdentifier = triggerData.triggerID;

        logger.info(method, 'Alarm fired for', triggerIdentifier, 'attempting to fire trigger');
        postTrigger(triggerData, 0)
        .then(triggerId => {
            logger.info(method, 'Trigger', triggerId, 'was successfully fired');
            handleFiredTrigger(triggerData);
        })
        .catch(err => {
            logger.error(method, err);
            handleFiredTrigger(triggerData);
        });
    }

    function postTrigger(triggerData, retryCount, throttleCount) {
        var method = 'postTrigger';

        return new Promise(function(resolve, reject) {

            // only manage trigger fires if they are not infinite
            if (triggerData.maxTriggers && triggerData.maxTriggers !== -1) {
                triggerData.triggersLeft--;
            }

            self.authRequest(triggerData, {
                method: 'post',
                uri: triggerData.uri,
                json: triggerData.payload
            }, function(error, response) {
                try {
                    var statusCode = !error ? response.statusCode : error.statusCode;
                    var triggerIdentifier = triggerData.triggerID;
                    logger.info(method, triggerIdentifier, 'http post request, STATUS:', statusCode);

                    if (error || statusCode >= 400) {
                        logger.error(method, 'there was an error invoking', triggerIdentifier, statusCode || error);
                        var throttleCounter = throttleCount || 0;

                        // only manage trigger fires if they are not infinite
                        if (triggerData.maxTriggers && triggerData.maxTriggers !== -1) {
                            triggerData.triggersLeft++;
                        }

                        if (statusCode && shouldDisableTrigger(statusCode)) {
                            var message;
                            try {
                                message = error.error.errorMessage;
                            } catch (e) {
                                message = `Received a ${statusCode} status code when firing the trigger`;
                            }
                            disableTrigger(triggerIdentifier, statusCode, `Trigger automatically disabled: ${message}`);
                            reject(`Disabled trigger ${triggerIdentifier}: ${message}`);
                        }
                        else {
                            if (retryCount < retryAttempts) {
                                throttleCounter = statusCode === HttpStatus.TOO_MANY_REQUESTS ? throttleCounter + 1 : throttleCounter;
                                logger.info(method, 'attempting to fire trigger again', triggerIdentifier, 'Retry Count:', (retryCount + 1));
                                setTimeout(function () {
                                    postTrigger(triggerData, (retryCount + 1), throttleCounter)
                                    .then(triggerId => {
                                        resolve(triggerId);
                                    })
                                    .catch(err => {
                                        reject(err);
                                    });
                                }, Math.max(retryDelay, 1000 * Math.pow(throttleCounter, 2)));
                            } else {
                                if (throttleCounter === retryAttempts) {
                                    var msg = 'Automatically disabled after continuously receiving a 429 status code when firing the trigger';
                                    disableTrigger(triggerIdentifier, 429, msg);
                                    reject('Disabled trigger ' + triggerIdentifier + ' due to status code: 429');
                                }
                                else {
                                    reject('Unable to reach server to fire trigger ' + triggerIdentifier);
                                }
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
    }

    function shouldDisableTrigger(statusCode) {
        return ((statusCode >= 400 && statusCode < 500) &&
            [HttpStatus.REQUEST_TIMEOUT, HttpStatus.TOO_MANY_REQUESTS, HttpStatus.CONFLICT].indexOf(statusCode) === -1);
    }

    function shouldFireTrigger(trigger) {
        return trigger.monitor || self.activeHost === self.host;
    }

    function hasTriggersRemaining(trigger) {
        return !trigger.maxTriggers || trigger.maxTriggers === -1 || trigger.triggersLeft > 0;
    }

    function isMonitoringTrigger(monitor, triggerName) {
        return monitor && self.monitorStatus.triggerName === triggerName;
    }

    function handleFiredTrigger(triggerData) {
        var method = 'handleFiredTrigger';

        if (isMonitoringTrigger(triggerData.monitor, triggerData.name)) {
            self.monitorStatus.triggerFired = "success";
        }

        var triggerIdentifier = triggerData.triggerID;
        if (triggerData.date) {
            if (triggerData.deleteAfterFire && triggerData.deleteAfterFire !== 'false') {

                //delete trigger feed from database
                self.sanitizer.deleteTriggerFeed(triggerIdentifier);

                //check if trigger and all associated rules should be deleted
                if (triggerData.deleteAfterFire === 'rules') {
                    self.sanitizer.deleteTriggerAndRules(triggerData);
                }
                else {
                    self.sanitizer.deleteTrigger(triggerData, 0)
                    .then(info => {
                        logger.info(method, triggerIdentifier, info);
                    })
                    .catch(err => {
                        logger.error(method, triggerIdentifier, err);
                    });
                }
            }
            else {
                disableTrigger(triggerIdentifier, undefined, 'Automatically disabled after firing once');
                logger.info(method, 'the fire once date has expired, disabled', triggerIdentifier);
            }
        }
        else if (triggerData.stopDate) {
            //check if the next scheduled trigger is after the stop date
            if (triggerData.cronHandle && triggerData.cronHandle.nextDate().isAfter(new Date(triggerData.stopDate))) {
                disableTrigger(triggerIdentifier, undefined, 'Automatically disabled after firing last scheduled cron trigger');
                logger.info(method, 'last scheduled cron trigger before stop date, disabled', triggerIdentifier);
            }
            else if (triggerData.minutes && (Date.now() + (triggerData.minutes * 1000 * 60) > new Date(triggerData.stopDate).getTime())) {
                disableTrigger(triggerIdentifier, undefined, 'Automatically disabled after firing last scheduled interval trigger');
                logger.info(method, 'last scheduled interval trigger before stop date, disabled', triggerIdentifier);
            }
        }
        else if (triggerData.maxTriggers && triggerData.triggersLeft === 0) {
            disableTrigger(triggerIdentifier, undefined, 'Automatically disabled after reaching max triggers');
            logger.warn(method, 'no more triggers left, disabled', triggerIdentifier);
        }
    }

    function disableTrigger(triggerIdentifier, statusCode, message) {
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
                //make sure it is already stopped
                stopTrigger(triggerIdentifier);
            }
        });
    }

    function stopTrigger(triggerIdentifier) {
        var method = 'stopTrigger';

        if (self.triggers[triggerIdentifier]) {
            if (self.triggers[triggerIdentifier].cronHandle) {
                self.triggers[triggerIdentifier].cronHandle.stop();
            }
            else if (self.triggers[triggerIdentifier].intervalHandle) {
                lt.clearInterval(self.triggers[triggerIdentifier].intervalHandle);
            }
            delete self.triggers[triggerIdentifier];
            logger.info(method, 'trigger', triggerIdentifier, 'successfully deleted from memory');
        }
    }

    this.initAllTriggers = function() {
        var method = 'initAllTriggers';

        //follow the trigger DB
        setupFollow('now');

        logger.info(method, 'resetting system from last state');
        triggerDB.view(viewDDName, triggersByWorker, {reduce: false, include_docs: true, key: self.worker}, function(err, body) {
            if (!err) {
                body.rows.forEach(function (trigger) {
                    var triggerIdentifier = trigger.id;
                    var doc = trigger.doc;

                    if (!(triggerIdentifier in self.triggers) && !doc.monitor) {
                        //check if trigger still exists in whisk db
                        var namespace = doc.namespace;
                        var name = doc.name;
                        var uri = self.uriHost + '/api/v1/namespaces/' + namespace + '/triggers/' + name;

                        logger.info(method, 'Checking if trigger', triggerIdentifier, 'still exists');
                        self.authRequest(doc, {
                            method: 'get',
                            url: uri
                        }, function (error, response) {
                            //disable trigger in database if trigger is dead
                            if (!error && shouldDisableTrigger(response.statusCode)) {
                                var message = 'Automatically disabled after receiving a ' + response.statusCode + ' status code on trigger initialization';
                                disableTrigger(triggerIdentifier, response.statusCode, message);
                                logger.error(method, 'trigger', triggerIdentifier, 'has been disabled due to status code:', response.statusCode);
                            }
                            else {
                                createTrigger(triggerIdentifier, doc)
                                .then(cachedTrigger => {
                                    self.triggers[triggerIdentifier] = cachedTrigger;
                                    logger.info(method, triggerIdentifier, 'created successfully');
                                    if (cachedTrigger.intervalHandle && shouldFireTrigger(cachedTrigger)) {
                                        try {
                                            fireTrigger(cachedTrigger);
                                        } catch (e) {
                                            logger.error(method, 'Exception occurred while firing trigger', triggerIdentifier, e);
                                        }
                                    }
                                })
                                .catch(err => {
                                    var message = 'Automatically disabled after receiving error on trigger initialization: ' + err;
                                    disableTrigger(triggerIdentifier, undefined, message);
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

    function setupFollow(seq) {
        var method = 'setupFollow';

        try {
            var feed = triggerDB.follow({
                since: seq,
                include_docs: true,
                filter: filterDDName + '/' + triggersByWorker,
                query_params: {worker: self.worker}
            });

            feed.on('change', (change) => {
                var triggerIdentifier = change.id;
                var doc = change.doc;

                logger.info(method, 'got change for trigger', triggerIdentifier);

                if (self.triggers[triggerIdentifier]) {
                    if (doc.status && doc.status.active === false) {
                        stopTrigger(triggerIdentifier);
                        if (isMonitoringTrigger(doc.monitor, doc.name)) {
                            self.monitorStatus.triggerStopped = "success";
                        }
                    }
                }
                else {
                    //ignore changes to disabled triggers
                    if ((!doc.status || doc.status.active === true) && (!doc.monitor || doc.monitor === self.host)) {
                        createTrigger(triggerIdentifier, doc)
                        .then(cachedTrigger => {
                            self.triggers[triggerIdentifier] = cachedTrigger;
                            logger.info(method, triggerIdentifier, 'created successfully');

                            if (isMonitoringTrigger(cachedTrigger.monitor, cachedTrigger.name)) {
                                self.monitorStatus.triggerStarted = "success";
                            }

                            if (cachedTrigger.intervalHandle && shouldFireTrigger(cachedTrigger)) {
                                try {
                                    fireTrigger(cachedTrigger);
                                } catch (e) {
                                    logger.error(method, 'Exception occurred while firing trigger', triggerIdentifier, e);
                                }
                            }
                        })
                        .catch(err => {
                            var message = 'Automatically disabled after receiving error on trigger creation: ' + err;
                            disableTrigger(triggerIdentifier, undefined, message);
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
    }

    this.authorize = function(req, res, next) {
        var method = 'authorize';

        if (self.endpointAuth) {
            if (!req.headers.authorization) {
                res.set('www-authenticate', 'Basic realm="Private"');
                res.status(HttpStatus.UNAUTHORIZED);
                return res.send('');
            }

            var parts = req.headers.authorization.split(' ');
            if (parts[0].toLowerCase() !== 'basic' || !parts[1]) {
                return sendError(method, HttpStatus.BAD_REQUEST, 'Malformed request, basic authentication expected', res);
            }

            var auth = new Buffer(parts[1], 'base64').toString();
            auth = auth.match(/^([^:]*):(.*)$/);
            if (!auth) {
                return sendError(method, HttpStatus.BAD_REQUEST, 'Malformed request, authentication invalid', res);
            }

            var uuid = auth[1];
            var key = auth[2];
            var endpointAuth = self.endpointAuth.split(':');
            if (endpointAuth[0] === uuid && endpointAuth[1] === key) {
                next();
            }
            else {
                logger.warn(method, 'Invalid key');
                return sendError(method, HttpStatus.UNAUTHORIZED, 'Invalid key', res);
            }
        }
        else {
            next();
        }
    };

    function sendError(method, code, message, res) {
        logger.error(method, message);
        res.status(code).json({error: message});
    }

    this.initRedis = function() {
        var method = 'initRedis';

        return new Promise(function(resolve, reject) {

            if (redisClient) {
                var subscriber = redisClient.duplicate();

                //create a subscriber client that listens for requests to perform swap
                subscriber.on('message', function (channel, message) {
                    logger.info(method, message, 'set to active host in channel', channel);
                    self.activeHost = message;
                });

                subscriber.on('error', function (err) {
                    logger.error(method, 'Error connecting to redis', err);
                    reject(err);
                });

                subscriber.subscribe(self.redisKey);

                redisClient.hgetAsync(self.redisKey, self.redisField)
                .then(activeHost => {
                    return initActiveHost(activeHost);
                })
                .then(() => {
                    process.on('SIGTERM', function onSigterm() {
                        if (self.activeHost === self.host) {
                            var redundantHost = self.host === `${self.hostPrefix}0` ? `${self.hostPrefix}1` : `${self.hostPrefix}0`;
                            self.redisClient.hsetAsync(self.redisKey, self.redisField, redundantHost)
                            .then(() => {
                                self.redisClient.publish(self.redisKey, redundantHost);
                            })
                            .catch(err => {
                                logger.error(method, err);
                            });
                        }
                    });
                    resolve();
                })
                .catch(err => {
                    reject(err);
                });
            }
            else {
                resolve();
            }
        });
    };

    function initActiveHost(activeHost) {
        var method = 'initActiveHost';

        if (activeHost === null) {
            //initialize redis key with active host
            logger.info(method, 'redis hset', self.redisKey, self.redisField, self.activeHost);
            return redisClient.hsetAsync(self.redisKey, self.redisField, self.activeHost);
        }
        else {
            self.activeHost = activeHost;
            return Promise.resolve();
        }
    }

    this.authRequest = function(triggerData, options, cb) {
        var method = 'authRequest';

        authHandler.handleAuth(triggerData, options)
        .then(requestOptions => {
            request(requestOptions, cb);
        })
        .catch(err => {
            logger.error(method, err);
            cb(err);
        });
    };

};
