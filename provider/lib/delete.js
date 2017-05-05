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
                var triggerIdentifier = utils.getTriggerIdentifier(req.user.uuid + ':' + req.user.key, req.params.namespace, req.params.name);
                utils.deleteTrigger(triggerIdentifier)
                .then(message => {
                    res.status(200).json({ok: message});
                }).catch(message => {
                    res.status(400).json({error: message});
                });
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
                    var info;
                    try {
                        info = JSON.parse(body);
                    }
                    catch (e) {
                        info = 'Authentication request failed with status code ' + response.statusCode;
                    }
                    res.status(response.statusCode).json({
                        message: errorMsg,
                        error: typeof info === 'object' ? info.error : info
                    });
                }
            }
        });
    };

};
