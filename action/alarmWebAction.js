var request = require('request');
var CronJob = require('cron').CronJob;

function main(params) {

    if (!params.authKey) {
        return sendError(400, 'no authKey parameter was provided');
    }
    if (!params.triggerName) {
        return sendError(400, 'no trigger name parameter was provided');
    }

    var triggerParts = parseQName(params.triggerName);
    var triggerID = `${params.authKey}/${triggerParts.namespace}/${triggerParts.name}`;

    var triggerURL = `https://${params.apihost}/api/v1/namespaces/${triggerParts.namespace}/triggers/${triggerParts.name}`;

    var nano = require('nano')(params.DB_URL);
    var db = nano.db.use(params.DB_NAME);
    var workers = params.workers instanceof Array ? params.workers : [];

    if (params.__ow_method === "put") {

        if (!params.cron) {
            return sendError(400, 'alarms trigger feed is missing the cron parameter');
        }
        else {
            try {
                new CronJob(params.cron, function() {});
            } catch(ex) {
                return sendError(400, `cron pattern '${params.cron}' is not valid`);
            }
        }

        if (typeof params.trigger_payload === 'string') {
            params.trigger_payload = {payload: params.trigger_payload};
        }

        var newTrigger = {
            apikey: params.authKey,
            name: triggerParts.name,
            namespace: triggerParts.namespace,
            cron: params.cron,
            payload: params.trigger_payload || {},
            maxTriggers: params.maxTriggers || -1,
            status: {
                'active': true,
                'dateChanged': Date.now()
            }
        };

        return new Promise(function (resolve, reject) {
            verifyTriggerAuth(triggerURL, params.authKey, false)
            .then(() => {
                return getWorkerID(db, workers);
            })
            .then((worker) => {
                console.log('trigger will be assigned to worker ' + worker);
                newTrigger.worker = worker;
                return createTrigger(db, triggerID, newTrigger);
            })
            .then(() => {
                resolve({
                    statusCode: 200,
                    headers: {'Content-Type': 'application/json'},
                    body: new Buffer(JSON.stringify({'status': 'success'})).toString('base64')
                });
            })
            .catch(err => {
                reject(err);
            });
        });

    }
    else if (params.__ow_method === "get") {
        return new Promise(function (resolve, reject) {
            verifyTriggerAuth(triggerURL, params.authKey, false)
            .then(() => {
                return getTrigger(db, triggerID);
            })
            .then(doc => {
                var body = {
                    config: {
                        name: doc.name,
                        namespace: doc.namespace,
                        cron: doc.cron,
                        payload: doc.payload,
                        maxTriggers: doc.maxTriggers
                    },
                    status: doc.status
                };
                resolve({
                    statusCode: 200,
                    headers: {'Content-Type': 'application/json'},
                    body: new Buffer(JSON.stringify(body)).toString('base64')
                });
            })
            .catch(err => {
                reject(err);
            });
        });
    }
    else if (params.__ow_method === "delete") {

        return new Promise(function (resolve, reject) {
            verifyTriggerAuth(triggerURL, params.authKey, true)
            .then(() => {
                return updateTrigger(db, triggerID, 0);
            })
            .then(id => {
                return deleteTrigger(db, id, 0);
            })
            .then(() => {
                resolve({
                    statusCode: 200,
                    headers: {'Content-Type': 'application/json'},
                    body: new Buffer(JSON.stringify({'status': 'success'})).toString('base64')
                });
            })
            .catch(err => {
                reject(err);
            });
        });
    }
    else {
        return sendError(400, 'unsupported lifecycleEvent');
    }
}

