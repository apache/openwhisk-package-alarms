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

const CronJob = require('cron').CronJob;
const moment = require('moment');
const common = require('./lib/common');
const Database = require('./lib/Database');
const config = require('./lib/config');

function main(params) {

    if (!params.triggerName) {
        return common.sendError(400, 'no trigger name parameter was provided');
    }

    var triggerParts = common.parseQName(params.triggerName);
    var triggerData = {
        apikey: params.authKey,
        name: triggerParts.name,
        namespace: triggerParts.namespace,
        additionalData: common.constructObject(params.additionalData),
    };
    var triggerID = config.constructTriggerID(triggerData);

    var workers = params.workers instanceof Array ? params.workers : [];
    var deleteAfterFireArray = ['false', 'true', 'rules'];
    var db;

    if (params.__ow_method === "post") {

        if (typeof params.trigger_payload === 'string') {
            params.trigger_payload = {payload: params.trigger_payload};
        }

        var newTrigger = {
            payload: params.trigger_payload || {},
            maxTriggers: params.maxTriggers || -1,
            status: {
                'active': true,
                'dateChanged': Date.now()
            }
        };

        if (params.fireOnce) {
            if (!params.date) {
                return common.sendError(400, 'alarms once trigger feed is missing the date parameter');
            }
            var date = validateDate(params.date, 'date');
            if (date !== params.date) {
                return common.sendError(400, date);
            }
            newTrigger.date = date;

            if (params.deleteAfterFire) {
                var deleteAfterFire = ('' + params.deleteAfterFire).trim().toLowerCase();
                if (deleteAfterFireArray.indexOf(deleteAfterFire) === -1) {
                    return common.sendError(400, 'deleteAfterFire parameter must be one of [false, true, rules].');
                }
                newTrigger.deleteAfterFire = deleteAfterFire;
            }
        }
        else {
            var cronHandle;

            if (params.isInterval) {
                if (!params.minutes) {
                    return common.sendError(400, 'interval trigger feed is missing the minutes parameter');
                }
                if (+params.minutes !== parseInt(params.minutes)) {
                    return common.sendError(400, 'the minutes parameter must be an integer');
                }
                var minutesParam = parseInt(params.minutes);

                if (minutesParam <= 0) {
                    return common.sendError(400, 'the minutes parameter must be an integer greater than zero');
                }
                newTrigger.minutes = minutesParam;
            }
            else {
                if (!params.cron) {
                    return common.sendError(400, 'alarms trigger feed is missing the cron parameter');
                }

                try {
                    cronHandle = new CronJob(params.cron, function() {}, undefined, false, params.timezone);
                    //validate cron granularity if 5 fields are allowed instead of 6
                    if (params.limitCronFields && hasSecondsGranularity(params.cron)) {
                        return common.sendError(400, 'cron pattern is limited to 5 fields with 1 minute as the finest granularity');
                    }
                    newTrigger.cron = params.cron;
                    newTrigger.timezone = params.timezone;
                } catch(ex) {
                    var message = ex.message !== 'Invalid timezone.' ? `cron pattern '${params.cron}' is not valid` : ex.message;
                    return common.sendError(400, message);
                }
            }

            if (params.startDate) {
                var startDate = validateDate(params.startDate, 'startDate');
                if (startDate !== params.startDate) {
                    return common.sendError(400, startDate);
                }
                newTrigger.startDate = startDate;
            }
            else if (params.isInterval) {
                //if startDate was not given we will start it 30 seconds
                //from now since startDate must be in the future
                newTrigger.startDate = Date.now() + (1000 * 30);
            }

            if (params.maxTriggers && params.stopDate) {
                if (params.isInterval) {
                    return common.sendError(400, 'maxTriggers is not supported for the interval trigger feed');
                }
                else {
                    return common.sendError(400, 'maxTriggers is not allowed when the stopDate parameter is specified');
                }
            }
            else if (params.stopDate) {
                var stopDate = validateDate(params.stopDate, 'stopDate', newTrigger.startDate);
                if (stopDate !== params.stopDate) {
                    return common.sendError(400, stopDate);
                }
                newTrigger.stopDate = stopDate;

                //verify that the first scheduled trigger fire will occur before the stop date
                if (cronHandle && cronHandle.nextDate().isAfter(new Date(params.stopDate))) {
                    return common.sendError(400, 'the first scheduled trigger fire is not until after the stop date');
                }
            }
        }

        return new Promise(function (resolve, reject) {
            common.verifyTriggerAuth(triggerData, false)
            .then(() => {
                db = new Database(params.DB_URL, params.DB_NAME);
                return db.getWorkerID(workers);
            })
            .then((worker) => {
                console.log('trigger will be assigned to worker ' + worker);
                newTrigger.worker = worker;
                Object.assign(newTrigger, triggerData);
                return db.createTrigger(triggerID, newTrigger);
            })
            .then(() => {
                resolve({
                    statusCode: 200,
                    headers: {'Content-Type': 'application/json'},
                    body: {'status': 'success'}
                });
            })
            .catch(err => {
                reject(err);
            });
        });

    }
    else if (params.__ow_method === "get") {
        return new Promise(function (resolve, reject) {
            common.verifyTriggerAuth(triggerData, false)
            .then(() => {
                db = new Database(params.DB_URL, params.DB_NAME);
                return db.getTrigger(triggerID);
            })
            .then(doc => {
                var body = {
                    config: {
                        name: doc.name,
                        namespace: doc.namespace,
                        payload: doc.payload
                    },
                    status: {
                        active: doc.status.active,
                        dateChanged: moment(doc.status.dateChanged).utc().valueOf(),
                        dateChangedISO: moment(doc.status.dateChanged).utc().format(),
                        reason: doc.status.reason
                    }
                };
                if (doc.date) {
                    body.config.date = doc.date;
                    body.config.deleteAfterFire = doc.deleteAfterFire;
                }
                else {
                    body.config.startDate = doc.startDate;
                    body.config.stopDate = doc.stopDate;
                    if (doc.minutes) {
                        body.config.minutes = doc.minutes;
                    }
                    else {
                        body.config.cron = doc.cron;
                        body.config.timezone = doc.timezone;
                    }
                }
                resolve({
                    statusCode: 200,
                    headers: {'Content-Type': 'application/json'},
                    body: body
                });
            })
            .catch(err => {
                reject(err);
            });
        });
    }
    else if (params.__ow_method === "put") {

        return new Promise(function (resolve, reject) {
            var updatedParams = {};

            common.verifyTriggerAuth(triggerData, false)
            .then(() => {
                db = new Database(params.DB_URL, params.DB_NAME);
                return db.getTrigger(triggerID);
            })
            .then(trigger => {
                if (trigger.status && trigger.status.reason && trigger.status.reason.kind === 'ADMIN') {
                    return reject(common.sendError(400, `${params.triggerName} cannot be updated because it was disabled by an admin.  Please contact support for further assistance`));
                }

                if (params.trigger_payload) {
                    updatedParams.payload = common.constructObject(params.trigger_payload, true);
                }

                if (trigger.date) {
                    if (params.date) {
                        var date = validateDate(params.date, 'date');
                        if (date !== params.date) {
                            return reject(common.sendError(400, date));
                        }
                        updatedParams.date = date;
                    }

                    if (params.deleteAfterFire) {
                        var deleteAfterFire = ('' + params.deleteAfterFire).trim().toLowerCase();
                        if (deleteAfterFireArray.indexOf(deleteAfterFire) === -1) {
                            return reject(common.sendError(400, 'deleteAfterFire parameter must be one of [false, true, rules].'));
                        }
                        updatedParams.deleteAfterFire = deleteAfterFire;
                    }
                }
                else {
                    if (trigger.minutes) {
                        if (params.minutes) {
                            if (+params.minutes !== parseInt(params.minutes)) {
                                return reject(common.sendError(400, 'the minutes parameter must be an integer'));
                            }
                            var minutesParam = parseInt(params.minutes);

                            if (minutesParam <= 0) {
                                return reject(common.sendError(400, 'the minutes parameter must be an integer greater than zero'));
                            }
                            updatedParams.minutes = minutesParam;
                        }
                    }
                    else {
                        if (params.cron || params.timezone) {
                            var cron = params.cron || trigger.cron;
                            var timezone = params.timezone || trigger.timezone;
                            try {
                                cronHandle = new CronJob(cron, function() {}, undefined, false, timezone);
                                //validate cron granularity if 5 fields are allowed instead of 6
                                if (params.cron && params.limitCronFields && hasSecondsGranularity(params.cron)) {
                                    return reject(common.sendError(400, 'cron pattern is limited to 5 fields with 1 minute as the finest granularity'));
                                }
                            } catch (ex) {
                                var message = ex.message !== 'Invalid timezone.' ? `cron pattern '${cron}' is not valid` : ex.message;
                                return reject(common.sendError(400, message));
                            }
                            if (params.cron) {
                                updatedParams.cron = params.cron;
                            }
                            if (params.timezone) {
                                updatedParams.timezone = params.timezone;
                            }
                        }
                    }

                    if (params.startDate) {
                        var startDate = validateDate(params.startDate, 'startDate');
                        if (startDate !== params.startDate) {
                            return reject(common.sendError(400, startDate));
                        }
                        updatedParams.startDate = startDate;
                    }

                    if (params.stopDate) {
                        var stopDate = validateDate(params.stopDate, 'stopDate', params.startDate || trigger.startDate);
                        if (stopDate !== params.stopDate) {
                            return reject(common.sendError(400, stopDate));
                        }
                        updatedParams.stopDate = stopDate;
                    }
                    else if (params.startDate && trigger.stopDate) {
                        //need to verify that new start date is before existing stop date
                        if (new Date(params.startDate).getTime() >= new Date(trigger.stopDate).getTime()) {
                            return reject(common.sendError(400, `startDate parameter '${params.startDate}' must be less than the stopDate parameter '${trigger.stopDate}'`));
                        }

                    }
                }

                if (Object.keys(updatedParams).length === 0) {
                    return reject(common.sendError(400, 'no updatable parameters were specified'));
                }
                return db.disableTrigger(trigger._id, trigger, 0, 'updating');
            })
            .then(triggerID => {
                return db.getTrigger(triggerID);
            })
            .then(trigger => {
                return db.updateTrigger(trigger._id, trigger, updatedParams, 0);
            })
            .then(() => {
                resolve({
                    statusCode: 200,
                    headers: {'Content-Type': 'application/json'},
                    body: {'status': 'success'}
                });
            })
            .catch(err => {
                reject(err);
            });
        });
    }
    else if (params.__ow_method === "delete") {

        return new Promise(function (resolve, reject) {
            common.verifyTriggerAuth(triggerData, true)
            .then(() => {
                db = new Database(params.DB_URL, params.DB_NAME);
                return db.getTrigger(triggerID);
            })
            .then(trigger => {
                return db.disableTrigger(trigger._id, trigger, 0, 'deleting');
            })
            .then(triggerID => {
                return db.deleteTrigger(triggerID, 0);
            })
            .then(() => {
                resolve({
                    statusCode: 200,
                    headers: {'Content-Type': 'application/json'},
                    body: {'status': 'success'}
                });
            })
            .catch(err => {
                reject(err);
            });
        });
    }
    else {
        return common.sendError(400, 'unsupported lifecycleEvent');
    }
}

function validateDate(date, paramName, startDate) {

    var dateObject = new Date(date);

    if (isNaN(dateObject.getTime())) {
        return `${paramName} parameter '${date}' is not a valid Date`;
    }
    else if (Date.now() >= dateObject.getTime()) {
        return `${paramName} parameter '${date}' must be in the future`;
    }
    else if (startDate && dateObject <= new Date(startDate).getTime()) {
        return `${paramName} parameter '${date}' must be greater than the startDate parameter '${startDate}'`;
    }
    else {
        return date;
    }

}

function hasSecondsGranularity(cron) {

    var fields = (cron + '').trim().split(/\s+/);
    return fields.length > 5 && fields[fields.length - 6] !== '0';
}

exports.main = main;
