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
        monitor: newTrigger.monitor
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
