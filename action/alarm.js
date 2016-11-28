var request = require('request');

function main(msg){
    console.log("alarm: ", msg);

    // whisk trigger in payload
    var trigger = parseQName(msg.triggerName);

    // for creation -> CREATE (default)
    // for deletion -> DELETE
    // for pause -> PAUSE
    // for resume -> RESUME
    var lifecycleEvent = msg.lifecycleEvent || 'CREATE';

    if (lifecycleEvent === 'CREATE'){
      // CREATE A PERIODIC PROVIDER INSTANCE AT PERIODIC NODE.JS AND GIVE THE NEWLY CREATED TRIGGER
      return new Promise(function(resolve, reject) {
        if(typeof msg.trigger_payload === 'string'){
            msg.trigger_payload = {payload: msg.trigger_payload};
        }

        var newTrigger = {
            name: trigger.name,
            namespace: trigger.namespace,
            cron: msg.cron,
            payload: msg.trigger_payload || {},
            maxTriggers: msg.maxTriggers || 1000000
        };

        request({
            method: "POST",
            uri: 'http://' + msg.package_endpoint + '/triggers',
            json: newTrigger,
            auth: {
                user: msg.authKey.split(':')[0],
                pass: msg.authKey.split(':')[1]
            }
        }, function(err, res, body) {
            console.log('alarm: done http request');
            if (!err && res.statusCode === 200) {
                console.log(body);
                resolve();
            }
            else {
                if(res) {
                    console.log('alarm: Error invoking whisk action:', res.statusCode, body);
                    reject(body);
                }
                else {
                    console.log('alarm: Error invoking whisk action:', err);
                    reject(err);
                }
            }
        });
      });
    }

    if (lifecycleEvent === 'DELETE'){
        // DELETE TRIGGER AT NODE.JS SERVICE
        return new Promise(function(resolve, reject) {
          request({
              method: "DELETE",
              uri: 'http://' + msg.package_endpoint + '/triggers/' + trigger.namespace + '/' + trigger.name,
              json: true,
              auth: {
                  user: msg.authKey.split(':')[0],
                  pass: msg.authKey.split(':')[1]
              }
          }, function(err, res, body) {
              console.log('alarm: done http request');
              if (!err && (res.statusCode === 200 || res.statusCode === 404)) {
                  console.log(body);
                  resolve();
              }
              else {
                  if(res) {
                      console.log('alarm: Error invoking whisk action:', res.statusCode, body);
                      reject(body);
                  }
                  else {
                      console.log('alarm: Error invoking whisk action:', err);
                      reject(err);
                  }
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
}
