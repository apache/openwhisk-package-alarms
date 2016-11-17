var _ = require('lodash');
var request = require('request');
var CronJob = require('cron').CronJob;
var constants = require('./constants.js');

module.exports = function(
  tid,
  logger,
  app,
  retriesBeforeDelete,
  triggerDB,
  routerHost
) {

    this.tid = tid;
    this.logger = logger;
    this.app = app;
    this.retriesBeforeDelete = retriesBeforeDelete;
    this.triggerDB = triggerDB;
    this.routerHost = routerHost;

    this.logger.info (tid, 'utils', 'received database to store triggers: ' + triggerDB);

    // this is the default trigger fire limit (in the event that is was not set during trigger creation)
    this.defaultTriggerFireLimit = constants.DEFAULT_TRIGGER_COUNT;

    // Log HTTP Requests
    app.use(function(req, res, next) {
        if (req.url.indexOf('/alarmtriggers') === 0) {
            logger.info(tid, 'HttpRequest', req.method, req.url);
        }
        next();
    });

    this.module = 'utils';
    this.triggers = {};

    var that = this;

    this.createTrigger = function (newTrigger) {

        var method = 'createTrigger';

        var triggerIdentifier = that.getTriggerIdentifier(newTrigger.apikey, newTrigger.namespace, newTrigger.name);

        // to avoid multiple cron jobs for the same trigger we will only create a cron job if 
        // the trigger is not already in the list of identified triggers
        if (!(triggerIdentifier in that.triggers)) {
            var cronHandle = new CronJob(newTrigger.cron,
                    function onTick() {
                        var triggerHandle = that.triggers[triggerIdentifier];
                        if(triggerHandle && triggerHandle.triggersLeft > 0 && triggerHandle.retriesLeft > 0) {
                            that.fireTrigger(newTrigger.namespace, newTrigger.name, newTrigger.payload, newTrigger.apikey);
                        }
                    }
                );
                cronHandle.start();
                logger.info(tid, method, triggerIdentifier, 'created successfully');
        }

        that.triggers[triggerIdentifier] = {
            cron: newTrigger.cron,
            cronHandle: cronHandle,
            triggersLeft: newTrigger.maxTriggers,
            retriesLeft: retriesBeforeDelete,
            apikey: newTrigger.apikey,
            name: newTrigger.name,
            namespace: newTrigger.namespace
        };

    };

    this.fireTrigger = function (namespace, name, payload, apikey) {
        var method = 'fireTrigger';
        var triggerIdentifier = that.getTriggerIdentifier(apikey, namespace, name);
        var routerHost = process.env.ROUTER_HOST;
        var host = "https://" + routerHost + ":443";
        // https://github.com/openwhisk/openwhisk-alarms-trigger/issues/9
        // resolved this in create.js by validating apikey and failing with a useful message if it is
        // not present
        var keyParts = apikey.split(':');

        var triggerHandle = that.triggers[triggerIdentifier];

        // we need a way of know if the triggers should fire without max fire constraint (ie fire infinite times)
        var unlimitedTriggerFires = false;
        if (triggerHandle.triggersLeft === -1) {
        	unlimitedTriggerFires = true;
        }

        // we only decrement the number of triggers left if the max trigger fires count is not set to infinity
        // (triggersLeft = -1 implies max trigger fires is set to infinity)
        if (!unlimitedTriggerFires) {
            triggerHandle.triggersLeft--;
        }

        request({
            method: 'POST',
            uri: host + '/api/v1/namespaces/' + namespace + '/triggers/' + name,
            json: payload,
            auth: {
                user: keyParts[0],
                pass: keyParts[1]
            }
        }, function(err, res) {
            if(triggerHandle) {
                if(err || res.statusCode >= 400) {
                    triggerHandle.retriesLeft--;

                    // we only increment trigger counter if the number of triggers is finite
                    if (!unlimitedTriggerFires) {
                    	triggerHandle.triggersLeft++; // setting the counter back to where it used to be
                    }

                    logger.warn(tid, method, 'there was an error invoking', triggerIdentifier, err);
                }
                else {
                    triggerHandle.retriesLeft = retriesBeforeDelete; // reset retry counter
                    var triggersLeftReport = triggerHandle.triggersLeft;
                    if (unlimitedTriggerFires) {
                    	triggersLeftReport = 'INFINITE';
                    }
                    logger.info(tid, method, 'fired', triggerIdentifier, 'with', payload, triggersLeftReport, 'triggers left');
                }

                if(triggerHandle.triggersLeft === 0 || triggerHandle.retriesLeft === 0) {
                    if(triggerHandle.triggersLeft === 0) {
                        logger.info(tid, 'onTick', 'no more triggers left, deleting');
                    }
                    if(triggerHandle.retriesLeft === 0) {
                        logger.info(tid, 'onTick', 'too many retries, deleting');
                    }
                    that.deleteTrigger(triggerHandle.namespace, triggerHandle.name, triggerHandle.apikey);
                }
            }
            else {
                logger.info(tid, method, 'trigger', triggerIdentifier, 'was deleted between invocations');
            }
        });
    };

    this.deleteTrigger = function (namespace, name, apikey) {

        var method = 'deleteTrigger';

        var triggerIdentifier = that.getTriggerIdentifier(apikey, namespace, name);
        if(that.triggers[triggerIdentifier]) {
            that.triggers[triggerIdentifier].cronHandle.stop();
            delete that.triggers[triggerIdentifier];

            logger.info(tid, method, 'trigger', triggerIdentifier, 'successfully deleted');

            that.triggerDB.get(triggerIdentifier, function(err, body) {
                if(!err) {
                    that.triggerDB.destroy(body._id, body._rev, function(err) {
                        if(err) {
                            logger.error(tid, method, 'there was an error while deleting', triggerIdentifier, 'from database');
                        }
                    });
                }
                else {
                    logger.error(tid, method, 'there was an error while deleting', triggerIdentifier, 'from database');
                }
            });
            return true;
        }
        else {
            logger.info(tid, method, 'trigger', triggerIdentifier, 'could not be found');
            return false;
        }
    };

    this.getTriggerIdentifier = function (apikey, namespace, name) {
        return apikey + '/' + namespace + '/' + name;
    };

    this.initAllTriggers = function () {
        var method = 'initAllTriggers';
        logger.info(tid, method, 'resetting system from last state');
        that.triggerDB.list({include_docs: true}, function(err, body) {
            if(!err) {
                body.rows.forEach(function(trigger) {
                    that.createTrigger(trigger.doc);
                });
            }
            else {
                logger.error(tid, method, 'could not get latest state from database');
            }
        });
    };

    this.sendError = function (method, code, message, res) {
        logger.warn(tid, method, message);
        res.status(code).json({error: message});
    };

    this.authorize = function(req, res, next) {
      if(!req.headers.authorization) {
          return that.sendError(400, 'Malformed request, authentication header expected', res);
      }

      var parts = req.headers.authorization.split(' ');
      if (parts[0].toLowerCase() !== 'basic' || !parts[1]) {
          return that.sendError(400, 'Malformed request, basic authentication expected', res);
      }

      var auth = new Buffer(parts[1], 'base64').toString();
      auth = auth.match(/^([^:]*):(.*)$/);
      if (!auth) {
          return that.sendError(400, 'Malformed request, authentication invalid', res);
      }

      req.user = {
          uuid: auth[1],
          key: auth[2]
      };

      next();
    };

};
