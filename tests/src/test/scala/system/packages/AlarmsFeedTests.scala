/*
 * Copyright 2015-2016 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package system.packages

import org.junit.runner.RunWith
import org.scalatest.FlatSpec
import org.scalatest.junit.JUnitRunner

import common.TestHelpers
import common.Wsk
import common.WskProps
import common.WskTestHelpers
import spray.json.DefaultJsonProtocol.IntJsonFormat
import spray.json.DefaultJsonProtocol.StringJsonFormat
import spray.json.pimpAny

/**
 * Tests for alarms trigger service
 */
@RunWith(classOf[JUnitRunner])
class AlarmsFeedTests
    extends FlatSpec
    with TestHelpers
    with WskTestHelpers {

    val wskprops = WskProps()
    val wsk = new Wsk

    behavior of "Alarms trigger service"

    it should "fire periodic trigger using cron feed using _ namespace" in withAssetCleaner(WskProps()) {
        (wp, assetHelper) =>
        implicit val wskprops = wp // shadow global props and make implicit
        val triggerName = s"dummyAlarmsTrigger-${System.currentTimeMillis}"

        // the package alarms should be there
        val packageGetResult = wsk.pkg.get("/whisk.system/alarms")
        println("fetched package alarms")
        packageGetResult.stdout should include("ok")

        // create whisk stuff
        val feedCreationResult = assetHelper.withCleaner(wsk.trigger, triggerName) {
            (trigger, name) =>
            trigger.create(name, feed = Some("/whisk.system/alarms/alarm"), parameters = Map(
                    "trigger_payload" -> "alarmTest".toJson,
                    "cron" -> "* * * * * *".toJson,
                    "maxTriggers" -> 3.toJson))
        }
        feedCreationResult.stdout should include("ok")

        // get activation list of the trigger
        val activations = wsk.activation.pollFor(N = 4, Some(triggerName), retries = 15).length
        println(s"Found activation size: $activations")
        activations should be(3)
    }

    it should "should disable after reaching max triggers" in withAssetCleaner(wskprops) {
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
        val feedCreationResult = assetHelper.withCleaner(wsk.trigger, triggerName) {
            (trigger, name) =>
            trigger.create(name, feed = Some(s"$packageName/alarm"), parameters = Map(
                    "trigger_payload" -> "alarmTest".toJson,
                    "cron" -> "* * * * * *".toJson,
                    "maxTriggers" -> 3.toJson))
        }
        feedCreationResult.stdout should include("ok")

        // get activation list of the trigger
        val activations = wsk.activation.pollFor(N = 4, Some(triggerName)).length
        println(s"Found activation size: $activations")
        activations should be(3)
    }

}
