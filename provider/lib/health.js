var si = require('systeminformation');

module.exports = function(utils) {

    // Health Endpoint
    this.endPoint = '/health';
    var stats = {triggerCount: Object.keys(utils.triggers).length};

    // Health Logic
    this.health = function (req, res) {

        // get all system stats in parallel
        Promise.all([
            si.mem(),
            si.currentLoad(),
            si.fsSize(),
            si.networkStats(),
            si.inetLatency(utils.routerHost)
        ])
        .then(results => {
            stats.memory = results[0];
            stats.cpu = results[1];
            stats.disk = results[2];
            stats.network = results[3];
            stats.apiHostLatency = results[4];
            res.send(stats);
        })
        .catch(error => {
            stats.error = error;
            res.send(stats);
        });
    };

};
