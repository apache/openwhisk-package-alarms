var si = require('systeminformation');

module.exports = function(utils) {

  // Health Endpoint
  this.endPoint = '/health';
  var stats = {triggerCount: Object.keys(utils.triggers).length};

  // Health Logic
  this.health = function (req, res) {
      si.mem()
      .then(data => {
          stats.memory = data;
          return si.currentLoad();
      })
      .then(data => {
          stats.cpu = data;
          return si.fsSize();
      })
      .then(data => {
          stats.disk = data;
          return si.networkStats();
      })
      .then(data => {
          stats.network = data;
          return si.inetLatency(utils.routerHost);
      })
      .then(data => {
          stats.apiHostLatency = data;
          res.send(stats);
      })
      .catch(error =>{
          stats.error = error;
          res.send(stats);
      });
  };

};
