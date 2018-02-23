module.exports = function(logger, utils) {

  // Active Endpoint
  this.endPoint = '/active';

  var hostMachine = process.env.HOST_MACHINE;

  this.active = function(req, res) {
      var method = 'active';

      var response = {
          worker: utils.worker,
          host: utils.host,
          hostMachine: hostMachine,
          active: utils.host === utils.activeHost
      };

      if (req.query && req.query.active) {
          var query = req.query.active.toLowerCase();

          if (query !== 'true' && query !== 'false') {
              response.error = "Invalid query string";
              res.send(response);
              return;
          }

          var redundantHost = utils.host === 'host0' ? 'host1' : 'host0';
          var activeHost = query === 'true' ? utils.host : redundantHost;
          if (utils.activeHost !== activeHost) {
              if (utils.redisClient) {
                  utils.redisClient.hsetAsync(utils.redisHash, utils.redisKey, activeHost)
                  .then(() => {
                      response.active = 'swapping';
                      utils.redisClient.publish(utils.redisHash, activeHost);
                      logger.info(method, 'Active host swap in progress');
                      res.send(response);
                  })
                  .catch(err => {
                      response.error = err;
                      res.send(response);
                  });
              }
              else {
                  response.active = utils.host === activeHost;
                  utils.activeHost = activeHost;
                  var message = 'The active state has changed';
                  logger.info(method, message, 'to', activeHost);
                  response.message = message;
                  res.send(response);
              }
          }
          else {
              res.send(response);
          }
      }
      else {
          res.send(response);
      }
  };

};
