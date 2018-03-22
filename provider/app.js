'use strict';
/**
 * Service which can be configured to listen for triggers from a provider.
 * The Provider will store, invoke, and POST whisk events appropriately.
 */
var URL = require('url').URL;
var http = require('http');
var express = require('express');
var bodyParser = require('body-parser');
var bluebird = require('bluebird');
var logger = require('./Logger');

var ProviderUtils = require('./lib/utils.js');
var ProviderHealth = require('./lib/health.js');
var ProviderRAS = require('./lib/ras.js');
var ProviderActivation = require('./lib/active.js');
var constants = require('./lib/constants.js');

var Discover = require('node-discover');

// Initialize the Express Application
var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.set('port', process.env.PORT || 8080);

// Allow invoking servers with self-signed certificates.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// If it does not already exist, create the triggers database.  This is the database that will
// store the managed triggers.
var dbUsername = process.env.DB_USERNAME;
var dbPassword = process.env.DB_PASSWORD;
var dbHost = process.env.DB_HOST;
var dbProtocol = process.env.DB_PROTOCOL;
var dbPrefix = process.env.DB_PREFIX;
var databaseName = dbPrefix + constants.TRIGGER_DB_SUFFIX;
var redisUrl = process.env.REDIS_URL;
var monitoringAuth = process.env.MONITORING_AUTH;
var monitoringInterval = process.env.MONITORING_INTERVAL;
var filterDDName = '_design/' + constants.FILTERS_DESIGN_DOC;
var viewDDName = '_design/' + constants.VIEWS_DESIGN_DOC;

// If the environment variables below does not exist, the discover socket is not created.
var discoverDestinations = process.env.DISCOVER_DESTINATIONS;
var discoverAddress = process.env.DISCOVER_ADDRESS || '0.0.0.0';
var discoverPort = process.env.DISCOVER_PORT || '51007';
// The following conditions must be met :
//   masterTimeout >= nodeTimeout >= checkInterval > helloInterval
var helloInterval = process.env.DISCOVER_HELLO_INTERVAL || 1000;
var checkInterval = process.env.DISCOVER_CHECK_INTERVAL || 2000;
var nodeTimeout =  process.env.DISCOVER_NODE_TIMEOUT || 2000;
var masterTimeout = process.env.DISCOVER_MASTER_TIMEOUT || 2000;

// Create the Provider Server
var server = http.createServer(app);
server.listen(app.get('port'), function() {
    logger.info('server.listen', 'Express server listening on port ' + app.get('port'));
});


function createDiscover(destinations) {
    var method = 'createDiscover';

    return new Promise(function (resolve, reject) {
        if (destinations) {
            var opt = {
                address: discoverAddress,
                port: discoverPort,
                unicast: destinations,
                helloInterval: helloInterval,
                checkInterval: checkInterval,
                nodeTimeout: nodeTimeout,
                masterTimeout: masterTimeout
            };

            var discover = Discover(opt, function (err, success) {
                if (success) {
                    logger.info(method, 'The discover socket is created!');
                } else {
                    logger.error(method, 'Failed to create discover socket', err);
                    reject(err);
                }
            });

            if (discover) {
                // These are subscribe methods for logging.
                discover.on('promotion', function () {
                    logger.info(method, 'I was promoted to a master.', discover.me);
                });

                discover.on('added', function (obj) {
                    logger.info(method, 'A new node has been added.', obj);
                });

                discover.on('removed', function (obj) {
                    logger.info(method, 'A node has been removed.', obj);
                });

                discover.on('master', function (obj) {
                    logger.info(method, 'A new master is in control', obj);
                });

                resolve(discover);
            } else {
                reject('Failed to create discover socket');
            }
        } else {
            resolve();
        }
    });
}

