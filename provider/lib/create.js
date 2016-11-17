module.exports = function (tid, logger, utils) {

  // Test Endpoint
  this.endPoint = '/triggers';

  // Create Logic
  this.create = function (req, res) {

    var method = 'POST /triggers';

    utils.logger.info(tid, method, 'Got trigger', req.body);

    var newTrigger = req.body;

    // early exits
    if (!newTrigger.namespace) return utils.sendError(method, 400, 'no namespace provided', res);
    if (!newTrigger.name) return utils.sendError(method, 400, 'no name provided', res);
    if (!newTrigger.cron) return utils.sendError(method, 400, 'no cron provided', res);

    // if the trigger creation request has not set the max trigger fire limit
    // we will set it here (default value can be updated in ./constants.js)
    if (!newTrigger.maxTriggers) {
        newTrigger.maxTriggers = utils.defaultTriggerFireLimit;
    }

    // if the user has set the trigger limit to -1 we will not enforce any limits on the number of times that a trigger
    // is fired
    if (newTrigger.maxTriggers === -1) {
    	utils.logger.info(tid, method, 'maxTriggers = -1, setting maximum trigger fire count to infinity');
    }

    if (!req.user.uuid) return utils.sendError(method, 400, 'no user uuid was detected', res);
    if (!req.user.key) return utils.sendError(method, 400, 'no user key was detected', res);
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
