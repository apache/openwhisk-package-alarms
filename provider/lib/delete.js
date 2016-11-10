module.exports = function(tid, logger, utils) {

  // Test Endpoint
  this.endPoint = '/triggers/:namespace/:name';

  // Delete Logic
  this.delete = function (req, res) {

    var deleted = utils.deleteTrigger(req.params.namespace, req.params.name, req.user.uuid + ':' + req.user.key);
    if(deleted) {
        res.status(200).json({ok: 'trigger ' + req.params.name + ' successfully deleted'});
    }
    else {
        res.status(404).json({error: 'trigger ' + req.params.name + ' not found'});
    }

  };

};
