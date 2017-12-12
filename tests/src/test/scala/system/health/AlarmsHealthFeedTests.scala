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
package system.health

import java.time.{Clock, Instant}

import common._
import org.junit.runner.RunWith
import org.scalatest.junit.JUnitRunner
import org.scalatest.{FlatSpec, Inside}
import spray.json.DefaultJsonProtocol.{BooleanJsonFormat, IntJsonFormat, LongJsonFormat, StringJsonFormat}
import spray.json.{JsObject, JsString, pimpAny}

/**
 * Tests for alarms trigger service
 */
@RunWith(classOf[JUnitRunner])
class AlarmsHealthFeedTests
    extends FlatSpec
    with TestHelpers
    with Inside
    with WskTestHelpers {

    val wskprops = WskProps()
    val wsk = new Wsk


    val defaultAction = Some(TestUtils.getTestActionFilename("hello.js"))
    val defaultActionName = "hello"

    behavior of "Alarms Health tests"

    it should "bind alarm package and fire periodic trigger using cron feed" in withAssetCleaner(wskprops) {
        (wp, assetHelper) =>
            implicit val wskprops = wp // shadow global props and make implicit
            val triggerName = s"dummyAlarmsTrigger-${System.currentTimeMillis}"
            val ruleName = s"dummyAlarmsRule-${System.currentTimeMillis}"
            val packageName = "dummyAlarmsPackage"

            // the package alarms should be there
            val packageGetResult = wsk.pkg.get("/whisk.system/alarms")
            println("fetched package alarms")
            packageGetResult.stdout should include("ok")

            // create package binding
            assetHelper.withCleaner(wsk.pkg, packageName) {
                (pkg, name) => pkg.bind("/whisk.system/alarms", name)
            }

            println(s"Creating trigger: $triggerName")
            // create whisk stuff
            val feedCreationResult = assetHelper.withCleaner(wsk.trigger, triggerName) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/alarm"), parameters = Map(
                        "trigger_payload" -> "alarmTest".toJson,
                        "cron" -> "* * * * * *".toJson))
            }
            feedCreationResult.stdout should include("ok")

            assetHelper.withCleaner(wsk.action, defaultActionName) { (action, name) =>
                action.create(name, defaultAction)
            }
            assetHelper.withCleaner(wsk.rule, ruleName) { (rule, name) =>
                rule.create(name, trigger = triggerName, action = defaultActionName)
            }

            println("waiting for triggers")
            val activations = wsk.activation.pollFor(N = 5, Some(triggerName), retries = 30).length
            println(s"Found activation size (should be at least 5): $activations")
            activations should be >= 5

            // delete the whisk trigger, which must also delete the feed
            wsk.trigger.delete(triggerName)

            // get activation list after delete of the trigger
            val activationsAfterDelete = wsk.activation.pollFor(N = 100, Some(triggerName), retries = 30).length
            val now = Instant.now(Clock.systemUTC())
            println(s"Found activation size after delete ($now): $activationsAfterDelete")

            // recreate the trigger now without the feed
            wsk.trigger.create(triggerName)

            // get activation list again, should be same as before waiting
            println("confirming no new triggers")
            val activationsAfterWait = wsk.activation.pollFor(N = activationsAfterDelete + 1, Some(triggerName)).length
            println(s"Found activation size after wait: $activationsAfterWait")
            println("Activation list after wait should equal with activation list after delete")
            activationsAfterWait should be(activationsAfterDelete)
    }

    it should "fire an alarm once trigger when specifying a future date" in withAssetCleaner(wskprops) {
        (wp, assetHelper) =>
            implicit val wskprops = wp // shadow global props and make implicit
            val triggerName = s"dummyAlarmsTrigger-${System.currentTimeMillis}"
            val ruleName = s"dummyAlarmsRule-${System.currentTimeMillis}"
            val packageName = "dummyAlarmsPackage"

            // the package alarms should be there
            val packageGetResult = wsk.pkg.get("/whisk.system/alarms")
            println("fetched package alarms")
            packageGetResult.stdout should include("ok")

            // create package binding
            assetHelper.withCleaner(wsk.pkg, packageName) {
                (pkg, name) => pkg.bind("/whisk.system/alarms", name)
            }

            val futureDate = System.currentTimeMillis + (1000 * 20)

            // create whisk stuff
            println(s"Creating trigger: $triggerName")
            val feedCreationResult = assetHelper.withCleaner(wsk.trigger, triggerName) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/once"), parameters = Map(
                        "trigger_payload" -> "alarmTest".toJson,
                        "date" -> futureDate.toJson))
            }
            feedCreationResult.stdout should include("ok")

            assetHelper.withCleaner(wsk.action, defaultActionName) { (action, name) =>
                action.create(name, defaultAction)
            }
            assetHelper.withCleaner(wsk.rule, ruleName) { (rule, name) =>
                rule.create(name, trigger = triggerName, action = defaultActionName)
            }

            println("waiting for trigger")
            val activations = wsk.activation.pollFor(N = 1, Some(triggerName), retries = 90).length
            println(s"Found activation size (should be 1): $activations")
            activations should be(1)
    }

    it should "return correct status and configuration" in withAssetCleaner(wskprops) {
        val currentTime = s"${System.currentTimeMillis}"

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

            val triggerPayload = JsObject(
                "test" -> JsString("alarmsTest")
            )
            val cronString = "* * * * * *"
            val maxTriggers = -1

            // create whisk stuff
            val feedCreationResult = assetHelper.withCleaner(wsk.trigger, triggerName) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/alarm"), parameters = Map(
                        "trigger_payload" -> triggerPayload,
                        "cron" -> cronString.toJson))
            }
            feedCreationResult.stdout should include("ok")

            val actionName = s"$packageName/alarm"
            val run = wsk.action.invoke(actionName, parameters = Map(
                "triggerName" -> triggerName.toJson,
                "lifecycleEvent" -> "READ".toJson,
                "authKey" -> wskProps.authKey.toJson
            ))

            withActivation(wsk.activation, run) {
                activation =>
                    activation.response.success shouldBe true

                    inside (activation.response.result) {
                        case Some(result) =>
                            val config = result.getFields("config").head.asInstanceOf[JsObject].fields
                            val status = result.getFields("status").head.asInstanceOf[JsObject].fields

                            config should contain("name" -> triggerName.toJson)
                            config should contain("cron" -> cronString.toJson)
                            config should contain("payload" -> triggerPayload)
                            config should contain key "namespace"

                            status should contain("active" -> true.toJson)
                            status should contain key "dateChanged"
                            status should contain key "dateChangedISO"
                            status should not(contain key "reason")
                    }
            }

    }

    it should "fire cron trigger using startDate and stopDate" in withAssetCleaner(wskprops) {
        (wp, assetHelper) =>
            implicit val wskprops = wp // shadow global props and make implicit
            val triggerName = s"dummyAlarmsTrigger-${System.currentTimeMillis}"
            val ruleName = s"dummyAlarmsRule-${System.currentTimeMillis}"
            val packageName = "dummyAlarmsPackage"

            // the package alarms should be there
            val packageGetResult = wsk.pkg.get("/whisk.system/alarms")
            println("fetched package alarms")
            packageGetResult.stdout should include("ok")

            // create package binding
            assetHelper.withCleaner(wsk.pkg, packageName) {
                (pkg, name) => pkg.bind("/whisk.system/alarms", name)
            }

            val startDate = System.currentTimeMillis + (1000 * 20)
            val stopDate = startDate + (1000 * 10)

            println(s"Creating trigger: $triggerName")
            // create whisk stuff
            val feedCreationResult = assetHelper.withCleaner(wsk.trigger, triggerName) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/alarm"), parameters = Map(
                        "cron" -> "* * * * * *".toJson,
                        "startDate" -> startDate.toJson,
                        "stopDate" -> stopDate.toJson))
            }
            feedCreationResult.stdout should include("ok")

            assetHelper.withCleaner(wsk.action, defaultActionName) { (action, name) =>
                action.create(name, defaultAction)
            }
            assetHelper.withCleaner(wsk.rule, ruleName) { (rule, name) =>
                rule.create(name, trigger = triggerName, action = defaultActionName)
            }

            println("waiting for triggers")
            val activations = wsk.activation.pollFor(N = 20, Some(triggerName), retries = 60).length
            println(s"Found activation size (should be at least 5): $activations")
            activations should be >= 5


            // get activation list again, should be same as before waiting
            println("confirming no new triggers")
            val activationsAfterWait = wsk.activation.pollFor(N = activations + 1, Some(triggerName)).length
            println(s"Found activation size after wait: $activationsAfterWait")
            println("Activation list after wait should equal with activation list after stopDate")
            activationsAfterWait should be(activations)
    }

    it should "fire interval trigger using startDate and stopDate" in withAssetCleaner(wskprops) {
        (wp, assetHelper) =>
            implicit val wskprops = wp // shadow global props and make implicit
            val triggerName = s"dummyAlarmsTrigger-${System.currentTimeMillis}"
            val ruleName = s"dummyAlarmsRule-${System.currentTimeMillis}"
            val packageName = "dummyAlarmsPackage"

            // the package alarms should be there
            val packageGetResult = wsk.pkg.get("/whisk.system/alarms")
            println("fetched package alarms")
            packageGetResult.stdout should include("ok")

            // create package binding
            assetHelper.withCleaner(wsk.pkg, packageName) {
                (pkg, name) => pkg.bind("/whisk.system/alarms", name)
            }

            val startDate = System.currentTimeMillis + (1000 * 20)
            val stopDate = startDate + (1000 * 90)

            println(s"Creating trigger: $triggerName")
            // create whisk stuff
            val feedCreationResult = assetHelper.withCleaner(wsk.trigger, triggerName) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/interval"), parameters = Map(
                        "minutes" -> 1.toJson,
                        "startDate" -> startDate.toJson,
                        "stopDate" -> stopDate.toJson))
            }
            feedCreationResult.stdout should include("ok")

            assetHelper.withCleaner(wsk.action, defaultActionName) { (action, name) =>
                action.create(name, defaultAction)
            }
            assetHelper.withCleaner(wsk.rule, ruleName) { (rule, name) =>
                rule.create(name, trigger = triggerName, action = defaultActionName)
            }

            println("waiting for start date")
            val activations = wsk.activation.pollFor(N = 1, Some(triggerName), retries = 90).length
            println(s"Found activation size (should be 1): $activations")
            activations should be(1)

            println("waiting for interval")
            val activationsAfterInterval = wsk.activation.pollFor(N = 2, Some(triggerName), retries = 90).length
            println(s"Found activation size (should be 2): $activationsAfterInterval")
            activationsAfterInterval should be(2)
    }
}
