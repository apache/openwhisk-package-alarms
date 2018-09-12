/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

module.exports = function() {

    var database = this;

    // init for DB object - a thin, promise-loving wrapper around nano / documentdb
    this.initDB = function(dbProtocol, dbUsername, dbPassword, dbHost, dbType, cosmosdbRootDatabase, cosmosdbMasterKey) {

        dbType = typeof dbType  !== 'undefined' ?  dbType  : "couchdb";
        var db = {};
        return new Promise((resolve, reject) => {

            if(dbType === "couchdb") {
                console.log("using couchdb");
                var couchdb = require('./couchdb');
                var dbURL = dbProtocol + '://' + dbUsername + ':' + dbPassword + '@' + dbHost;
                db = new couchdb(dbURL);
                database.utilsDB = db;
                resolve();
            }
            else if(dbType === "cosmosdb") {
                console.log("using cosmosdb");
                var cosmosdb = require('./cosmosdb');
                db = new cosmosdb(dbHost, cosmosdbMasterKey);
                db.init(cosmosdbRootDatabase)
                    .then((res) => {
                        database.utilsDB = db;
                        resolve();
                    })
                    .catch((err) => {
                        reject(err);});
            }
            else
                reject("No db type to initialize");
        });
    };

    this.createDatabase = function(logger, dbName) {
        return database.utilsDB.createDatabase(logger, dbName);
    };
};
