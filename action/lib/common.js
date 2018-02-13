const request = require('request');

function requestHelper(url, input, method) {

    return new Promise(function(resolve, reject) {

        var options = {
            method : method,
            url : url,
            json: true,
            rejectUnauthorized: false
        };

        if (method === 'get') {
            options.qs = input;
        } else {
            options.body = input;
        }

        request(options, function(error, response, body) {

            if (!error && response.statusCode === 200) {
                resolve(body);
            }
            else {
                if (response) {
                    console.log('alarm: Error invoking whisk action:', response.statusCode, body);
                    reject(body);
                }
                else {
                    console.log('alarm: Error invoking whisk action:', error);
                    reject(error);
                }
            }
        });
    });
}

function createWebParams(rawParams) {
    var namespace = process.env.__OW_NAMESPACE;
    var triggerName = '/' + namespace + '/' + parseQName(rawParams.triggerName).name;

    var webparams = Object.assign({}, rawParams);
    delete webparams.lifecycleEvent;
    delete webparams.apihost;

    webparams.triggerName = triggerName;

    return webparams;
}

function verifyTriggerAuth(triggerURL, authKey, isDelete) {
    var auth = authKey.split(':');

    return new Promise(function(resolve, reject) {

        request({
            method: 'get',
            url: triggerURL,
            auth: {
                user: auth[0],
                pass: auth[1]
            },
            rejectUnauthorized: false
        }, function(err, response) {
            if (err) {
                reject(sendError(400, 'Trigger authentication request failed.', err.message));
            }
            else if(response.statusCode >= 400 && !(isDelete && response.statusCode === 404)) {
                reject(sendError(response.statusCode, 'Trigger authentication request failed.'));
            }
            else {
                resolve();
            }
        });
    });
}

function parseQName(qname) {
    var parsed = {};
    var delimiter = '/';
    var defaultNamespace = '_';
    if (qname && qname.charAt(0) === delimiter) {
        var parts = qname.split(delimiter);
        parsed.namespace = parts[1];
        parsed.name = parts.length > 2 ? parts.slice(2).join(delimiter) : '';
    } else {
        parsed.namespace = defaultNamespace;
        parsed.name = qname;
    }
    return parsed;
}

function sendError(statusCode, error, message) {
    var params = {error: error};
    if (message) {
        params.message = message;
    }

    return {
        statusCode: statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: new Buffer(JSON.stringify(params)).toString('base64')
    };
}

function constructPayload(payload) {

    var updatedPayload;
    if (payload) {
        if (typeof payload === 'string') {
            updatedPayload = {payload: payload};
        }
        if (typeof payload === 'object') {
            updatedPayload = payload;
        }
    }
    return updatedPayload;
}


module.exports = {
    'requestHelper': requestHelper,
    'createWebParams': createWebParams,
    'verifyTriggerAuth': verifyTriggerAuth,
    'parseQName': parseQName,
    'sendError': sendError,
    'constructPayload': constructPayload
};
