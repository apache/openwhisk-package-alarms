module.exports = function() {

  // Test Endpoint
  this.endPoint = '/ping';

  // Test Logic
  this.ras = function (req, res) {
      res.send({msg: 'pong'});
  };

};
