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

    if (params.__ow_method === "post") {

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
            var date = validateDate(params.date, 'date');
            if (date !== params.date) {
                return common.sendError(400, date);
            }
            newTrigger.date = date;
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
                    cronHandle = new CronJob(params.cron, function() {});
                    newTrigger.cron = params.cron;
                } catch(ex) {
                    return common.sendError(400, `cron pattern '${params.cron}' is not valid`);
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
                    body.config.startDate = doc.startDate;
                    body.config.stopDate = doc.stopDate;
                    if (doc.minutes) {
                        body.config.minutes = doc.minutes;
                    }
                    else {
                        body.config.cron = doc.cron;
                    }
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
                return db.disableTrigger(triggerID, 0);
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

function validateDate(date, paramName, startDate) {

    var dateObject = new Date(date);

    if (isNaN(dateObject.getTime())) {
        return `${paramName} parameter '${date}' is not a valid Date`;
    }
    else if (Date.now() >= dateObject.getTime()) {
        return `${paramName} parameter '${date}' must be in the future`;
    }
    else if (startDate && dateObject <= new Date(startDate).getTime()) {
        return `${paramName} parameter '${date}' must be greater than the startDate parameter ${startDate}`;
    }
    else {
        return date;
    }

}

exports.main = main;


