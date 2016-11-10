var _ = require('lodash');
var moment = require('moment');
var winston = require('winston');

var emailRegex = /(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))/g;

var logger = new winston.Logger({
    transports: [
        new winston.transports.Console({
            timestamp: function() {
                return moment.utc().format("YYYY-MM-DDTHH:mm:ss.SSS") + 'Z';
            },
            formatter: function(options) {
                // Return string will be passed to logger.
                return '[' + options.timestamp() +'] ['+ options.level.toUpperCase() +'] '+  options.message;
            }
        })
    ],
    filters: [
        function maskEmails(level, msg) {
            return msg.replace(emailRegex, 'xxxxxxxx');
        }
    ]
});

function getMessage(argsObject) {
    var args = Array.prototype.slice.call(argsObject);
    args.splice(0, 2);
    args.forEach(function(arg, i) {
        if (_.isObject(args[i])) {
            args[i] = JSON.stringify(args[i]);
        }
    });
    return args.join(' ');
}

// FORMAT: s"[$time] [$category] [$id] [$componentName] $message"
module.exports = {
    info: function(tid, name) {
        logger.info('['+tid+']', '['+name+']', getMessage(arguments));
    },
    warn: function(tid, name) {
        logger.warn('['+tid+']', '['+name+']', getMessage(arguments));
    },
    error: function(tid, name) {
        logger.error('['+tid+']', '['+name+']', getMessage(arguments));
    },
    debug: function(tid, name) {
        logger.debug('['+tid+']', '['+name+']', getMessage(arguments));
    }
};
