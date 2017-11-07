const common = require('./common');

// constructor for DB object - a thin, promise-loving wrapper around nano
module.exports = function(dbURL, dbName) {
    var nano = require('nano')(dbURL);
    this.db = nano.db.use(dbName);
    var utilsDB = this;

    this.getWorkerID = function(availabeWorkers) {

        return new Promise((resolve, reject) => {
            var workerID = availabeWorkers[0] || 'worker0';

            if (availabeWorkers.length > 1) {
                utilsDB.db.view('triggerViews', 'triggers_by_worker', {reduce: true, group: true}, function (err, body) {
                    if (!err) {
                        var triggersByWorker = {};

                        availabeWorkers.forEach(worker => {
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
                    reject(common.sendError(err.statusCode, 'error creating alarm trigger.', err.message));
                }
            });
        });
    };

    this.getTrigger = function(triggerID, retry = true) {

        return new Promise(function(resolve, reject) {

            utilsDB.db.get(triggerID, function (err, existing) {
                if (err) {
                    if (retry) {
                        var parts = triggerID.split('/');
                        var id = parts[0] + '/_/' + parts[2];
                        utilsDB.getTrigger(id, false)
                        .then(doc => {
                            resolve(doc);
                        })
                        .catch(err => {
                            reject(err);
                        });
                    } else {
                        reject(common.sendError(err.statusCode, 'could not find the trigger in the database'));
                    }
                } else {
                    resolve(existing);
                }
            });
        });
    };

    this.updateTrigger = function(triggerID, retryCount) {

        return new Promise(function(resolve, reject) {

            utilsDB.db.get(triggerID, function (err, existing) {
                if (!err) {
                    var updatedTrigger = existing;
                    updatedTrigger.status = {'active': false};

                    utilsDB.db.insert(updatedTrigger, triggerID, function (err) {
                        if (err) {
                            if (err.statusCode === 409 && retryCount < 5) {
                                setTimeout(function () {
                                    utilsDB.updateTrigger(triggerID, (retryCount + 1))
                                    .then(id => {
                                        resolve(id);
                                    })
                                    .catch(err => {
                                        reject(err);
                                    });
                                }, 1000);
                            }
                            else {
                                reject(common.sendError(err.statusCode, 'there was an error while marking the trigger for delete in the database.', err.message));
                            }
                        }
                        else {
                            resolve(triggerID);
                        }
                    });
                }
                else {
                    //legacy alarms triggers may have been created with _ namespace
                    if (retryCount === 0) {
                        var parts = triggerID.split('/');
                        var id = parts[0] + '/_/' + parts[2];
                        utilsDB.updateTrigger(id, (retryCount + 1))
                        .then(id => {
                            resolve(id);
                        })
                        .catch(err => {
                            reject(err);
                        });
                    }
                    else {
                        reject(common.sendError(err.statusCode, 'could not find the trigger in the database'));
                    }
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
                    reject(common.sendError(err.statusCode, 'could not find the trigger in the database'));
                }
            });
        });
    };
};
