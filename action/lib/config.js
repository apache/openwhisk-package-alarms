// Licensed to the Apache Software Foundation (ASF) under one or more contributor
// license agreements; and to You under the Apache License, Version 2.0.

function getOpenWhiskConfig(triggerData) {
    return {ignore_certs: true, namespace: triggerData.namespace, api_key: triggerData.apikey};
}

function addAdditionalData(params) {
    //insert code here to store additional trigger data in the database
    //for example, params.additionalData = {dateCreated: Date.now()};
}

module.exports = {
    'addAdditionalData': addAdditionalData,
    'getOpenWhiskConfig': getOpenWhiskConfig
};
