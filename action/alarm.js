var request = require('request');

function main(msg) {

    // for creation -> CREATE
    // for deletion -> DELETE
    var lifecycleEvent = msg.lifecycleEvent;

    var endpoint = msg.apihost;
    var webparams = createWebParams(msg);

    var url = `https://${endpoint}/api/v1/web/whisk.system/alarmsWeb/alarmWebAction.http`;

    if (lifecycleEvent !== 'CREATE' && lifecycleEvent !== 'DELETE') {
        return Promise.reject('lifecycleEvent must be CREATE or DELETE');
    }
    else {
        var method = lifecycleEvent === 'CREATE' ? 'put' : 'delete';
        return requestHelper(url, webparams, method);
    }
}

function requestHelper(url, input, method) {

    return new Promise(function(resolve, reject) {

        request({
            method : method,
            url : url,
            json: input,
            rejectUnauthorized: false
        }, function(error, response, body) {

            if (!error && response.statusCode === 200) {
                resolve();
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

exports.main = main;


