var _ = require('lodash');
var moment = require('moment');
var winston = require('winston');
var safeStringify = require('json-stringify-safe');

var apiKeyRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-zA-Z]{64}/g;

var worker = process.env.WORKER || 'worker0';
var host = process.env.HOST_INDEX || 'host0';

var logger = new winston.Logger({
    transports: [
        new winston.transports.Console({
            timestamp: function() {
                return moment.utc().format("YYYY-MM-DDTHH:mm:ss.SSS") + 'Z';
            },
            formatter: function(options) {
                // Return string will be passed to logger.
                return `[${options.timestamp()}] [${options.level.toUpperCase()}] [${worker}] [${host}] [alarmsTrigger] ${options.message}`;
            }
        })
    ],
    filters: [
        function maskAPIKeys(level, msg) {
            return msg.replace(apiKeyRegex, 'xxxxxxxx');
        }
    ]
});

function getMessage(argsObject) {
    var args = Array.prototype.slice.call(argsObject);
    args.shift();
    args.forEach(function(arg, i) {
        if (_.isObject(args[i])) {
            args[i] = safeStringify(args[i]);
        }
    });
    return args.join(' ');
}

// FORMAT: s"[$time] [$category] [$id] [$componentName] [$name] $message"
module.exports = {
    info: function(name) {
        logger.info('['+name+']', getMessage(arguments));
    },
    warn: function(name) {
        logger.warn('['+name+']', getMessage(arguments));
    },
    error: function(name) {
        logger.error('['+name+']', getMessage(arguments));
    },
    debug: function(name) {
        logger.debug('['+name+']', getMessage(arguments));
    }
};
