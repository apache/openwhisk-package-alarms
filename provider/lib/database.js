module.exports = function() {

    var database = this;

    // init for DB object - a thin, promise-loving wrapper around nano / documentdb
    this.initDB = function(dbProtocol, dbUsername, dbPassword, dbHost, dbType, cosmosdbRootDatabase, cosmosdbMasterKey) {

        var dbType = typeof dbType  !== 'undefined' ?  dbType  : "couchdb";

        return new Promise((resolve, reject) => { 
            
            if(dbType === "couchdb") {
                console.log("using couchdb");
                var couchdb = require('./couchdb');
                var dbURL = dbProtocol + '://' + dbUsername + ':' + dbPassword + '@' + dbHost;
                var db = new couchdb(dbURL);
                database.utilsDB = db;
                resolve();
            } 
            else if(dbType === "cosmosdb") {
                console.log("using cosmosdb");
                var cosmosdb = require('./cosmosdb');
                var db = new cosmosdb(dbHost, cosmosdbMasterKey);
                db.init(cosmosdbRootDatabase)
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

    this.createDatabase = function(logger, dbName) {
        return database.utilsDB.createDatabase(logger, dbName);
    };
};
