var CronJob = require('cron').CronJob;
var constants = require('./constants.js');

module.exports = function(logger, newTrigger) {

    var maxTriggers = newTrigger.maxTriggers || constants.DEFAULT_MAX_TRIGGERS;

    var cachedTrigger = {
        apikey: newTrigger.apikey,
        name: newTrigger.name,
        namespace: newTrigger.namespace,
        cron: newTrigger.cron,
        triggersLeft: maxTriggers,
        maxTriggers: maxTriggers
    };

    this.scheduleAlarm = function(triggerIdentifier, callback) {
        var method = 'scheduleCronAlarm';

        try {
            return new Promise(function(resolve, reject) {

                var cronHandle = new CronJob(newTrigger.cron, callback);
                logger.info(method, triggerIdentifier, 'starting cron job');
                cronHandle.start();

                cachedTrigger.cronHandle = cronHandle;
                resolve(cachedTrigger);
            });
        } catch (err) {
            return Promise.reject(err);
        }
    };

};
