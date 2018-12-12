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

import common._
import org.junit.runner.RunWith
import org.scalatest.{FlatSpec, Inside}
import org.scalatest.junit.JUnitRunner
import spray.json.DefaultJsonProtocol._
import spray.json._

/**
 * Tests for alarms trigger service
 */
@RunWith(classOf[JUnitRunner])
class AlarmsFeedTests
    extends FlatSpec
    with Inside
    with TestHelpers
    with WskTestHelpers {

    val wskprops = WskProps()
    val wsk = new Wsk
    val defaultAction = Some(TestUtils.getTestActionFilename("hello.js"))
    val maxRetries = System.getProperty("max.retries", "100").toInt

    behavior of "Alarms trigger service"

    it should "disable after reaching max triggers" in withAssetCleaner(wskprops) {
        (wp, assetHelper) =>
            implicit val wskprops = wp // shadow global props and make implicit
            val triggerName = s"dummyAlarmsTrigger-${System.currentTimeMillis}"
            val ruleName = s"dummyAlarmsRule-${System.currentTimeMillis}"
            val actionName = s"dummyAlarmsAction-${System.currentTimeMillis}"
            val packageName = "dummyAlarmsPackage"

            // the package alarms should be there
            val packageGetResult = wsk.pkg.get("/whisk.system/alarms")
            println("fetched package alarms")
            packageGetResult.stdout should include("ok")

            // create package binding
            assetHelper.withCleaner(wsk.pkg, packageName) {
                (pkg, name) => pkg.bind("/whisk.system/alarms", name)
            }

            // create action
            assetHelper.withCleaner(wsk.action, actionName) { (action, name) =>
                action.create(name, defaultAction)
            }

            // create trigger with feed
            assetHelper.withCleaner(wsk.trigger, triggerName) {
                (trigger, name) =>
                trigger.create(name, feed = Some(s"$packageName/alarm"), parameters = Map(
                    "trigger_payload" -> "alarmTest".toJson,
                    "cron" -> "* * * * *".toJson,
                    "maxTriggers" -> 1.toJson))
            }

            // create rule
            assetHelper.withCleaner(wsk.rule, ruleName) { (rule, name) =>
                rule.create(name, trigger = triggerName, action = actionName)
            }

            // get activation list of the trigger
            val activations = wsk.activation.pollFor(N = 2, Some(triggerName), retries = maxRetries).length
            println(s"Found activation size: $activations")
            activations should be(1)
    }

    it should "update cron, timezone, startDate and stopDate parameters" in withAssetCleaner(wskprops) {
        (wp, assetHelper) =>
            implicit val wskProps = wp
            val triggerName = s"dummyAlarmsTrigger-${System.currentTimeMillis}"
            val packageName = "dummyAlarmsPackage"

            // the package alarms should be there
            val packageGetResult = wsk.pkg.get("/whisk.system/alarms")
            println("fetched package alarms")
            packageGetResult.stdout should include("ok")

            // create package binding
            assetHelper.withCleaner(wsk.pkg, packageName) {
                (pkg, name) => pkg.bind("/whisk.system/alarms", name)
            }

            val cron = "* * * * *"
            val startDate = System.currentTimeMillis + (1000 * 30)
            val stopDate = startDate + (1000 * 100)
            val timezone = "America/New_York"

            // create trigger feed
            println(s"Creating trigger: $triggerName")
            assetHelper.withCleaner(wsk.trigger, triggerName) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/alarm"), parameters = Map(
                        "cron" -> cron.toJson,
                        "startDate" -> startDate.toJson,
                        "stopDate" -> stopDate.toJson,
                        "timezone" -> timezone.toJson))
            }

            val actionName = s"$packageName/alarm"
            val readRunResult = wsk.action.invoke(actionName, parameters = Map(
                "triggerName" -> triggerName.toJson,
                "lifecycleEvent" -> "READ".toJson,
                "authKey" -> wskProps.authKey.toJson
            ))

            withActivation(wsk.activation, readRunResult) {
                activation => activation.response.success shouldBe true

                    inside(activation.response.result) {
                        case Some(result) =>
                            val config = result.getFields("config").head.asInstanceOf[JsObject].fields
                            val status = result.getFields("status").head.asInstanceOf[JsObject].fields

                            config should contain("cron" -> cron.toJson)
                            config should contain("startDate" -> startDate.toJson)
                            config should contain("stopDate" -> stopDate.toJson)
                            config should contain("timezone" -> timezone.toJson)

                            status should contain("active" -> true.toJson)
                            status should contain key "dateChanged"
                            status should contain key "dateChangedISO"
                            status should not(contain key "reason")
                    }
            }

            val updatedCron = "*/2 * * * *"
            val updatedStartDate = System.currentTimeMillis + (1000 * 30)
            val updatedStopDate = updatedStartDate + (1000 * 100)
            val updatedTimezone = "America/Los_Angeles"

            val updateRunAction = wsk.action.invoke(actionName, parameters = Map(
                "triggerName" -> triggerName.toJson,
                "lifecycleEvent" -> "UPDATE".toJson,
                "authKey" -> wskProps.authKey.toJson,
                "cron" -> updatedCron.toJson,
                "startDate" -> updatedStartDate.toJson,
                "stopDate" -> updatedStopDate.toJson,
                "timezone" -> updatedTimezone.toJson
            ))

            withActivation(wsk.activation, updateRunAction) {
                activation => activation.response.success shouldBe true
            }

            val runResult = wsk.action.invoke(actionName, parameters = Map(
                "triggerName" -> triggerName.toJson,
                "lifecycleEvent" -> "READ".toJson,
                "authKey" -> wskProps.authKey.toJson
            ))

            withActivation(wsk.activation, runResult) {
                activation => activation.response.success shouldBe true

                    inside(activation.response.result) {
                        case Some(result) =>
                            val config = result.getFields("config").head.asInstanceOf[JsObject].fields

                            config should contain("cron" -> updatedCron.toJson)
                            config should contain("timezone" -> updatedTimezone.toJson)
                            config should contain("startDate" -> updatedStartDate.toJson)
                            config should contain("stopDate" -> updatedStopDate.toJson)
                    }
            }
    }

    it should "update fireOnce and payload parameters" in withAssetCleaner(wskprops) {
        (wp, assetHelper) =>
            implicit val wskProps = wp
            val triggerName = s"dummyAlarmsTrigger-${System.currentTimeMillis}"
            val packageName = "dummyAlarmsPackage"

            // the package alarms should be there
            val packageGetResult = wsk.pkg.get("/whisk.system/alarms")
            println("fetched package alarms")
            packageGetResult.stdout should include("ok")

            // create package binding
            assetHelper.withCleaner(wsk.pkg, packageName) {
                (pkg, name) => pkg.bind("/whisk.system/alarms", name)
            }

            val futureDate = System.currentTimeMillis + (1000 * 30)
            val payload = JsObject(
                "test" -> JsString("alarmsTest")
            )

            // create trigger feed
            println(s"Creating trigger: $triggerName")
            assetHelper.withCleaner(wsk.trigger, triggerName, confirmDelete = false) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/once"), parameters = Map(
                        "trigger_payload" -> payload,
                        "date" -> futureDate.toJson,
                        "deleteAfterFire" -> "true".toJson))
            }

            val actionName = s"$packageName/alarm"
            val readRunResult = wsk.action.invoke(actionName, parameters = Map(
                "triggerName" -> triggerName.toJson,
                "lifecycleEvent" -> "READ".toJson,
                "authKey" -> wskProps.authKey.toJson
            ))

            withActivation(wsk.activation, readRunResult) {
                activation => activation.response.success shouldBe true

                    inside(activation.response.result) {
                        case Some(result) =>
                            val config = result.getFields("config").head.asInstanceOf[JsObject].fields

                            config should contain("date" -> futureDate.toJson)
                            config should contain("payload" -> payload)
                            config should contain("deleteAfterFire" -> "true".toJson)
                    }
            }

            val updatedFutureDate = System.currentTimeMillis + (1000 * 30)
            val updatedPayload = JsObject(
                "update_test" -> JsString("alarmsTest")
            )

            val updateRunAction = wsk.action.invoke(actionName, parameters = Map(
                "triggerName" -> triggerName.toJson,
                "lifecycleEvent" -> "UPDATE".toJson,
                "authKey" -> wskProps.authKey.toJson,
                "trigger_payload" ->updatedPayload,
                "date" -> updatedFutureDate.toJson,
                "deleteAfterFire" -> "rules".toJson
            ))

            withActivation(wsk.activation, updateRunAction) {
                activation => activation.response.success shouldBe true
            }

            val runResult = wsk.action.invoke(actionName, parameters = Map(
                "triggerName" -> triggerName.toJson,
                "lifecycleEvent" -> "READ".toJson,
                "authKey" -> wskProps.authKey.toJson
            ))

            withActivation(wsk.activation, runResult) {
                activation => activation.response.success shouldBe true

                    inside(activation.response.result) {
                        case Some(result) =>
                            val config = result.getFields("config").head.asInstanceOf[JsObject].fields

                            config should contain("date" -> updatedFutureDate.toJson)
                            config should contain("payload" -> updatedPayload)
                            config should contain("deleteAfterFire" -> "rules".toJson)
                    }
            }
    }

    it should "update minutes parameter for interval feed" in withAssetCleaner(wskprops) {
        (wp, assetHelper) =>
            implicit val wskProps = wp
            val triggerName = s"dummyAlarmsTrigger-${System.currentTimeMillis}"
            val packageName = "dummyAlarmsPackage"

            // the package alarms should be there
            val packageGetResult = wsk.pkg.get("/whisk.system/alarms")
            println("fetched package alarms")
            packageGetResult.stdout should include("ok")

            // create package binding
            assetHelper.withCleaner(wsk.pkg, packageName) {
                (pkg, name) => pkg.bind("/whisk.system/alarms", name)
            }

            val minutes = 1
            val startDate = System.currentTimeMillis + (1000 * 30)
            val stopDate = startDate + (1000 * 100)

            // create trigger feed
            println(s"Creating trigger: $triggerName")
            assetHelper.withCleaner(wsk.trigger, triggerName) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/interval"), parameters = Map(
                        "minutes" -> minutes.toJson,
                        "startDate" -> startDate.toJson,
                        "stopDate" -> stopDate.toJson))
            }


            val actionName = s"$packageName/alarm"
            val readRunResult = wsk.action.invoke(actionName, parameters = Map(
                "triggerName" -> triggerName.toJson,
                "lifecycleEvent" -> "READ".toJson,
                "authKey" -> wskProps.authKey.toJson
            ))

            withActivation(wsk.activation, readRunResult) {
                activation => activation.response.success shouldBe true

                    inside(activation.response.result) {
                        case Some(result) =>
                            val config = result.getFields("config").head.asInstanceOf[JsObject].fields

                            config should contain("minutes" -> minutes.toJson)
                            config should contain("startDate" -> startDate.toJson)
                            config should contain("stopDate" -> stopDate.toJson)
                    }
            }

            val updatedMinutes = 2
            val updatedStartDate = System.currentTimeMillis + (1000 * 30)
            val updatedStopDate = updatedStartDate + (1000 * 100)

            val updateRunAction = wsk.action.invoke(actionName, parameters = Map(
                "triggerName" -> triggerName.toJson,
                "lifecycleEvent" -> "UPDATE".toJson,
                "authKey" -> wskProps.authKey.toJson,
                "minutes" -> updatedMinutes.toJson,
                "startDate" -> updatedStartDate.toJson,
                "stopDate" -> updatedStopDate.toJson
            ))

            withActivation(wsk.activation, updateRunAction) {
                activation => activation.response.success shouldBe true
            }

            val runResult = wsk.action.invoke(actionName, parameters = Map(
                "triggerName" -> triggerName.toJson,
                "lifecycleEvent" -> "READ".toJson,
                "authKey" -> wskProps.authKey.toJson
            ))

            withActivation(wsk.activation, runResult) {
                activation => activation.response.success shouldBe true

                    inside(activation.response.result) {
                        case Some(result) =>
                            val config = result.getFields("config").head.asInstanceOf[JsObject].fields

                            config should contain("minutes" -> updatedMinutes.toJson)
                            config should contain("startDate" -> updatedStartDate.toJson)
                            config should contain("stopDate" -> updatedStopDate.toJson)
                    }
            }
    }
}