function getWorkerID(db, availabeWorkers) {

    return new Promise((resolve, reject) => {
        var workerID = availabeWorkers[0] || 'worker0';

        if (availabeWorkers.length > 1) {
            db.view('triggerViews', 'triggers_by_worker', {reduce: true, group: true}, function (err, body) {
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
}

function createTrigger(triggerDB, triggerID, newTrigger) {

    return new Promise(function(resolve, reject) {

        triggerDB.insert(newTrigger, triggerID, function (err) {
            if (!err) {
                resolve();
            }
            else {
                reject(sendError(err.statusCode, 'error creating alarm trigger.', err.message));
            }
        });
    });
}

function getTrigger(triggerDB, triggerID, retry = true) {

    return new Promise(function(resolve, reject) {

        triggerDB.get(triggerID, function (err, existing) {
            if (err) {
                if (retry) {
                    var parts = triggerID.split('/');
                    var id = parts[0] + '/_/' + parts[2];
                    getTrigger(triggerDB, id, false)
                    .then(doc => {
                        resolve(doc);
                    })
                    .catch(err => {
                        reject(err);
                    });
                } else {
                    reject(sendError(err.statusCode, 'could not find the trigger in the database'));
                }
            } else {
                resolve(existing);
            }
        });
    });
}

function updateTrigger(triggerDB, triggerID, retryCount) {

    return new Promise(function(resolve, reject) {

        triggerDB.get(triggerID, function (err, existing) {
            if (!err) {
                var updatedTrigger = existing;
                updatedTrigger.status = {'active': false};

                triggerDB.insert(updatedTrigger, triggerID, function (err) {
                    if (err) {
                        if (err.statusCode === 409 && retryCount < 5) {
                            setTimeout(function () {
                                updateTrigger(triggerDB, triggerID, (retryCount + 1))
                                .then(id => {
                                    resolve(id);
                                })
                                .catch(err => {
                                    reject(err);
                                });
                            }, 1000);
                        }
                        else {
                            reject(sendError(err.statusCode, 'there was an error while marking the trigger for delete in the database.', err.message));
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
                    updateTrigger(triggerDB, id, (retryCount + 1))
                    .then(id => {
                        resolve(id);
                    })
                    .catch(err => {
                        reject(err);
                    });
                }
                else {
                    reject(sendError(err.statusCode, 'could not find the trigger in the database'));
                }
            }
        });
    });
}

function deleteTrigger(triggerDB, triggerID, retryCount) {

    return new Promise(function(resolve, reject) {

        triggerDB.get(triggerID, function (err, existing) {
            if (!err) {
                triggerDB.destroy(existing._id, existing._rev, function (err) {
                    if (err) {
                        if (err.statusCode === 409 && retryCount < 5) {
                            setTimeout(function () {
                                deleteTrigger(triggerDB, triggerID, (retryCount + 1))
                                .then(resolve)
                                .catch(err => {
                                    reject(err);
                                });
                            }, 1000);
                        }
                        else {
                            reject(sendError(err.statusCode, 'there was an error while deleting the trigger from the database.', err.message));
                        }
                    }
                    else {
                        resolve();
                    }
                });
            }
            else {
                reject(sendError(err.statusCode, 'could not find the trigger in the database'));
            }
        });
    });
}

function verifyTriggerAuth(triggerURL, authKey, isDelete) {
    var auth = authKey.split(':');

    return new Promise(function(resolve, reject) {

        request({
            method: 'get',
            url: triggerURL,
            auth: {
                user: auth[0],
                pass: auth[1]
            },
            rejectUnauthorized: false
        }, function(err, response) {
            if (err) {
                reject(sendError(400, 'Trigger authentication request failed.', err.message));
            }
            else if(response.statusCode >= 400 && !(isDelete && response.statusCode === 404)) {
                reject(sendError(response.statusCode, 'Trigger authentication request failed.'));
            }
            else {
                resolve();
            }
        });
    });
}

function sendError(statusCode, error, message) {
    var params = {error: error};
    if (message) {
        params.message = message;
    }

    return {
        statusCode: statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: new Buffer(JSON.stringify(params)).toString('base64')
    };
}


function parseQName(qname) {
    var parsed = {};
    var delimiter = '/';
    var defaultNamespace = '_';
    if (qname && qname.charAt(0) === delimiter) {
        var parts = qname.split(delimiter);
        parsed.namespace = parts[1];
        parsed.name = parts.length > 2 ? parts.slice(2).join(delimiter) : '';
    } else {
        parsed.namespace = defaultNamespace;
        parsed.name = qname;
    }
    return parsed;
}


exports.main = main;


