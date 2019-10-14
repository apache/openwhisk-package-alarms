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

                var cronHandle = new CronJob(newTrigger.cron, callback, undefined, false, newTrigger.timezone);

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

};
