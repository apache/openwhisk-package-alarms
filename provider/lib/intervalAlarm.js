var lt =  require('long-timeout');

module.exports = function(logger, newTrigger) {


    var cachedTrigger = {
        apikey: newTrigger.apikey,
        name: newTrigger.name,
        namespace: newTrigger.namespace,
        payload: newTrigger.payload,
        minutes: newTrigger.minutes,
        triggerID: newTrigger.triggerID,
        uri: newTrigger.uri,
        monitor: newTrigger.monitor
    };

    this.scheduleAlarm = function(triggerIdentifier, callback) {
        var method = 'scheduleIntervalAlarm';

        try {
            return new Promise(function(resolve, reject) {

                var intervalInMilliSeconds = newTrigger.minutes * 1000 * 60;
                var startDate = new Date(newTrigger.startDate).getTime();

                if (newTrigger.stopDate) {
                    cachedTrigger.stopDate = newTrigger.stopDate;
                    //do not create trigger if the stopDate is in the past
                    if (new Date(newTrigger.stopDate).getTime() <= Date.now()) {
                        return reject('the stop date has expired');
                    }
                }

                if (startDate > Date.now()) {
                    //fire the trigger and start the interval on the start date
                    logger.info(method, triggerIdentifier, 'waiting for start date', startDate);
                    lt.setTimeout(function() {
                        logger.info(method, triggerIdentifier, 'firing first trigger and starting interval upon reaching start date', startDate);
                        var intervalHandle = lt.setInterval(callback, intervalInMilliSeconds);
                        cachedTrigger.intervalHandle = intervalHandle;
                        resolve(cachedTrigger);
                    }, startDate - Date.now());
                }
                else {
                    //fire the trigger and start the interval at the next scheduled interval
                    //as long as the next scheduled interval is not past the stop date
                    var intervalsFired = Math.floor((Date.now() - startDate)/intervalInMilliSeconds);
                    var nextScheduledInterval = startDate + (intervalInMilliSeconds * (intervalsFired + 1));

                    if (newTrigger.stopDate && nextScheduledInterval > new Date(newTrigger.stopDate).getTime()) {
                        return reject('the next scheduled trigger fire is after the stop date');
                    }

                    logger.info(method, triggerIdentifier, 'waiting for next interval');
                    lt.setTimeout(function() {
                        logger.info(method, triggerIdentifier, 'firing trigger and starting interval for trigger past its start date');
                        var intervalHandle = lt.setInterval(callback, intervalInMilliSeconds);
                        cachedTrigger.intervalHandle = intervalHandle;
                        resolve(cachedTrigger);
                    }, nextScheduledInterval - Date.now());
                }

            });
        } catch (err) {
            return Promise.reject(err);
        }
    };

};
