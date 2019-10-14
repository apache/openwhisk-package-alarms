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

module.exports = function(logger, newTrigger) {

    var cachedTrigger = {
        apikey: newTrigger.apikey,
        name: newTrigger.name,
        namespace: newTrigger.namespace,
        payload: newTrigger.payload,
        date: newTrigger.date,
        deleteAfterFire: newTrigger.deleteAfterFire,
        triggerID: newTrigger.triggerID,
        uri: newTrigger.uri,
        monitor: newTrigger.monitor,
        additionalData: newTrigger.additionalData
    };

    this.scheduleAlarm = function(triggerIdentifier, callback) {
        var method = 'scheduleDateAlarm';

        try {
            return new Promise(function(resolve, reject) {

                var cron = new Date(newTrigger.date);
                if (cron.getTime() > Date.now()) {
                    logger.info(method, 'Creating a fire once alarms trigger', triggerIdentifier);
                    var cronHandle = new CronJob(cron, callback);
                    logger.info(method, triggerIdentifier, 'starting cron job');
                    cronHandle.start();

                    cachedTrigger.cronHandle = cronHandle;
                    resolve(cachedTrigger);
                }
                else {
                    return reject('the fire once date has expired');
                }
            });
        } catch (err) {
            return Promise.reject(err);
        }
    };

};
