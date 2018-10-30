// Licensed to the Apache Software Foundation (ASF) under one or more contributor
// license agreements; and to You under the Apache License, Version 2.0.

const common = require('./lib/common');

function main(msg) {

    let eventMap = {
        CREATE: 'post',
        READ: 'get',
        UPDATE: 'put',
        DELETE: 'delete'
    };
    // for creation -> CREATE
    // for reading -> READ
    // for updating -> UPDATE
    // for deletion -> DELETE
    var lifecycleEvent = msg.lifecycleEvent;

    var endpoint = msg.apihost;
    var webparams = common.createWebParams(msg);

    var url = `https://${endpoint}/api/v1/web/whisk.system/alarmsWeb/alarmWebAction.http`;

    if (lifecycleEvent in eventMap) {
        var method = eventMap[lifecycleEvent];
        return common.requestHelper(url, webparams, method);
    } else {
        return Promise.reject('unsupported lifecycleEvent');
    }
}


exports.main = main;
