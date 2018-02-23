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
        triggerID: newTrigger.triggerID,
        uri: newTrigger.uri,
        monitor: newTrigger.monitor
    };

    this.scheduleAlarm = function(triggerIdentifier, callback) {
        var method = 'scheduleCronAlarm';

        try {
            return new Promise(function(resolve, reject) {

                var cronHandle = new CronJob(newTrigger.cron, callback);

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
