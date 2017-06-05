module.exports = function(logger, providerUtils) {

  // Active Endpoint
  this.endPoint = '/active';

  this.active = function(req, res) {
      var method = 'active';
      var response = {};
      var active = providerUtils.active;

      if (req.query && req.query.active) {
          var query = req.query.active.toLowerCase();
          if (query !== 'true' && query !== 'false') {
              response.error = "Invalid query string";
          }
          else if (providerUtils.active !== query) {
              if (providerUtils.redisClient) {
                  active = 'swapping';
                  providerUtils.redisClient.publish(providerUtils.redisHash, "active swap");
                  var msg = 'Running swap to change active state';
                  logger.info(method, msg);
                  response.message = msg;
              }
              else {
                  providerUtils.active = active = query;
                  var message = 'The active state has been changed';
                  logger.info(method, message, 'to', active);
                  response.message = message;
              }
          }
      }
      response.active = active;
      response.worker = providerUtils.worker;
      response.host = providerUtils.host;
      res.send(response);
  };

};
