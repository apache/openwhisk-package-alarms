module.exports = function(endpoint, masterKey) {
    var DocumentClient = require('documentdb').DocumentClient;

    var client = new DocumentClient(endpoint, {masterKey: masterKey});

    this.client = client;
    var utilsDB = this;

    this.init = function(databaseName) {
        let querySpec = {
            query: 'SELECT * FROM root r WHERE r.id = @id',
            parameters: [{ name: '@id', value: databaseName }]
        };
        return new Promise((resolve, reject) => { 
        client.queryDatabases(querySpec).toArray((err, results) => {
            if(err) reject(err);

            console.log("cosmosdb client initialized successfully");
            utilsDB.dbLink = results[0]._self;
            resolve();
        });
        });
    }

    //get or create collection in cosmosdb terminology
    this.createDatabase = function(log, collectionName) {
        var method = 'createDatabase';
        let logger = log;
        logger.info(method, 'creating the trigger database');
        let querySpec = {
            query: 'SELECT * FROM root r WHERE r.id=@id',
            parameters: [{ name: '@id', value: collectionName }]
        };
        return new Promise((resolve, reject) => {
            client.queryCollections(utilsDB.dbLink, querySpec).toArray((err, results) => {
            if (err) reject(err)
              
            if (results.length === 0) {
                createDB(collectionName)
                    .then((col) => {
                        utilsDB.collectionLink = col._self;
                        resolve(utilsDB);
                    })
                    .catch((err) => reject(err));
            } else {
                utilsDB.collectionLink = results[0]._self;
                resolve(utilsDB);
            }
            });
        });
    };

       //create collection in cosmosdb terminology
    function createDB (collectionName) {
        var collectionDefinition = { id: collectionName };
        return new Promise((resolve, reject) => {
            client.createCollection(utilsDB.dbLink, collectionDefinition, function(err, collection) {
                if(err) reject(err);

                console.log("Created collection");
                utilsDB.collectionLink = collection._self;
                resolve(collection);
            });
        });
    }


    this.createTrigger = function(triggerID, newTrigger) {
        if(!newTrigger.id) {
            console.log("add id to doc");
            newTrigger.id = triggerID;
        }

        return new Promise(function(resolve, reject) {

            client.createDocument(utilsDB.collectionLink, newTrigger, function(err, document) {
            if(err) reject(err);
            
            console.log("created trigger " + triggerID);
            resolve();
        });
            
        });
    };

    this.getTrigger = function(triggerID) {
        return new Promise(function(resolve, reject) {
            let querySpec = {
                query: 'SELECT * FROM root r WHERE r.id = @id',
                parameters: [{ name: '@id', value: triggerID }]
            };

            client.queryDocuments(utilsDB.collectionLink, querySpec).toArray(function(err, results) {
            if (err) reject(err) 
                
           if(results.length == 0)
                resolve();
            else {
                console.log("Found Trigger " + triggerID);
                resolve(results[0]);
            }
            });
        });
    };

    this.disableTrigger = function(triggerID, trigger, retryCount, crudMessage) {
        if (retryCount === 0) {
            //check if it is already disabled
            if (trigger.status && trigger.status.active === false) {
                return Promise.resolve(triggerID);
            }

            var message = `Automatically disabled trigger while ${crudMessage}`;
            var status = {
                'active': false,
                'dateChanged': Date.now(),
                'reason': {'kind': 'AUTO', 'statusCode': undefined, 'message': message}
            };
            trigger.status = status;
        }

        return new Promise(function(resolve, reject) {

            
        });

    };

    this.deleteTrigger = function(triggerID) {

        return new Promise(function(resolve, reject) {
            utilsDB.getTrigger(triggerID)
                .then((doc) => {
                    client.deleteDocument(doc._self, function(err) {
                    if (err) reject(err)

                    console.log("Deleted Trigger " + triggerID);
                    resolve()
                    });
                })
                .catch((err) => { reject(err)})
           
        });
    };

    this.updateTrigger = function(triggerID, trigger, params, retryCount) {
        if (retryCount === 0) {
            for (var key in params) {
                trigger[key] = params[key];
            }
            var status = {
                'active': true,
                'dateChanged': Date.now()
            };
            trigger.status = status;
        }

        return new Promise(function(resolve, reject) {
            utilsDB.getTrigger(triggerID)
                .then((doc) => {
                    client.replaceDocument(doc._self, trigger, function(err, replaced) {
                    if (err) reject(err)

                    console.log("Updated Trigger " + triggerID);
                    resolve(replaced)
                    });
                })
                .catch((err) => { reject(err)})
        });
    };

};
