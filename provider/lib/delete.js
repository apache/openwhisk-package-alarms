var request = require('request');

module.exports = function(logger, utils) {

    // Test Endpoint
    this.endPoint = '/triggers/:namespace/:name';

    // Delete Logic
    this.delete = function (req, res) {

        var method = 'DELETE /triggers';

        //Check that user has access rights to delete a trigger
        var host = 'https://' + utils.routerHost +':'+ 443;
        var triggerURL = host + '/api/v1/namespaces/' + req.params.namespace + '/triggers/' + req.params.name;

        request({
            method: 'get',
            url: triggerURL,
            auth: {
                user: req.user.uuid,
                pass: req.user.key
            }
        }, function(error, response, body) {
            //delete from database if user is authenticated (200) or if trigger has already been deleted (404)
            if (!error && (response.statusCode === 200 || response.statusCode === 404)) {
                var deleted = utils.deleteTrigger(req.params.namespace, req.params.name, req.user.uuid + ':' + req.user.key);
                if (deleted) {
                    res.status(200).json({ok: 'trigger ' + req.params.name + ' successfully deleted'});
                }
                else {
                    res.status(404).json({error: 'trigger ' + req.params.name + ' not found'});
                }
            }
            else {
                var errorMsg = 'Trigger ' + req.params.name  + ' cannot be deleted.';
                logger.error(method, errorMsg, error);
                if (error) {
                    res.status(400).json({
                        message: errorMsg,
                        error: error.message
                    });
                }
                else {
                    var info = JSON.parse(body);
                    res.status(response.statusCode).json({
                        message: errorMsg,
                        error: info.error
                    });
                }
            }
        });
    };

};
