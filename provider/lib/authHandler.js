// Licensed to the Apache Software Foundation (ASF) under one or more contributor
// license agreements; and to You under the Apache License, Version 2.0.

function handleAuth(triggerData) {

    var auth = triggerData.apikey.split(':');
    return Promise.resolve({
        user: auth[0],
        pass: auth[1]
    });

}

module.exports = {
    'handleAuth': handleAuth
};
