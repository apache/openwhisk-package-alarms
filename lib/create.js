module.exports = function (tid, logger, utils) {

  // Test Endpoint
  this.endPoint = '/triggers';

  // Create Logic
  this.create = function (req, res) {

    var method = 'POST /triggers';

    logger.info(tid, method, 'Got trigger', req.body);

    var newTrigger = req.body;

    // early exits
    if (!newTrigger.namespace) return utils.sendError(method, 400, 'no namespace provided', res);
    if (!newTrigger.name) return utils.sendError(method, 400, 'no name provided', res);
    if (!newTrigger.cron) return utils.sendError(method, 400, 'no cron provided', res);
    if (newTrigger.maxTriggers > utils.triggersLimit) {
        return utils.sendError(method, 400, 'maxTriggers > ' + utils.triggersLimit + ' is not allowed', res);
    }

    newTrigger.apikey = req.user.uuid + ':' + req.user.key;
    try {
        utils.createTrigger(newTrigger);
    }
    catch(e) {
        logger.error(tid, method, e);
        return utils.sendError(method, 400, 'error creating alarm trigger', res);
    }

    var triggerIdentifier = utils.getTriggerIdentifier(newTrigger.apikey, newTrigger.namespace, newTrigger.name);
    utils.triggerDB.insert(newTrigger, triggerIdentifier, function(err) {
        if (!err) {
            res.status(200).json({ok: 'your trigger was created successfully'});
        }
    });

  }; // end create

};
