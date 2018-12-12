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
import org.scalatest.FlatSpec
import org.scalatest.junit.JUnitRunner
import spray.json.DefaultJsonProtocol._
import spray.json._

/**
 * Tests for alarms trigger service
 */
@RunWith(classOf[JUnitRunner])
class AlarmsFeedNegativeTests
    extends FlatSpec
    with TestHelpers
    with WskTestHelpers {

    val wskprops = WskProps()
    val wsk = new Wsk

    val defaultAction = Some(TestUtils.getTestActionFilename("hello.js"))

    behavior of "Alarms feed negative tests"

    it should "return error message when alarm action does not include cron parameter" in withAssetCleaner(wskprops) {
        (wp, assetHelper) =>
            implicit val wskprops = wp // shadow global props and make implicit
            val triggerName = s"dummyAlarmsTrigger-${System.currentTimeMillis}"
            val packageName = "dummyAlarmsPackage"
            val feed = "alarm"

            // the package alarms should be there
            val packageGetResult = wsk.pkg.get("/whisk.system/alarms")
            println("fetched package alarms")
            packageGetResult.stdout should include("ok")

            // create package binding
            assetHelper.withCleaner(wsk.pkg, packageName) {
                (pkg, name) => pkg.bind("/whisk.system/alarms", name)
            }

            // create trigger with feed
            val feedCreationResult = assetHelper.withCleaner(wsk.trigger, triggerName, confirmDelete = false) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/$feed"), parameters = Map(
                        "trigger_payload" -> "alarmTest".toJson),
                        expectedExitCode = 246)
            }
            feedCreationResult.stderr should include("alarms trigger feed is missing the cron parameter")

    }

    it should "return error message when alarms once action does not include date parameter" in withAssetCleaner(wskprops) {
        (wp, assetHelper) =>
            implicit val wskprops = wp // shadow global props and make implicit
            val triggerName = s"dummyAlarmsTrigger-${System.currentTimeMillis}"
            val packageName = "dummyAlarmsPackage"
            val feed = "once"

            // the package alarms should be there
            val packageGetResult = wsk.pkg.get("/whisk.system/alarms")
            println("fetched package alarms")
            packageGetResult.stdout should include("ok")

            // create package binding
            assetHelper.withCleaner(wsk.pkg, packageName) {
                (pkg, name) => pkg.bind("/whisk.system/alarms", name)
            }

            // create trigger with feed
            val feedCreationResult = assetHelper.withCleaner(wsk.trigger, triggerName, confirmDelete = false) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/$feed"), parameters = Map(
                        "trigger_payload" -> "alarmTest".toJson),
                        expectedExitCode = 246)
            }
            feedCreationResult.stderr should include("alarms once trigger feed is missing the date parameter")

    }

    it should "return error message when alarm action includes invalid cron parameter" in withAssetCleaner(wskprops) {
        (wp, assetHelper) =>
            implicit val wskprops = wp // shadow global props and make implicit
            val triggerName = s"dummyAlarmsTrigger-${System.currentTimeMillis}"
            val packageName = "dummyAlarmsPackage"
            val feed = "alarm"

            // the package alarms should be there
            val packageGetResult = wsk.pkg.get("/whisk.system/alarms")
            println("fetched package alarms")
            packageGetResult.stdout should include("ok")

            // create package binding
            assetHelper.withCleaner(wsk.pkg, packageName) {
                (pkg, name) => pkg.bind("/whisk.system/alarms", name)
            }

            val cron = System.currentTimeMillis

            // create trigger with feed
            val feedCreationResult = assetHelper.withCleaner(wsk.trigger, triggerName, confirmDelete = false) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/$feed"), parameters = Map(
                        "trigger_payload" -> "alarmTest".toJson,
                        "cron" -> cron.toJson),
                        expectedExitCode = 246)
            }
            feedCreationResult.stderr should include(s"cron pattern '${cron}' is not valid")

    }

    it should "return error message when alarm action includes invalid timezone parameter" in withAssetCleaner(wskprops) {
        (wp, assetHelper) =>
            implicit val wskprops = wp // shadow global props and make implicit
            val triggerName = s"dummyAlarmsTrigger-${System.currentTimeMillis}"
            val packageName = "dummyAlarmsPackage"
            val feed = "alarm"

            // the package alarms should be there
            val packageGetResult = wsk.pkg.get("/whisk.system/alarms")
            println("fetched package alarms")
            packageGetResult.stdout should include("ok")

            // create package binding
            assetHelper.withCleaner(wsk.pkg, packageName) {
                (pkg, name) => pkg.bind("/whisk.system/alarms", name)
            }

            // create trigger with feed
            val feedCreationResult = assetHelper.withCleaner(wsk.trigger, triggerName, confirmDelete = false) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/$feed"), parameters = Map(
                        "trigger_payload" -> "alarmTest".toJson,
                        "cron" -> "* * * * *".toJson,
                        "timezone" -> "America/RTP".toJson),
                        expectedExitCode = 246)
            }
            feedCreationResult.stderr should include("Invalid timezone.")

    }

    it should "return error message when alarms once action includes an invalid date parameter" in withAssetCleaner(wskprops) {
        (wp, assetHelper) =>
            implicit val wskprops = wp // shadow global props and make implicit
            val triggerName = s"dummyAlarmsTrigger-${System.currentTimeMillis}"
            val packageName = "dummyAlarmsPackage"
            val feed = "once"

            // the package alarms should be there
            val packageGetResult = wsk.pkg.get("/whisk.system/alarms")
            println("fetched package alarms")
            packageGetResult.stdout should include("ok")

            // create package binding
            assetHelper.withCleaner(wsk.pkg, packageName) {
                (pkg, name) => pkg.bind("/whisk.system/alarms", name)
            }

            // create trigger with feed
            val feedCreationResult = assetHelper.withCleaner(wsk.trigger, triggerName, confirmDelete = false) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/$feed"), parameters = Map(
                        "trigger_payload" -> "alarmTest".toJson,
                        "date" -> "tomorrow".toJson),
                        expectedExitCode = 246)
            }
            feedCreationResult.stderr should include("date parameter 'tomorrow' is not a valid Date")

    }

    it should "return error message when alarms once action date parameter is not a future date" in withAssetCleaner(wskprops) {
        (wp, assetHelper) =>
            implicit val wskprops = wp // shadow global props and make implicit
            val triggerName = s"dummyAlarmsTrigger-${System.currentTimeMillis}"
            val packageName = "dummyAlarmsPackage"
            val feed = "once"

            // the package alarms should be there
            val packageGetResult = wsk.pkg.get("/whisk.system/alarms")
            println("fetched package alarms")
            packageGetResult.stdout should include("ok")

            // create package binding
            assetHelper.withCleaner(wsk.pkg, packageName) {
                (pkg, name) => pkg.bind("/whisk.system/alarms", name)
            }

            val pastDate = System.currentTimeMillis - 5000

            // create trigger with feed
            val feedCreationResult = assetHelper.withCleaner(wsk.trigger, triggerName, confirmDelete = false) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/$feed"), parameters = Map(
                        "trigger_payload" -> "alarmTest".toJson,
                        "date" -> pastDate.toJson),
                        expectedExitCode = 246)
            }
            feedCreationResult.stderr should include(s"date parameter '${pastDate}' must be in the future")

    }

    it should "return error message when alarms startDate parameter is not a future date" in withAssetCleaner(wskprops) {
        (wp, assetHelper) =>
            implicit val wskprops = wp // shadow global props and make implicit
            val triggerName = s"dummyAlarmsTrigger-${System.currentTimeMillis}"
            val packageName = "dummyAlarmsPackage"
            val feed = "alarm"

            // the package alarms should be there
            val packageGetResult = wsk.pkg.get("/whisk.system/alarms")
            println("fetched package alarms")
            packageGetResult.stdout should include("ok")

            // create package binding
            assetHelper.withCleaner(wsk.pkg, packageName) {
                (pkg, name) => pkg.bind("/whisk.system/alarms", name)
            }

            val pastDate = System.currentTimeMillis - 5000

            // create trigger with feed
            val feedCreationResult = assetHelper.withCleaner(wsk.trigger, triggerName, confirmDelete = false) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/$feed"), parameters = Map(
                        "startDate" -> pastDate.toJson,
                        "cron" -> "* * * * *".toJson),
                        expectedExitCode = 246)
            }
            feedCreationResult.stderr should include(s"startDate parameter '${pastDate}' must be in the future")

    }

    it should "return error message when alarms stopDate parameter is not greater than startDate" in withAssetCleaner(wskprops) {
        (wp, assetHelper) =>
            implicit val wskprops = wp // shadow global props and make implicit
            val triggerName = s"dummyAlarmsTrigger-${System.currentTimeMillis}"
            val packageName = "dummyAlarmsPackage"
            val feed = "alarm"

            // the package alarms should be there
            val packageGetResult = wsk.pkg.get("/whisk.system/alarms")
            println("fetched package alarms")
            packageGetResult.stdout should include("ok")

            // create package binding
            assetHelper.withCleaner(wsk.pkg, packageName) {
                (pkg, name) => pkg.bind("/whisk.system/alarms", name)
            }

            val stopDate = System.currentTimeMillis + 30000
            val startDate = stopDate

            // create trigger with feed
            val feedCreationResult = assetHelper.withCleaner(wsk.trigger, triggerName, confirmDelete = false) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/$feed"), parameters = Map(
                        "startDate" -> startDate.toJson,
                        "stopDate" -> stopDate.toJson,
                        "cron" -> "* * * * *".toJson),
                        expectedExitCode = 246)
            }
            feedCreationResult.stderr should include(s"stopDate parameter '${stopDate}' must be greater than the startDate")

    }

    it should "return error message when interval action does not include minutes parameter" in withAssetCleaner(wskprops) {
        (wp, assetHelper) =>
            implicit val wskprops = wp // shadow global props and make implicit
            val triggerName = s"dummyAlarmsTrigger-${System.currentTimeMillis}"
            val packageName = "dummyAlarmsPackage"
            val feed = "interval"

            // the package alarms should be there
            val packageGetResult = wsk.pkg.get("/whisk.system/alarms")
            println("fetched package alarms")
            packageGetResult.stdout should include("ok")

            // create package binding
            assetHelper.withCleaner(wsk.pkg, packageName) {
                (pkg, name) => pkg.bind("/whisk.system/alarms", name)
            }

            // create trigger with feed
            val feedCreationResult = assetHelper.withCleaner(wsk.trigger, triggerName, confirmDelete = false) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/$feed"), parameters = Map(
                        "trigger_payload" -> "alarmTest".toJson),
                        expectedExitCode = 246)
            }
            feedCreationResult.stderr should include("interval trigger feed is missing the minutes parameter")

    }

    it should "return error message when interval action includes invalid minutes parameter" in withAssetCleaner(wskprops) {
        (wp, assetHelper) =>
            implicit val wskprops = wp // shadow global props and make implicit
            val triggerName = s"dummyAlarmsTrigger-${System.currentTimeMillis}"
            val packageName = "dummyAlarmsPackage"
            val feed = "interval"

            // the package alarms should be there
            val packageGetResult = wsk.pkg.get("/whisk.system/alarms")
            println("fetched package alarms")
            packageGetResult.stdout should include("ok")

            // create package binding
            assetHelper.withCleaner(wsk.pkg, packageName) {
                (pkg, name) => pkg.bind("/whisk.system/alarms", name)
            }

            // create trigger with feed
            val feedCreationResult = assetHelper.withCleaner(wsk.trigger, triggerName, confirmDelete = false) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/$feed"), parameters = Map(
                        "trigger_payload" -> "alarmTest".toJson,
                        "minutes" -> "five".toJson),
                        expectedExitCode = 246)
            }
            feedCreationResult.stderr should include("the minutes parameter must be an integer")

    }

    it should "return error message when alarms trigger update contains no updatable parameters" in withAssetCleaner(wskprops) {
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

            val futureDate = System.currentTimeMillis + (1000 * 20)

            // create trigger feed
            println(s"Creating trigger: $triggerName")
            assetHelper.withCleaner(wsk.trigger, triggerName) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/once"), parameters = Map(
                        "date" -> futureDate.toJson))
            }

            val actionName = s"$packageName/alarm"
            val updatedStartDate = System.currentTimeMillis + (1000 * 20)
            val updatedStopDate = updatedStartDate + (1000 * 10)

            val updateRunAction = wsk.action.invoke(actionName, parameters = Map(
                "triggerName" -> triggerName.toJson,
                "lifecycleEvent" -> "UPDATE".toJson,
                "authKey" -> wskProps.authKey.toJson,
                "startDate" -> updatedStartDate.toJson,
                "stopDate" -> updatedStopDate.toJson
            ))

            withActivation(wsk.activation, updateRunAction) {
                activation =>
                    activation.response.success shouldBe false
                    val error = activation.response.result.get.fields("error").asJsObject
                    error.fields("error") shouldBe JsString("no updatable parameters were specified")
            }
    }

    it should "return error message when startDate is updated to be greater than the stopDate" in withAssetCleaner(wskprops) {
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
            val startDate = System.currentTimeMillis + (1000 * 20)
            val stopDate = startDate + (1000 * 10)

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
            val updatedStartDate = System.currentTimeMillis + (1000 * 2000)

            val updateRunAction = wsk.action.invoke(actionName, parameters = Map(
                "triggerName" -> triggerName.toJson,
                "lifecycleEvent" -> "UPDATE".toJson,
                "authKey" -> wskProps.authKey.toJson,
                "startDate" -> updatedStartDate.toJson
            ))

            withActivation(wsk.activation, updateRunAction) {
                activation =>
                    activation.response.success shouldBe false
                    val error = activation.response.result.get.fields("error").asJsObject
                    error.fields("error") shouldBe JsString(s"startDate parameter '${updatedStartDate}' must be less than the stopDate parameter '${stopDate}'")
            }
    }

    it should "return error message when limitCronFields is true and 6 cron fields are used" in withAssetCleaner(wskprops) {
        (wp, assetHelper) =>
            implicit val wskprops = wp // shadow global props and make implicit
            val triggerName = s"dummyAlarmsTrigger-${System.currentTimeMillis}"
            val packageName = "dummyAlarmsPackage"
            val feed = "alarm"

            // the package alarms should be there
            val packageGetResult = wsk.pkg.get("/whisk.system/alarms")
            println("fetched package alarms")
            packageGetResult.stdout should include("ok")

            // create package binding
            assetHelper.withCleaner(wsk.pkg, packageName) {
                (pkg, name) => pkg.bind("/whisk.system/alarms", name)
            }

            // create trigger with feed
            val feedCreationResult = assetHelper.withCleaner(wsk.trigger, triggerName, confirmDelete = false) {
                (trigger, name) =>
                    trigger.create(name, feed = Some(s"$packageName/$feed"), parameters = Map(
                        "cron" -> "* * * * * *".toJson,
                        "limitCronFields" -> true.toJson),
                        expectedExitCode = 246)
            }
            feedCreationResult.stderr should include("cron pattern is limited to 5 fields with 1 minute as the finest granularity")

    }
}
