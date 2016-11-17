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

// TODO: Setup a proper Transaction ID
var tid = "??";

// Whisk API Router Host
var routerHost = process.env.ROUTER_HOST || 'localhost';

// Maximum number of times to retry the invocation of an action
// before deleting the associated trigger
var retriesBeforeDelete = constants.RETRIES_BEFORE_DELETE;

// Allow invoking servers with self-signed certificates.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// If it does not already exist, create the triggers database.  This is the database that will
// store the managed triggers.
//
var dbUsername = process.env.DB_USERNAME;
var dbPassword = process.env.DB_PASSWORD;
var dbHost = process.env.DB_HOST;
var dbPort = process.env.DB_PORT;
var dbProtocol = process.env.DB_PROTOCOL;
var dbPrefix = process.env.DB_PREFIX;
var databaseName = dbPrefix + constants.TRIGGER_DB_SUFFIX;

// Create the Provider Server
var server = http.createServer(app);
server.listen(app.get('port'), function(){
    logger.info(tid, 'server.listen', 'Express server listening on port ' + app.get('port'));
});

function createDatabase (nanop) {

  logger.info(tid, 'createDatabase', 'creating the trigger database');
  if (nanop !== null) {
    nanop.db.create(databaseName, function(err, body, header) {
        if (!err) {
          logger.info(tid, databaseName, ' database for triggers was created.');
        } else {
          logger.info(tid, databaseName, 'failed to create the trigger database.  it might already exist ',err);
        }
    });
    var chDb = nanop.db.use(databaseName);
    return chDb;
  } else {
    logger.info(tid, databaseName, 'failed to create the trigger database.  nano provider did not get created.  check db URL: ' + dbHost);
    return null;
  }

}

function createTriggerDb () {

  logger.info('url is ' +  dbProtocol + '://' + dbUsername + ':' + dbPassword + '@' + dbHost);
  var nanop = require('nano')(dbProtocol + '://' + dbUsername + ':' + dbPassword + '@' + dbHost);

  return createDatabase (nanop);

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

    ///
    var nanoDb = createTriggerDb();
    if (nanoDb === null) {
    	logger.error(tid, 'init', 'found an error creating database: ', err);
    } else {

      logger.info(tid, 'init', 'trigger storage database details: ', nanoDb);

      var providerUtils = new ProviderUtils (tid, logger, app, retriesBeforeDelete, nanoDb, routerHost);
      var providerRAS = new ProviderRAS (tid, logger, providerUtils);
      var providerHealth = new ProviderHealth (tid, logger, providerUtils);
      var providerCreate = new ProviderCreate (tid, logger, providerUtils);
      var providerDelete = new ProviderDelete (tid, logger, providerUtils);

      // RAS Endpoint
      app.get(providerRAS.endPoint, providerRAS.ras);

      // Health Endpoint
      app.get(providerHealth.endPoint, providerHealth.health);

      // Endpoint for Creating a new Trigger
      app.post(providerCreate.endPoint, providerUtils.authorize, providerCreate.create);

      // Endpoint for Deleting an existing Trigger.
      app.delete(providerDelete.endPoint, providerUtils.authorize, providerDelete.delete);

      providerUtils.initAllTriggers();

    }

}

init(server);
