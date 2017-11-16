# Using the Alarm package

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](http://www.apache.org/licenses/LICENSE-2.0)
[![Build Status](https://travis-ci.org/apache/incubator-openwhisk-package-alarms.svg?branch=master)](https://travis-ci.org/apache/incubator-openwhisk-package-alarms)

The `/whisk.system/alarms` package can be used to fire a trigger at a specified frequency. This is useful for setting up recurring jobs or tasks, such as invoking a system backup action every hour.

The package includes the following feed.

| Entity | Type | Parameters | Description |
| --- | --- | --- | --- |
| `/whisk.system/alarms` | package | - | Alarms and periodic utility |
| `/whisk.system/alarms/alarm` | feed | cron, trigger_payload, maxTriggers | Fire trigger event periodically |


## Firing a trigger event periodically

The `/whisk.system/alarms/alarm` feed configures the Alarm service to fire a trigger event at a specified frequency. The parameters are as follows:

- `cron`: A string, based on the UNIX crontab syntax, that indicates when to fire the trigger in Coordinated Universal Time (UTC). The string is a sequence of five fields that are separated by spaces: `X X X X X`.
For more details about using cron syntax, see: http://crontab.org. Following are some examples of the frequency that is indicated by the string:

  - `* * * * *`: top of every minute.
  - `0 * * * *`: top of every hour.
  - `0 */2 * * *`: every 2 hours (i.e. 02:00:00, 04:00:00, ...)
  - `0 9 8 * *`: at 9:00:00AM (UTC) on the eighth day of every month

- `trigger_payload`: The value of this parameter becomes the content of the trigger every time the trigger is fired.

- `maxTriggers`: Stop firing triggers when this limit is reached. Defaults to 1,000,000. You can set it to infinite (-1).

The following is an example of creating a trigger that will be fired once every 2 minutes with `name` and `place` values in the trigger event.

  ```
  wsk trigger create periodic \
    --feed /whisk.system/alarms/alarm \
    --param cron "*/2 * * * *" \
    --param trigger_payload "{\"name\":\"Odin\",\"place\":\"Asgard\"}"
  ```

Each generated event will include as parameters the properties specified in the `trigger_payload` value. In this case, each trigger event will have parameters `name=Odin` and `place=Asgard`.

**Note**: The parameter `cron` also supports a custom syntax of six fields, where the first field represents seconds.
For more details about using this custom cron syntax, see: https://github.com/ncb000gt/node-cron.
Here is an example using six fields notation:
  - `*/30 * * * * *`: every thirty seconds.

## Firing a one-off trigger event

Using the `maxTriggers` parameter with an appropriate `cron` schedule allows triggers to be fired with a "one-off event", rather than on a continual basis.

Setting the `maxTriggers` parameter value to `1` ensures that the first time the trigger has been fired, the scheduler will disable future invocations. The `cron` parameter fields can be configured to match the next date and time when the event should fire. 

`cron` parameters which set the first four fields (minute, hour, day of month, month) of the cron schedule value, using a wildcard for the day of the week, will match a single date time once per year. 

### Example

*What if we want to fire an event when the New Year starts?*

Here’s the cron schedule for 00:00 on January 1st.

```
# ┌───────────── minute (0 - 59)
# │ ┌───────────── hour (0 - 23)
# │ │ ┌───────────── day of month (1 - 31)
# │ │ │ ┌───────────── month (0 - 11)
# │ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)
# │ │ │ │ │
# │ │ │ │ │
# 0 0 1 0 *
```

Here are the cli commands to set up a one-off trigger to run at 00:00 @ 01/01 to celebrate the new year.

```
$ wsk trigger create new_year --feed /whisk.system/alarms/alarm -p cron '0 0 1 0 *' -p maxTriggers 1 -p trigger_payload '{"message":"Happy New Year!"}'
ok: invoked /whisk.system/alarms/alarm with id 754bec0a58b944a68bec0a58b9f4a6c1
...
ok: created trigger new_year
```
