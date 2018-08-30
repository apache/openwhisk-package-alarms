var util = require('util');

module.exports = function(endpoint, masterKey) {
    var DocumentClient = require('documentdb').DocumentClient;

    var client = new DocumentClient(endpoint, {masterKey: masterKey});

    this.client = client;
    var utilsDB = this;

    this.init = function(databaseName, collectionName) {
        let querySpec = {
            query: 'SELECT * FROM root r WHERE r.id = @id',
            parameters: [{ name: '@id', value: databaseName }]
        };
        return new Promise((resolve, reject) => { 
        client.queryDatabases(querySpec).toArray((err, results) => {
            if(err) reject(err);

            console.log("cosmosdb client initialized successfully");
            utilsDB.dbLink = results[0]._self;
            utilsDB.getDatabase(collectionName)
                .then((col) => {
                    console.log("got database");
                    resolve();
                })
                .catch((err) => { reject(err)})
        });
        });
    }

    //get collection in cosmosdb terminology
    this.getDatabase = function(collectionName) {
        let querySpec = {
            query: 'SELECT * FROM root r WHERE r.id=@id',
            parameters: [{ name: '@id', value: collectionName }]
        };
        return new Promise((resolve, reject) => {
            client.queryCollections(utilsDB.dbLink, querySpec).toArray((err, results) => {
            if (err) reject(err)
              
            if (results.length === 0) {
                console.log("No valid collection. Create One");
                utilsDB.createDatabase(collectionName)
                    .then((col) => {
                        utilsDB.collectionLink = col._self;
                        resolve(col);
                    })
                    .catch((err) => reject(err));
            } else {
                console.log("Found valid collection");
                utilsDB.collectionLink = results[0]._self;
                resolve(results);
            }
            });
        });
    }

    //create collection in cosmosdb terminology
    this.createDatabase = function(collectionName) {
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

    this.getWorkerID = function(availabeWorkers) {

        return new Promise((resolve, reject) => {
            //TODO need to get details how worker ID is assigned
        });
    };

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
