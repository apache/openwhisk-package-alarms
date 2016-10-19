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
var ProviderRAS = require('./lib/ras.js');
var ProviderUpdate = require('./lib/update.js');
var ProviderCreate = require('./lib/create.js');
var ProviderDelete = require('./lib/delete.js');
var constants = require('./lib/constants.js');

// Initialize the Express Application
var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.set('port', process.env.PORT || 8080);

// TODO: Setup a proper Transaction ID
var tid = "??";

// Whisk API Router Host
var routerHost = process.env.ROUTER_HOST || 'localhost';

// This is the maximum times a single trigger is allow to fire.
// Trigger should not be allow to be created with a value higher than this value
// Trigger can be created with a value lower than this between 1 and this value
var triggerFireLimit = 10000;

// Maximum number of times to retry the invocation of an action
// before deleting the associated trigger
var retriesBeforeDelete = 5;

// Allow invoking servers with self-signed certificates.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// If it does not already exist, create the triggers database.  This is the database that will
// store the managed triggers.
//
var dbProvider = process.env.DB_PROVIDER;
var dbUsername = process.env.DB_USERNAME;
var dbPassword = process.env.DB_PASSWORD;
var dbHost = process.env.DB_HOST;
var dbPort = process.env.DB_PORT;
var dbProtocol = process.env.DB_PROTOCOL;
var dbPrefix = process.env.DB_PREFIX;
var databaseName = dbPrefix + constants.TRIGGER_DB_SUFFIX;
var triggerDB = createTriggerDb();

var providerUtils = new ProviderUtils (tid, logger, app, retriesBeforeDelete, triggerDB, triggerFireLimit, routerHost);
var providerRAS = new ProviderRAS (tid, logger, providerUtils);
var providerUpdate = new ProviderUpdate (tid, logger, providerUtils);
var providerCreate = new ProviderCreate (tid, logger, providerUtils);
var providerDelete = new ProviderDelete (tid, logger, providerUtils);

// Map of triggers managed by this Provider
var triggers = {};

// RAS Endpoint
app.get(providerRAS.endPoint, providerRAS.ras);

// Endpoint for Update OR Create a Trigger
app.put(providerUpdate.endPoint, providerUtils.authorize, providerUpdate.update);

// Endpoint for Creating a new Trigger
app.post(providerCreate.endPoint, providerUtils.authorize, providerCreate.create);

// Endpoint for Deleting an existing Trigger.
app.delete(providerDelete.endPoint, providerUtils.authorize, providerDelete.delete);

// Create the Provider Server
var server = http.createServer(app);
server.listen(app.get('port'), function(){
    logger.info(tid, 'server.listen', 'Express server listening on port ' + app.get('port'));
});

function createTriggerDb () {

  var nanop = null;
  var tDB = null;

  if (dbProvider === 'Cloudant') {
    nanop = require('nano')('https://' + dbUsername + ':' + dbPassword + '@' + dbUsername + '.cloudant.com' + ':' + dbPort);
  } else if (dbProvider === 'CouchDB') {
    // TODO: add couch db provider create logic
    nanop = require('nano')('https://' + dbUsername + ':' + dbPassword + '@' + dbHost + ':' + dbPort);
  }

  if (nanop !== null) {
    nanop.db.create(databaseName, function(err, body, header) {
        if (!err) {
          logger.info(tid, databaseName, ' database for triggers was created.');
        } else {
          logger.info(tid, databaseName, err);
        }
    });

    tDB = nanop.db.use(databaseName);
  }

  return tDB;

}

// Initialize the Provider Server
function init(server) {
    if (server !== null) {
        var address = server.address();
        if (address === null) {
            logger.error(tid, 'init', 'Error initializing server. Perhaps port is already in use.');
            process.exit(-1);
        }
    }
    providerUtils.initAllTriggers();
}

init(server);
