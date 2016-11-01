module.exports = function(tid, logger, providerUtils) {

  // Health Endpoint
  this.endPoint = '/health';

  // Health Logic
  this.health = function (req, res) {
      res.send({triggerCount: Object.keys(providerUtils.triggers).length});
  };
  
}