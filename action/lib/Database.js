const common = require('./common');

module.exports = function() {

    var database = this;

    // init for DB object - a thin, promise-loving wrapper around nano / documentdb
    this.initDB = function(dbURL, dbName, dbType, cosmosdbRootDatabase, cosmosdbMasterKey) {

        var dbType = typeof dbType  !== 'undefined' ?  dbType  : "couchdb";

        return new Promise((resolve, reject) => {
            
            if(dbType === "couchdb") {
                console.log("using couchdb");
                var couchdb = require('./couchdb');
                var db = new couchdb(dbURL, dbName);
                database.utilsDB = db;
                resolve();
            } 
            else if(dbType === "cosmosdb") {
                console.log("using cosmosdb");
                var cosmosdb = require('./cosmosdb');
                var db = new cosmosdb(dbURL, cosmosdbMasterKey);
                db.init(cosmosdbRootDatabase, dbName)
                    .then((res) => {
                        database.utilsDB = db;
                        resolve();
                    })
                    .catch((err) => {
                        reject(err)});
            }
            else  
                reject("No db type to initialize");
        });
    }
    

    this.getWorkerID = function(availabeWorkers) {
        return database.utilsDB.getWorkerID(availabeWorkers);
    };

    this.createTrigger = function(triggerID, newTrigger) {
        return database.utilsDB.createTrigger(triggerID, newTrigger);
    };

    this.getTrigger = function(triggerID, retry = true) {
        return database.utilsDB.getTrigger(triggerID, retry);
    };

    this.disableTrigger = function(triggerID, trigger, retryCount, crudMessage) {
        return database.utilsDB.disableTrigger(triggerID, trigger, retryCount, crudMessage);
    };

    this.deleteTrigger = function(triggerID, retryCount) {
        return database.utilsDB.deleteTrigger(triggerID, retryCount);
    };

    this.updateTrigger = function(triggerID, trigger, params, retryCount) {
        return database.utilsDB.updateTrigger(triggerID, trigger, params, retryCount);
    };
};
