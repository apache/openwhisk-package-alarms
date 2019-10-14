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

const Config = require('./config');

module.exports = function() {

    var database = this;

    // init for DB object - a thin, promise-loving wrapper around nano / documentdb
    this.initDB = function(config) {

        config.type = typeof config.type  !== 'undefined' ?  config.type  : "couchdb";
        var db = {};
        return new Promise((resolve, reject) => {
            if(config.type === "couchdb") {
                console.log("using couchdb");
                var couchdb = require('./couchdb');
                db = new couchdb(config.dburl, config.dbname);
                database.utilsDB = db;
                resolve();
            }
            else if(config.type === "cosmosdb") {
                console.log("using cosmosdb");
                var cosmosdb = require('./cosmosdb');
                db = new cosmosdb(config.dburl, config.masterkey);
                db.init(config.rootdb, config.dbname)
                .then((res) => {
                    database.utilsDB = db;
                    resolve();
                });
            }
            else
                reject("type must be couchdb or cosmosdb; found " + config.type);
        });
    };

    this.constructTriggerID = function(config, triggerData) {
        config.type = typeof config.type  !== 'undefined' ?  config.type  : "couchdb";
        var supportsSlash = config.type === "cosmosdb" ? false : true;
        return Config.constructTriggerID(triggerData, supportsSlash);
    };

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
