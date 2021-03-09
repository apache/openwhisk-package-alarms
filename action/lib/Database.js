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

const common = require('./common');

// constructor for DB object - a thin, promise-loving wrapper around nano
module.exports = function(dbURL, dbName, dbUsername, dbPassword) {
    var nano = require('nano')(common.createUrl(dbURL, dbUsername, dbPassword));
    this.db = nano.db.use(dbName);
    var utilsDB = this;

    this.getWorkerID = function(availableWorkers) {

        return new Promise((resolve, reject) => {
            var workerID = availableWorkers[0] || 'worker0';

            if (availableWorkers.length > 1) {
                utilsDB.db.view('triggerViews', 'triggers_by_worker', {reduce: true, group: true}, function (err, body) {
                    if (!err) {
                        var triggersByWorker = {};

                        availableWorkers.forEach(worker => {
                            triggersByWorker[worker] = 0;
                        });

                        body.rows.forEach(row => {
                            if (row.key in triggersByWorker) {
                                triggersByWorker[row.key] = row.value;
                            }
                        });

                        // find which worker has the least number of assigned triggers
                        for (var worker in triggersByWorker) {
                            if (triggersByWorker[worker] < triggersByWorker[workerID]) {
                                workerID = worker;
                            }
                        }
                        resolve(workerID);
                    } else {
                        reject(err);
                    }
                });
            }
            else {
                resolve(workerID);
            }
        });
    };

    this.createTrigger = function(triggerID, newTrigger) {

        return new Promise(function(resolve, reject) {

            utilsDB.db.insert(newTrigger, triggerID, function (err) {
                if (!err) {
                    resolve();
                }
                else {
                    const errorMsg = 'error creating alarm trigger.';
                    if (err.statusCode === 409) {
                        //trigger already exists so update it
                        utilsDB.getTrigger(triggerID)
                        .then(trigger => utilsDB.disableTrigger(triggerID, trigger, 0, 'updating'))
                        .then(() => utilsDB.getTrigger(triggerID))
                        .then(trigger => utilsDB.updateTrigger(triggerID, newTrigger, {_rev: trigger._rev}, 0))
                        .then(() => resolve())
                        .catch(err => reject(common.sendError(err.statusCode, errorMsg, err.message)));
                    }
                    else {
                        reject(common.sendError(err.statusCode, errorMsg, err.message));
                    }
                }
            });
        });
    };

    this.getTrigger = function(triggerID, retry = true) {

        return new Promise(function(resolve, reject) {

            var qName = triggerID.split('/');
            var id = retry ? triggerID : qName[0] + '/_/' + qName[2];
            utilsDB.db.get(id, function (err, existing) {
                if (err) {
                    if (retry) {
                        utilsDB.getTrigger(triggerID, false)
                        .then(doc => {
                            resolve(doc);
                        })
                        .catch(err => {
                            reject(err);
                        });
                    } else {
                        var name = '/' + qName[1] + '/' + qName[2];
                        reject(common.sendError(err.statusCode, 'could not find trigger ' + name + ' in the database'));
                    }
                } else {
                    resolve(existing);
                }
            });
        });
    };

    this.disableTrigger = function(triggerID, trigger, retryCount, crudMessage) {

        if (retryCount === 0) {
            //check if it is already disabled
            if (trigger.status && trigger.status.active === false) {
                return Promise.resolve(triggerID);
            }

            var message = `Automatically disabled trigger while ${crudMessage}`;
            var status = {
                'active': false,
                'dateChanged': Date.now(),
                'reason': {'kind': 'AUTO', 'statusCode': undefined, 'message': message}
            };
            trigger.status = status;
        }

        return new Promise(function(resolve, reject) {

            utilsDB.db.insert(trigger, triggerID, function (err) {
                if (err) {
                    if (err.statusCode === 409 && retryCount < 5) {
                        setTimeout(function () {
                            utilsDB.disableTrigger(triggerID, trigger, (retryCount + 1))
                            .then(id => {
                                resolve(id);
                            })
                            .catch(err => {
                                reject(err);
                            });
                        }, 1000);
                    }
                    else {
                        reject(common.sendError(err.statusCode, 'there was an error while disabling the trigger in the database.', err.message));
                    }
                }
                else {
                    resolve(triggerID);
                }
            });
        });

    };

    this.deleteTrigger = function(triggerID, retryCount) {

        return new Promise(function(resolve, reject) {

            utilsDB.db.get(triggerID, function (err, existing) {
                if (!err) {
                    utilsDB.db.destroy(existing._id, existing._rev, function (err) {
                        if (err) {
                            if (err.statusCode === 409 && retryCount < 5) {
                                setTimeout(function () {
                                    utilsDB.deleteTrigger(triggerID, (retryCount + 1))
                                    .then(resolve)
                                    .catch(err => {
                                        reject(err);
                                    });
                                }, 1000);
                            }
                            else {
                                reject(common.sendError(err.statusCode, 'there was an error while deleting the trigger from the database.', err.message));
                            }
                        }
                        else {
                            resolve();
                        }
                    });
                }
                else {
                    var qName = triggerID.split('/');
                    var name = '/' + qName[1] + '/' + qName[2];
                    reject(common.sendError(err.statusCode, 'could not find trigger ' + name + ' in the database'));
                }
            });
        });
    };

    this.updateTrigger = function(triggerID, trigger, params, retryCount) {

        if (retryCount === 0) {
            for (var key in params) {
                trigger[key] = params[key];
            }
            var status = {
                'active': true,
                'dateChanged': Date.now()
            };
            trigger.status = status;
        }

        return new Promise(function(resolve, reject) {
            utilsDB.db.insert(trigger, triggerID, function (err) {
                if (err) {
                    if (err.statusCode === 409 && retryCount < 5) {
                        setTimeout(function () {
                            utilsDB.updateTrigger(triggerID, trigger, params, (retryCount + 1))
                            .then(id => {
                                resolve(id);
                            })
                            .catch(err => {
                                reject(err);
                            });
                        }, 1000);
                    }
                    else {
                        reject(common.sendError(err.statusCode, 'there was an error while updating the trigger in the database.', err.message));
                    }
                }
                else {
                    resolve(triggerID);
                }
            });
        });
    };

};
