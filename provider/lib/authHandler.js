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
