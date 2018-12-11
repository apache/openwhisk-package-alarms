// Licensed to the Apache Software Foundation (ASF) under one or more contributor
// license agreements; and to You under the Apache License, Version 2.0.

function handleAuth(triggerData, options) {

    var auth = triggerData.apikey.split(':');
    options.auth = {
        user: auth[0],
        pass: auth[1]
    };
    return Promise.resolve(options);
}

module.exports = {
    'handleAuth': handleAuth
};