function createDatabase() {
    var method = 'createDatabase';
    logger.info(method, 'creating the trigger database');

    var nano = require('nano')(dbProtocol + '://' + dbUsername + ':' + dbPassword + '@' + dbHost);

    if (nano !== null) {
        return new Promise(function (resolve, reject) {
            nano.db.create(databaseName, function (err, body) {
                if (!err) {
                    logger.info(method, 'created trigger database:', databaseName);
                }
                else if (err.statusCode !== 412) {
                    logger.info(method, 'failed to create trigger database:', databaseName, err);
                }

                var viewDD = {
                    views: {
                        triggers_by_worker: {
                            map: function (doc) {
                                if (doc.maxTriggers && (!doc.status || doc.status.active === true)) {
                                    emit(doc.worker || 'worker0', 1);
                                }
                            }.toString(),
                            reduce: '_count'
                        }
                    }
                };

                createDesignDoc(nano.db.use(databaseName), viewDDName, viewDD)
                .then((db) => {
                    var filterDD = {
                        filters: {
                            triggers_by_worker:
                                function (doc, req) {
                                    return doc.maxTriggers && ((!doc.worker && req.query.worker === 'worker0') ||
                                            (doc.worker === req.query.worker));
                                }.toString()
                        }
                    };
                    return createDesignDoc(db, filterDDName, filterDD);
                })
                .then((db) => {
                    resolve(db);
                })
                .catch(err => {
                    reject(err);
                });

            });
        });
    }
    else {
        Promise.reject('nano provider did not get created.  check db URL: ' + dbHost);
    }
}

function createDesignDoc(db, ddName, designDoc) {
    var method = 'createDesignDoc';

    return new Promise(function(resolve, reject) {

        db.get(ddName, function (error, body) {
            if (error) {
                //new design doc
                db.insert(designDoc, ddName, function (error, body) {
                    if (error && error.statusCode !== 409) {
                        logger.error(method, error);
                        reject('design doc could not be created: ' + error);
                    }
                    else {
                        resolve(db);
                    }
                });
            }
            else {
                resolve(db);
            }
        });
    });
}

function createRedisClient() {
    var method = 'createRedisClient';

    return new Promise(function(resolve, reject) {
        if (redisUrl) {
            var client;
            var redis = require('redis');
            bluebird.promisifyAll(redis.RedisClient.prototype);
            if (redisUrl.startsWith('rediss://')) {
                // If this is a rediss: connection, we have some other steps.
                client = redis.createClient(redisUrl, {
                    tls: { servername: new URL(redisUrl).hostname }
                });
                // This will, with node-redis 2.8, emit an error:
                // "node_redis: WARNING: You passed "rediss" as protocol instead of the "redis" protocol!"
                // This is a bogus message and should be fixed in a later release of the package.
            } else {
                client = redis.createClient(redisUrl);
            }

            client.on('connect', function () {
                resolve(client);
            });

            client.on('error', function (err) {
                logger.error(method, 'Error connecting to redis', err);
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
    var discoverNode;
    var providerUtils;

    if (server !== null) {
        var address = server.address();
        if (address === null) {
            logger.error(method, 'Error initializing server. Perhaps port is already in use.');
            process.exit(-1);
        }
    }

    createDatabase()
    .then(db => {
        nanoDb = db;
        return createDiscover(discoverDestinations);
    })
    .then(discover => {
        discoverNode = discover;
        return createRedisClient();
    })
    .then(client => {
        providerUtils = new ProviderUtils(logger, nanoDb, client, discoverNode);
        return providerUtils.initRedis();
    })
    .then(() => {
        var providerRAS = new ProviderRAS();
        var providerHealth = new ProviderHealth(logger, providerUtils);
        var providerActivation = new ProviderActivation(logger, providerUtils);

        // RAS Endpoint
        app.get(providerRAS.endPoint, providerRAS.ras);

        // Health Endpoint
        app.get(providerHealth.endPoint, providerUtils.authorize, providerHealth.health);

        // Activation Endpoint
        app.get(providerActivation.endPoint, providerUtils.authorize, providerActivation.active);

        providerUtils.initAllTriggers();

        if (monitoringAuth) {
            setInterval(function () {
                providerHealth.monitor(monitoringAuth);
            }, monitoringInterval || constants.MONITOR_INTERVAL);
        }
    })
    .catch(err => {
        logger.error(method, 'an error occurred creating database:', err);
    });

}

init(server);
