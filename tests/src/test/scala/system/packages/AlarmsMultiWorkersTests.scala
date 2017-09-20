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

import com.jayway.restassured.RestAssured
import com.jayway.restassured.config.SSLConfig
import com.jayway.restassured.http.ContentType
import common._
import org.junit.runner.RunWith
import org.scalatest.junit.JUnitRunner
import org.scalatest.{FlatSpec, Matchers}
import spray.json.DefaultJsonProtocol.StringJsonFormat
import spray.json.DefaultJsonProtocol._
import spray.json.{pimpAny, _}
import whisk.core.database.test.DatabaseScriptTestUtils
import whisk.utils.JsHelpers


@RunWith(classOf[JUnitRunner])
class AlarmsMultiWorkersTests extends FlatSpec
    with Matchers
    with WskActorSystem
    with WskTestHelpers
    with StreamLogging
    with DatabaseScriptTestUtils {

    val wskprops = WskProps()
    val wsk = new Wsk
    val auth = WhiskProperties.getBasicAuth
    val user = auth.fst
    val password = auth.snd

    val webAction = "/whisk.system/alarmsWeb/alarmWebAction"
    val webActionURL = s"https://${wskprops.apihost}/api/v1/web${webAction}.http"

    behavior of "Alarms multi workers feed tests"

    it should "create triggers assigned to worker0 and worker1" in withAssetCleaner(WskProps()) {
        (wp, assetHelper) =>
            implicit val wskprops = wp // shadow global props and make implicit

            val worker0Trigger = s"dummyAlarmsTrigger-${System.currentTimeMillis}"
            val worker0Params = JsObject(
                "triggerName" -> JsString(worker0Trigger),
                "authKey" -> JsString(s"$user:$password"),
                "cron" -> "* * * * *".toJson,
                "workers" -> JsArray(JsString("worker0")))

            val worker1Trigger = s"dummyAlarmsTrigger-${System.currentTimeMillis}"
            val worker1Params = JsObject(
                "triggerName" -> JsString(worker1Trigger),
                "authKey" -> JsString(s"$user:$password"),
                "cron" -> "* * * * *".toJson,
                "workers" -> JsArray(JsString("worker0"), JsString("worker1")))

            try {
                wsk.trigger.create(worker0Trigger)

                //create trigger feed and assign to worker0
                makePutCallWithExpectedResult(worker0Params, 200)

                wsk.trigger.create(worker1Trigger)

                //create trigger feed and assign to worker0 or worker1
                //the one with the least assigned triggers will be chosen
                makePutCallWithExpectedResult(worker1Params, 200)

                val dbName = s"${dbPrefix}alarmservice"
                val documents = getAllDocs(dbName)

                val worker1Doc = documents
                        .fields("rows")
                        .convertTo[List[JsObject]]
                        .filter(_.fields("id").convertTo[String].equals(s"$user:$password/_/$worker1Trigger"))

                JsHelpers.getFieldPath(worker1Doc(0), "doc", "worker") shouldBe Some(JsString("worker1"))
            } finally {
                //delete triggers
                wsk.trigger.delete(worker0Trigger)
                wsk.trigger.delete(worker1Trigger)

                makeDeleteCallWithExpectedResult(worker0Params, 200)
                makeDeleteCallWithExpectedResult(worker1Params, 200)
            }
    }

    def makePutCallWithExpectedResult(params: JsObject, expectedCode: Int) = {
        val response = RestAssured.given()
                .contentType(ContentType.JSON)
                .config(RestAssured.config().sslConfig(new SSLConfig().relaxedHTTPSValidation()))
                .body(params.toString())
                .put(webActionURL)
        assert(response.statusCode() == expectedCode)
    }

    def makeDeleteCallWithExpectedResult(params: JsObject, expectedCode: Int) = {
        val response = RestAssured.given()
                .contentType(ContentType.JSON)
                .config(RestAssured.config().sslConfig(new SSLConfig().relaxedHTTPSValidation()))
                .body(params.toString())
                .delete(webActionURL)
        assert(response.statusCode() == expectedCode)
    }


}
