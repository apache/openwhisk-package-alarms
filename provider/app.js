'use strict';
/**
 * Service which can be configured to listen for triggers from a provider.
 * The Provider will store, invoke, and POST whisk events appropriately.
 */
var http = require('http');
var express = require('express');
var request = require('request');
var bodyParser = require('body-parser');
var bluebird = require('bluebird');
var logger = require('./Logger');

var ProviderUtils = require('./lib/utils.js');
var ProviderHealth = require('./lib/health.js');
var ProviderRAS = require('./lib/ras.js');
var ProviderActivation = require('./lib/active.js');
var constants = require('./lib/constants.js');

// Initialize the Express Application
var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.set('port', process.env.PORT || 8080);

// Allow invoking servers with self-signed certificates.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// If it does not already exist, create the triggers database.  This is the database that will
// store the managed triggers.
var dbUsername = process.env.DB_USERNAME;
var dbPassword = process.env.DB_PASSWORD;
var dbHost = process.env.DB_HOST;
var dbProtocol = process.env.DB_PROTOCOL;
var dbPrefix = process.env.DB_PREFIX;
var databaseName = dbPrefix + constants.TRIGGER_DB_SUFFIX;
var redisUrl = process.env.REDIS_URL;
var ddname = '_design/' + constants.DESIGN_DOC_NAME;

// Create the Provider Server
var server = http.createServer(app);
server.listen(app.get('port'), function() {
    logger.info('server.listen', 'Express server listening on port ' + app.get('port'));
});

function createDatabase(nanop) {
    var method = 'createDatabase';
    logger.info(method, 'creating the trigger database');

    return new Promise(function(resolve, reject) {
        nanop.db.create(databaseName, function (err, body) {
            if (!err) {
                logger.info(method, 'created trigger database:', databaseName);
            }
            else {
                logger.info(method, 'failed to create trigger database:', databaseName, err);
            }
            var db = nanop.db.use(databaseName);

            var only_triggers_by_worker = function(doc, req) {
                return doc.maxTriggers && ((!doc.worker && req.query.worker === 'worker0') || (doc.worker === req.query.worker));
            }.toString();

            db.get(ddname, function (error, body) {
                if (error) {
                    //new design doc
                    db.insert({
                        filters: {
                            only_triggers_by_worker: only_triggers_by_worker
                        },
                    }, ddname, function (error, body) {
                        if (error) {
                            reject("filter could not be created: " + error);
                        }
                        resolve(db);
                    });
                }
                else {
                    resolve(db);
                }
            });
        });
    });
}

function createTriggerDb() {
    var nanop = require('nano')(dbProtocol + '://' + dbUsername + ':' + dbPassword + '@' + dbHost);
    if (nanop !== null) {
        return createDatabase(nanop);
    }
    else {
        Promise.reject('nano provider did not get created.  check db URL: ' + dbHost);
    }
}

function createRedisClient() {
    var method = 'createRedisClient';

    return new Promise(function(resolve, reject) {
        if (redisUrl) {
            var redis = require('redis');
            bluebird.promisifyAll(redis.RedisClient.prototype);
            var client = redis.createClient(redisUrl);

            client.on("connect", function () {
                resolve(client);
            });

            client.on("error", function (err) {
                logger.error(method, 'Error creating redis', err);
                reject(err);
            });
        }
        else {
            resolve();
        }
    });
}

// Initialize the Provider Server
function init(server) {
    var method = 'init';
    var nanoDb;
    var providerUtils;

    if (server !== null) {
        var address = server.address();
        if (address === null) {
            logger.error(method, 'Error initializing server. Perhaps port is already in use.');
            process.exit(-1);
        }
    }

    createTriggerDb()
    .then(db => {
        nanoDb = db;
        return createRedisClient();
    })
    .then(client => {
        providerUtils = new ProviderUtils(logger, nanoDb, client);
        return providerUtils.initRedis();
    })
    .then(() => {
        var providerRAS = new ProviderRAS();
        var providerHealth = new ProviderHealth(providerUtils);
        var providerActivation = new ProviderActivation(logger, providerUtils);

        // RAS Endpoint
        app.get(providerRAS.endPoint, providerRAS.ras);

        // Health Endpoint
        app.get(providerHealth.endPoint, providerUtils.authorize, providerHealth.health);

        // Activation Endpoint
        app.get(providerActivation.endPoint, providerUtils.authorize, providerActivation.active);

        providerUtils.initAllTriggers();
    }).catch(err => {
        logger.error(method, 'an error occurred creating database:', err);
    });

}

init(server);
