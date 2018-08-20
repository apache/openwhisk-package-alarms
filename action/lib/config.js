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
