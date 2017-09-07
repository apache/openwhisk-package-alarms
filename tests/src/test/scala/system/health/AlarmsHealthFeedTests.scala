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

import common.{TestHelpers, Wsk, WskProps, WskTestHelpers}
import org.junit.runner.RunWith
import org.scalatest.FlatSpec
import org.scalatest.junit.JUnitRunner
import spray.json.DefaultJsonProtocol.{IntJsonFormat, StringJsonFormat}
import spray.json.pimpAny

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

    behavior of "Alarms Health tests"

    it should "bind alarm package and fire periodic trigger using cron feed" in withAssetCleaner(wskprops) {
        (wp, assetHelper) =>
            implicit val wskprops = wp // shadow global props and make implicit
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

            println(s"Creating trigger: $triggerName")
            // create whisk stuff
            val feedCreationResult = assetHelper.withCleaner(wsk.trigger, triggerName) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/alarm"), parameters = Map(
                        "trigger_payload" -> "alarmTest".toJson,
                        "cron" -> "* * * * * *".toJson))
            }
            feedCreationResult.stdout should include("ok")

            println("waiting for triggers")
            val activations = wsk.activation.pollFor(N = 5, Some(triggerName)).length
            println(s"Found activation size (should be at least 5): $activations")
            activations should be >= 5

            // delete the whisk trigger, which must also delete the feed
            wsk.trigger.delete(triggerName)

            // get activation list after delete of the trigger
            val activationsAfterDelete = wsk.activation.pollFor(N = 20, Some(triggerName), retries = 20).length
            val now = Instant.now(Clock.systemUTC())
            println(s"Found activation size after delete ($now): $activationsAfterDelete")

            // recreate the trigger now without the feed
            wsk.trigger.create(triggerName)

            // get activation list again, should be same as before sleeping
            println("confirming no new triggers")
            val activationsAfterWait = wsk.activation.pollFor(N = activationsAfterDelete + 1, Some(triggerName)).length
            println(s"Found activation size after wait: $activationsAfterWait")
            println("Activation list after wait should equal with activation list after delete")
            activationsAfterWait should be(activationsAfterDelete)
    }

    it should "should not fail when specifying triggers above 1 Million" in withAssetCleaner(wskprops) {
        (wp, assetHelper) =>
            implicit val wskprops = wp // shadow global props and make implicit
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

            // create whisk stuff
            println(s"Creating trigger: $triggerName")
            val feedCreationResult = assetHelper.withCleaner(wsk.trigger, triggerName) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/alarm"), parameters = Map(
                        "trigger_payload" -> "alarmTest".toJson,
                        "cron" -> "* * * * * *".toJson,
                        "maxTriggers" -> 100000000.toJson))
            }
            feedCreationResult.stdout should include("ok")
    }

    it should "should not deny trigger creation when choosing maxTriggers set to infinity (-1)" in withAssetCleaner(wskprops) {
        (wp, assetHelper) =>
            implicit val wskprops = wp // shadow global props and make implicit
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

            // create whisk stuff
            println(s"Creating trigger: $triggerName")
            val feedCreationResult = assetHelper.withCleaner(wsk.trigger, triggerName, confirmDelete = true) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/alarm"), parameters = Map(
                        "trigger_payload" -> "alarmTest".toJson,
                        "cron" -> "* * * * * *".toJson,
                        "maxTriggers" -> -1.toJson),
                expectedExitCode = 0)
            }
            feedCreationResult.stderr should not include("error")
    }
}
