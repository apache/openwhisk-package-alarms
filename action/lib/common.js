// Licensed to the Apache Software Foundation (ASF) under one or more contributor
// license agreements; and to You under the Apache License, Version 2.0.

const request = require('request');
const openwhisk = require('openwhisk');
const config = require('./config');

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
    config.addAdditionalData(webparams);

    return webparams;
}

function verifyTriggerAuth(triggerData, isDelete) {
    var owConfig = config.getOpenWhiskConfig(triggerData);
    var ow = openwhisk(owConfig);

    return new Promise(function(resolve, reject) {
        ow.triggers.get(triggerData.name)
        .then(() => {
            resolve();
        })
        .catch(err => {
           if (err.statusCode) {
               var statusCode = err.statusCode;
               if (!(isDelete && statusCode === 404)) {
                   reject(sendError(statusCode, 'Trigger authentication request failed.'));
               }
               else {
                   resolve();
               }
           }
           else {
               reject(sendError(400, 'Trigger authentication request failed.', err.message));
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
        body: params
    };
}

function constructObject(data, isPayload) {
    var jsonObject;
    if (data) {
        if (typeof data === 'string') {
            if (isPayload) {
                jsonObject = {payload: data};
            }
            else {
                try {
                    jsonObject = JSON.parse(data);
                }
                catch (e) {
                    console.log('error parsing ' + data);
                }
            }
        }
        if (typeof data === 'object') {
            jsonObject = data;
        }
    }
    return jsonObject;
}


module.exports = {
    'requestHelper': requestHelper,
    'createWebParams': createWebParams,
    'verifyTriggerAuth': verifyTriggerAuth,
    'parseQName': parseQName,
    'sendError': sendError,
    'constructObject': constructObject
};
