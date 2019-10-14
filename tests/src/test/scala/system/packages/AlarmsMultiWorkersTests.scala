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
package system.packages

import io.restassured.RestAssured
import io.restassured.config.SSLConfig
import io.restassured.http.ContentType
import common.TestUtils.DONTCARE_EXIT
import common._
import org.junit.runner.RunWith
import org.scalatest.junit.JUnitRunner
import org.scalatest.{FlatSpec, Matchers}
import spray.json.DefaultJsonProtocol._
import spray.json._
import org.apache.openwhisk.core.WhiskConfig
import org.apache.openwhisk.core.database.test.ExtendedCouchDbRestClient
import org.apache.openwhisk.utils.{JsHelpers, retry}

import scala.concurrent.Await
import scala.concurrent.duration.DurationInt


@RunWith(classOf[JUnitRunner])
class AlarmsMultiWorkersTests extends FlatSpec
    with Matchers
    with WskActorSystem
    with WskTestHelpers
    with StreamLogging {

    val wskprops = WskProps()
    val wsk = new Wsk
    val auth = WhiskProperties.getBasicAuth
    val user = auth.fst
    val password = auth.snd

    val dbProtocol = WhiskProperties.getProperty("db.protocol")
    val dbHost = WhiskProperties.getProperty("db.host")
    val dbPort = WhiskProperties.getProperty("db.port").toInt
    val dbUsername = WhiskProperties.getProperty("db.username")
    val dbPassword = WhiskProperties.getProperty("db.password")
    val dbPrefix = WhiskProperties.getProperty(WhiskConfig.dbPrefix)

    val webAction = "/whisk.system/alarmsWeb/alarmWebAction"
    val webActionURL = s"https://${wskprops.apihost}/api/v1/web${webAction}.http"

    behavior of "Alarms multi workers feed tests"

    it should "create triggers assigned to worker10 and worker11" in withAssetCleaner(WskProps()) {
        (wp, assetHelper) =>
            implicit val wskprops = wp // shadow global props and make implicit

            val worker10Trigger = s"worker10AlarmsTrigger-${System.currentTimeMillis}"
            val worker10Params = JsObject(
                "triggerName" -> JsString(worker10Trigger),
                "authKey" -> JsString(s"$user:$password"),
                "cron" -> "* * * * *".toJson,
                "workers" -> JsArray(JsString("worker10")))

            val worker11Trigger = s"worker11AlarmsTrigger-${System.currentTimeMillis}"
            val worker11Params = JsObject(
                "triggerName" -> JsString(worker11Trigger),
                "authKey" -> JsString(s"$user:$password"),
                "cron" -> "* * * * *".toJson,
                "workers" -> JsArray(JsString("worker10"), JsString("worker11")))

            try {
                wsk.trigger.create(worker10Trigger)

                //create trigger feed and assign to worker10
                makePostCallWithExpectedResult(worker10Params, 200)

                wsk.trigger.create(worker11Trigger)

                //create trigger feed and assign to worker10 or worker11
                //the one with the least assigned triggers will be chosen
                makePostCallWithExpectedResult(worker11Params, 200)

                val dbName = s"${dbPrefix}alarmservice"
                val client = new ExtendedCouchDbRestClient(dbProtocol, dbHost, dbPort, dbUsername, dbPassword, dbName)

                retry({
                    val result = Await.result(client.getAllDocs(includeDocs = Some(true)), 15.seconds)
                    result should be('right)
                    val documents = result.right.get
                    val worker1Doc = documents
                            .fields("rows")
                            .convertTo[List[JsObject]]
                            .filter(_.fields("id").convertTo[String].equals(s"$user:$password/_/$worker11Trigger"))

                    JsHelpers.getFieldPath(worker1Doc.head, "doc", "worker") shouldBe Some(JsString("worker11"))
                })
            } finally {
                //delete trigger feeds and triggers
                makeDeleteCallWithExpectedResult(worker10Params, DONTCARE_EXIT)
                makeDeleteCallWithExpectedResult(worker11Params, DONTCARE_EXIT)

                wsk.trigger.delete(worker10Trigger, expectedExitCode = DONTCARE_EXIT)
                wsk.trigger.delete(worker11Trigger, expectedExitCode = DONTCARE_EXIT)
            }
    }

    def makePostCallWithExpectedResult(params: JsObject, expectedCode: Int) = {
        val response = RestAssured.given()
                .contentType(ContentType.JSON)
                .config(RestAssured.config().sslConfig(new SSLConfig().relaxedHTTPSValidation()))
                .body(params.toString())
                .post(webActionURL)
        assert(response.statusCode() == expectedCode)
    }

    def makeDeleteCallWithExpectedResult(params: JsObject, expectedCode: Int) = {
        val response = RestAssured.given()
                .contentType(ContentType.JSON)
                .config(RestAssured.config().sslConfig(new SSLConfig().relaxedHTTPSValidation()))
                .body(params.toString())
                .delete(webActionURL)
        assert(expectedCode == DONTCARE_EXIT || response.statusCode() == expectedCode)
    }

}
