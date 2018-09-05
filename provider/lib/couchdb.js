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
 
var constants = require('./constants.js');

var filterDDName = '_design/' + constants.FILTERS_DESIGN_DOC;
var viewDDName = '_design/' + constants.VIEWS_DESIGN_DOC;

module.exports = function(dbURL) {
    var nano = require('nano')(dbURL);
    var utilsDB = this;
    this.nano = nano;

    this.createDatabase = function(logger, databaseName) {
    var method = 'createDatabase';
    logger.info(method, 'creating the trigger database');


    if (utilsDB.nano !== null) {
        return new Promise(function (resolve, reject) {
            utilsDB.nano.db.create(databaseName, function (err, body) {
                if (!err) {
                    logger.info(method, 'created trigger database:', databaseName);
                }
                else if (err.statusCode !== 412) {
                    logger.info(method, 'failed to create trigger database:', databaseName, err);
                }

                var viewDD = {
                    views: {
                        triggers_by_worker: {
                            map: function (doc) {
                                if (doc.maxTriggers && (!doc.status || doc.status.active === true)) {
                                    emit(doc.worker || 'worker0', 1);
                                }
                            }.toString(),
                            reduce: '_count'
                        }
                    }
                };

                createDesignDoc(utilsDB.nano.db.use(databaseName), viewDDName, viewDD)
                .then((db) => {
                    var filterDD = {
                        filters: {
                            triggers_by_worker:
                                function (doc, req) {
                                    return doc.maxTriggers && ((!doc.worker && req.query.worker === 'worker0') ||
                                            (doc.worker === req.query.worker));
                                }.toString()
                        }
                    };
                    return createDesignDoc(db, filterDDName, filterDD);
                })
                .then((db) => {
                    utilsDB.db = db;
                    resolve(utilsDB);
                })
                .catch(err => {
                    reject(err);
                });

            });
        });
    }
    else {
        Promise.reject('nano provider did not get created.  check db URL: ' + dbHost);
    }
    };

    function createDesignDoc(db, ddName, designDoc) {
        var method = 'createDesignDoc';

        return new Promise(function(resolve, reject) {

            db.get(ddName, function (error, body) {
                if (error) {
                    //new design doc
                    db.insert(designDoc, ddName, function (error, body) {
                        if (error && error.statusCode !== 409) {
                            logger.error(method, error);
                            reject('design doc could not be created: ' + error);
                        }
                        else {
                            resolve(db);
                        }
                    });
                }
                else {
                    resolve(db);
                }
            });
        });
    };

    this.createTrigger = function(triggerID, newTrigger) {
    return new Promise(function(resolve, reject) {

        utilsDB.db.insert(newTrigger, triggerID, function (err) {
            if (!err) {
                resolve();
            }
            else {
                reject(common.sendError(err.statusCode, 'error creating alarm trigger.', err.message));
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
