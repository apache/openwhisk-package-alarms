module.exports = function(logger, providerUtils) {

  // Active Endpoint
  this.endPoint = '/active';

  this.active = function (req, res) {
      var method = 'active';
      var response = {};

      if (req.query && req.query.active) {
          var errorMessage = "Invalid query string";
          try {
              var active = JSON.parse(req.query.active);
              if (typeof active !== 'boolean') {
                  response.error = errorMessage;
              }
              else if (providerUtils.active !== active) {
                  var message = 'The active state has been changed';
                  logger.info(method, message, 'to', active);
                  providerUtils.active = active;
                  response.message = message;
              }
          }
          catch (e) {
              response.error = errorMessage;
          }
      }
      response.active = providerUtils.active;
      response.worker = providerUtils.worker;
      res.send(response);
  };

};
