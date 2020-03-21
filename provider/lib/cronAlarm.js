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

var CronJob = require('cron').CronJob;
var lt =  require('long-timeout');
var constants = require('./constants.js');

module.exports = function(logger, newTrigger) {

    var maxTriggers = newTrigger.maxTriggers || constants.DEFAULT_MAX_TRIGGERS;
    var delayLimit = validateLimit(parseInt(process.env.ALARM_DELAY_LIMIT)) || 0;
    var delayDefaultStrict = process.env.ALARM_DELAY_DEFAULT_STRICT === "true";

    var cachedTrigger = {
        apikey: newTrigger.apikey,
        name: newTrigger.name,
        namespace: newTrigger.namespace,
        payload: newTrigger.payload,
        cron: newTrigger.cron,
        timezone: newTrigger.timezone,
        triggerID: newTrigger.triggerID,
        uri: newTrigger.uri,
        monitor: newTrigger.monitor,
        additionalData: newTrigger.additionalData
    };

    this.scheduleAlarm = function(triggerIdentifier, callback) {
        var method = 'scheduleCronAlarm';

        try {
            return new Promise(function(resolve, reject) {

                var cronHandle = new CronJob(distributeCron(newTrigger), callback, undefined, false, newTrigger.timezone);

                if (newTrigger.stopDate) {
                    cachedTrigger.stopDate = newTrigger.stopDate;
                    //do not create trigger if the stopDate is in the past
                    //or if it will never fire before the stopDate occurs
                    if (new Date(newTrigger.stopDate).getTime() <= Date.now()) {
                        return reject('the stop date has expired');
                    }
                    else if (cronHandle.nextDate().isAfter(new Date(newTrigger.stopDate))) {
                        return reject('the next scheduled trigger fire is after the stop date');
                    }
                }
                else {
                    cachedTrigger.triggersLeft = maxTriggers;
                    cachedTrigger.maxTriggers = maxTriggers;
                }

                if (newTrigger.startDate && new Date(newTrigger.startDate).getTime() > Date.now()) {
                    var startDate = new Date(newTrigger.startDate).getTime();
                    logger.info(method, triggerIdentifier, 'waiting for start date', startDate);
                    lt.setTimeout(function() {
                        logger.info(method, triggerIdentifier, 'starting cron job upon reaching start date', startDate);
                        cronHandle.start();

                        cachedTrigger.cronHandle = cronHandle;
                        resolve(cachedTrigger);
                    }, startDate - Date.now());
                }
                else {
                    logger.info(method, triggerIdentifier, 'starting cron job');
                    cronHandle.start();

                    cachedTrigger.cronHandle = cronHandle;
                    resolve(cachedTrigger);
                }

            });
        } catch (err) {
            return Promise.reject(err);
        }
    };

    // Convert string to integer in [0, delayLimit)
    function hashName(name) {
        var hash = 0;

        for (var i = 0; i < name.length; i++) {
            var char = name.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
        }
        hash %= delayLimit + 1;
        hash = Math.abs(hash);

        return hash.toString(10);
    }

    function distributeCron(trigger) {
        var method = "distributeCronAlarm";

        var cronFields = (trigger.cron + '').trim().split(/\s+/);
        if (!isStrict(trigger.strict) && cronFields.length === 5 && delayLimit !== 0) {
            var newCron = [hashName(trigger.name), ...cronFields].join(' ');
            logger.info(method, trigger.triggerID, 'is converted to', '"' + newCron + '"');
            return newCron;
        }

        return trigger.cron;
    }

    function validateLimit(limit) {
        if (isNaN(limit)) {
            return 0;
        }
        if (limit < 0 || limit >= 60) {
            return 0;
        }
        return limit;
    }

    function isStrict(strict) {
        /**
         * If the strict variable is not passed from alarmWebAction(User doesn't define strict value),
         * then the ALARM_DELAY_DEFAULT_STRICT environment variable value is used.
         */
        if(strict === undefined || strict === null) {
            return delayDefaultStrict;
        }

        /**
         * "true"(string)   -> true
         * "false"(string)  -> false
         * "True"(string)   -> true
         * "False"(string)  -> false
         * true(boolean)    -> true
         * false(boolean)   -> false
         */
        return String(strict).toLowerCase() === "true";
    }

};
