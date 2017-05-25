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
                'dateChanged': new Date().toISOString(),
            }
        };

        return new Promise(function (resolve, reject) {
            verifyTriggerAuth(triggerURL, params.authKey, false)
            .then(() => {
                 return createTrigger(db, triggerID, newTrigger);
            })
            .then(resolve)
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
            .then(resolve)
            .catch(err => {
                reject(err);
            });
        });
    }
    else {
        return sendError(400, 'lifecycleEvent must be CREATE or DELETE');
    }
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
                                }).catch(err => {
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
                    }).catch(err => {
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
        body: new Buffer(JSON.stringify(params)).toString('base64'),
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


