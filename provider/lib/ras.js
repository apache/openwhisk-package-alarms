// Licensed to the Apache Software Foundation (ASF) under one or more contributor
// license agreements; and to You under the Apache License, Version 2.0.

module.exports = function() {

  // Test Endpoint
  this.endPoint = '/ping';

  // Test Logic
  this.ras = function (req, res) {
      res.send({msg: 'pong'});
  };

};
