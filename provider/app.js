'use strict';
/**
 * Service which can be configured to listen for triggers from a provider.
 * The Provider will store, invoke, and POST whisk events appropriately.
 */
var http = require('http');
var express = require('express');
var request = require('request');
var bodyParser = require('body-parser');
var logger = require('./Logger');

var ProviderUtils = require('./lib/utils.js');
var ProviderHealth = require('./lib/health.js');
var ProviderRAS = require('./lib/ras.js');
var ProviderCreate = require('./lib/create.js');
var ProviderDelete = require('./lib/delete.js');
var constants = require('./lib/constants.js');

// Initialize the Express Application
var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.set('port', process.env.PORT || 8080);

// Whisk API Router Host
var routerHost = process.env.ROUTER_HOST || 'localhost';

// Allow invoking servers with self-signed certificates.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// If it does not already exist, create the triggers database.  This is the database that will
// store the managed triggers.
//
var dbUsername = process.env.DB_USERNAME;
var dbPassword = process.env.DB_PASSWORD;
var dbHost = process.env.DB_HOST;
var dbProtocol = process.env.DB_PROTOCOL;
var dbPrefix = process.env.DB_PREFIX;
var databaseName = dbPrefix + constants.TRIGGER_DB_SUFFIX;
var ddname = '_design/filters';

// Create the Provider Server
var server = http.createServer(app);
server.listen(app.get('port'), function(){
    logger.info('server.listen', 'Express server listening on port ' + app.get('port'));
});

function createDatabase(nanop) {
    logger.info('createDatabase', 'creating the trigger database');
    return new Promise(function(resolve, reject) {
        nanop.db.create(databaseName, function (err, body) {
            if (!err) {
                logger.info('createDatabase', 'created trigger database:', databaseName);
            }
            else {
                logger.info('createDatabase', 'failed to create trigger database:', databaseName, err);
            }
            var db = nanop.db.use(databaseName);
            var only_triggers = {
                map: function (doc) {
                    if (doc.maxTriggers) {
                        emit(doc._id, 1);
                    }
                }.toString()
            };

            db.get(ddname, function (error, body) {
                if (error) {
                    //new design doc
                    db.insert({
                        views: {
                            only_triggers: only_triggers
                        },
                    }, ddname, function (error, body) {
                        if (error) {
                            reject("view could not be created: " + error);
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
        return createDatabase (nanop);
    }
    else {
        Promise.reject('nano provider did not get created.  check db URL: ' + dbHost);
    }
}

// Initialize the Provider Server
function init(server) {

    if (server !== null) {
        var address = server.address();
        if (address === null) {
            logger.error('init', 'Error initializing server. Perhaps port is already in use.');
            process.exit(-1);
        }
    }

    createTriggerDb()
        .then(nanoDb => {
            logger.info('init', 'trigger storage database details:', nanoDb);

            var providerUtils = new ProviderUtils (logger, app, nanoDb, routerHost);
            var providerRAS = new ProviderRAS (logger);
            var providerHealth = new ProviderHealth (logger, providerUtils);
            var providerCreate = new ProviderCreate (logger, providerUtils);
            var providerDelete = new ProviderDelete (logger, providerUtils);

            // RAS Endpoint
            app.get(providerRAS.endPoint, providerRAS.ras);

            // Health Endpoint
            app.get(providerHealth.endPoint, providerHealth.health);

            // Endpoint for Creating a new Trigger
            app.post(providerCreate.endPoint, providerUtils.authorize, providerCreate.create);

            // Endpoint for Deleting an existing Trigger.
            app.delete(providerDelete.endPoint, providerUtils.authorize, providerDelete.delete);

            providerUtils.initAllTriggers();
        }).catch(err => {
            logger.error('init', 'an error occurred creating database:', err);
        });

}

init(server);
