var CronJob = require('cron').CronJob;
var moment = require('moment');

const common = require('./lib/common');
const Database = require('./lib/Database');

function main(params) {

    if (!params.authKey) {
        return common.sendError(400, 'no authKey parameter was provided');
    }
    if (!params.triggerName) {
        return common.sendError(400, 'no trigger name parameter was provided');
    }

    var triggerParts = common.parseQName(params.triggerName);
    var triggerID = `${params.authKey}/${triggerParts.namespace}/${triggerParts.name}`;
    var triggerURL = `https://${params.apihost}/api/v1/namespaces/${triggerParts.namespace}/triggers/${triggerParts.name}`;

    var workers = params.workers instanceof Array ? params.workers : [];
    var db;

    if (params.__ow_method === "put") {

        if (typeof params.trigger_payload === 'string') {
            params.trigger_payload = {payload: params.trigger_payload};
        }

        var newTrigger = {
            apikey: params.authKey,
            name: triggerParts.name,
            namespace: triggerParts.namespace,
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
            else {
                var date = new Date(params.date);
                if (isNaN(date.getTime())) {
                    return common.sendError(400, `date parameter '${params.date}' is not a valid Date`);
                }
                else if (Date.now() >= date.getTime()) {
                    return common.sendError(400, `date parameter '${params.date}' must be in the future`);
                }
                else {
                    newTrigger.date = params.date;
                }
            }
        }
        else {
            if (!params.cron) {
                return common.sendError(400, 'alarms trigger feed is missing the cron parameter');
            }
            else {
                try {
                    new CronJob(params.cron, function() {});
                    newTrigger.cron = params.cron;
                } catch(ex) {
                    return common.sendError(400, `cron pattern '${params.cron}' is not valid`);
                }
            }
        }

        return new Promise(function (resolve, reject) {
            common.verifyTriggerAuth(triggerURL, params.authKey, false)
            .then(() => {
                db = new Database(params.DB_URL, params.DB_NAME);
                return db.getWorkerID(workers);
            })
            .then((worker) => {
                console.log('trigger will be assigned to worker ' + worker);
                newTrigger.worker = worker;
                return db.createTrigger(triggerID, newTrigger);
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
            common.verifyTriggerAuth(triggerURL, params.authKey, false)
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
                }
                else {
                    body.config.cron = doc.cron;
                }
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
            common.verifyTriggerAuth(triggerURL, params.authKey, true)
            .then(() => {
                db = new Database(params.DB_URL, params.DB_NAME);
                return db.updateTrigger(triggerID, 0);
            })
            .then(id => {
                return db.deleteTrigger(id, 0);
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
        return common.sendError(400, 'unsupported lifecycleEvent');
    }
}

exports.main = main;


