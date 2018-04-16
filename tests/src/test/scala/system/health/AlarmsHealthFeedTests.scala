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

import common._
import org.junit.runner.RunWith
import org.scalatest.FlatSpec
import org.scalatest.junit.JUnitRunner
import spray.json.DefaultJsonProtocol._
import spray.json._

/**
 * Tests for alarms trigger service
 */
@RunWith(classOf[JUnitRunner])
class AlarmsHealthFeedTests
    extends FlatSpec
    with TestHelpers
    with WskTestHelpers {

    val wskprops = WskProps()
    val wsk = new Wsk
    val defaultAction = Some(TestUtils.getTestActionFilename("hello.js"))
    val maxRetries = System.getProperty("max.retries", "100").toInt

    behavior of "Alarms Health tests"

    it should "fire an alarm once trigger when specifying a future date" in withAssetCleaner(wskprops) {
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

            //create action
            assetHelper.withCleaner(wsk.action, actionName) {
                (action, name) => action.create(name, defaultAction)
            }

            val futureDate = System.currentTimeMillis + (1000 * 30)

            // create trigger feed
            println(s"Creating trigger: $triggerName")
            assetHelper.withCleaner(wsk.trigger, triggerName) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/once"), parameters = Map(
                        "trigger_payload" -> "alarmTest".toJson,
                        "date" -> futureDate.toJson,
                        "deleteAfterFire" -> "rules".toJson))
            }

            // create rule
            assetHelper.withCleaner(wsk.rule, ruleName) {
                (rule, name) => rule.create(name, trigger = triggerName, action = actionName)
            }

            println("waiting for trigger")
            val activations = wsk.activation.pollFor(N = 1, Some(triggerName), retries = maxRetries).length
            println(s"Found activation size (should be 1): $activations")
            activations should be(1)

            // get activation list again, should be same as before waiting
            println("confirming no new triggers")
            val afterWait = wsk.activation.pollFor(N = activations + 1, Some(triggerName), retries = 30).length
            println(s"Found activation size after wait: $afterWait")
            println("Activation list after wait should equal with activation list after firing once")
            afterWait should be(activations)

            //check that assets had been deleted by verifying we can recreate them
            wsk.trigger.create(triggerName)
            wsk.rule.create(ruleName, triggerName, actionName)
    }

    it should "fire cron trigger using startDate and stopDate" in withAssetCleaner(wskprops) {
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
            assetHelper.withCleaner(wsk.action, actionName) {
                (action, name) => action.create(name, defaultAction)
            }

            val startDate = System.currentTimeMillis + (1000 * 30)
            val stopDate = startDate + (1000 * 100)

            // create trigger feed
            println(s"Creating trigger: $triggerName")
            assetHelper.withCleaner(wsk.trigger, triggerName) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/alarm"), parameters = Map(
                        "cron" -> "* * * * *".toJson,
                        "startDate" -> startDate.toJson,
                        "stopDate" -> stopDate.toJson))
            }

            // create rule
            assetHelper.withCleaner(wsk.rule, ruleName) {
                (rule, name) => rule.create(name, trigger = triggerName, action = actionName)
            }

            println("waiting for triggers")
            val activations = wsk.activation.pollFor(N = 1, Some(triggerName), retries = maxRetries).length
            println(s"Found activation size (should be 1): $activations")
            activations should be(1)
    }

    it should "fire interval trigger using startDate and stopDate" in withAssetCleaner(wskprops) {
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
            assetHelper.withCleaner(wsk.action, actionName) {
                (action, name) => action.create(name, defaultAction)
            }

            val startDate = System.currentTimeMillis + (1000 * 30)
            val stopDate = startDate + (1000 * 100)

            // create trigger feed
            println(s"Creating trigger: $triggerName")
            assetHelper.withCleaner(wsk.trigger, triggerName) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/interval"), parameters = Map(
                        "minutes" -> 1.toJson,
                        "startDate" -> startDate.toJson,
                        "stopDate" -> stopDate.toJson))
            }

            // create rule
            assetHelper.withCleaner(wsk.rule, ruleName) {
                (rule, name) => rule.create(name, trigger = triggerName, action = actionName)
            }

            println("waiting for start date")
            val activations = wsk.activation.pollFor(N = 1, Some(triggerName), retries = maxRetries).length
            println(s"Found activation size (should be 1): $activations")
            activations should be(1)

            println("waiting for interval")
            val activationsAfterInterval = wsk.activation.pollFor(N = 2, Some(triggerName), retries = maxRetries).length
            println(s"Found activation size (should be 2): $activationsAfterInterval")
            activationsAfterInterval should be(2)
    }

}
