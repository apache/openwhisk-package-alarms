var _ = require('lodash');
var request = require('request');
var CronJob = require('cron').CronJob;
var Agent = require('agentkeepalive');

module.exports = function(
  tid,
  logger,
  app,
  retriesBeforeDelete,
  triggerDB,
  triggersLimit,
  routerHost
) {

    this.tid = tid;
    this.logger = logger;
    this.app = app;
    this.retriesBeforeDelete = retriesBeforeDelete;
    this.triggerDB = triggerDB;
    this.triggersLimit = triggersLimit;
    this.routerHost = routerHost;

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
        var keyParts = apikey.split(':');
        var triggerHandle = that.triggers[triggerIdentifier];

        triggerHandle.triggersLeft--;

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
                    triggerHandle.triggersLeft++; // setting the counter back to where it used to be
                    logger.warn(tid, method, 'there was an error invoking', triggerIdentifier, err);
                }
                else {
                    triggerHandle.retriesLeft = retriesBeforeDelete; // reset retry counter
                    logger.info(tid, method, 'fired', triggerIdentifier, 'with', payload, triggerHandle.triggersLeft, 'triggers left');
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
          return sendError(400, 'Malformed request, authentication header expected', res);
      }

      var parts = req.headers.authorization.split(' ');
      if (parts[0].toLowerCase() !== 'basic' || !parts[1]) {
          return sendError(400, 'Malformed request, basic authentication expected', res);
      }

      var auth = new Buffer(parts[1], 'base64').toString();
      auth = auth.match(/^([^:]*):(.*)$/);
      if (!auth) {
          return sendError(400, 'Malformed request, authentication invalid', res);
      }

      req.user = {
          uuid: auth[1],
          key: auth[2]
      };

      next();
    };

};
