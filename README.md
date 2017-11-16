# Using the Alarm package

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](http://www.apache.org/licenses/LICENSE-2.0)
[![Build Status](https://travis-ci.org/apache/incubator-openwhisk-package-alarms.svg?branch=master)](https://travis-ci.org/apache/incubator-openwhisk-package-alarms)

The `/whisk.system/alarms` package can be used to fire a trigger at a specified frequency. This is useful for setting up recurring jobs or tasks, such as invoking a system backup action every hour.

The package includes the following feeds.

| Entity | Type | Parameters | Description |
| --- | --- | --- | --- |
| `/whisk.system/alarms` | package | - | Alarms and periodic utility |
| `/whisk.system/alarms/alarm` | feed | cron, trigger_payload, maxTriggers, startDate, stopDate | Fire trigger event periodically |
| `/whisk.system/alarms/once` | feed | date, trigger_payload | Fire trigger event once on a specific date |


## Firing a trigger event periodically

The `/whisk.system/alarms/alarm` feed configures the Alarm service to fire a trigger event at a specified frequency. The parameters are as follows:

- `cron`: A string, based on the UNIX crontab syntax, that indicates when to fire the trigger in Coordinated Universal Time (UTC). The string is a sequence of five fields that are separated by spaces: `X X X X X`.
For more details about using cron syntax, see: http://crontab.org. Following are some examples of the frequency that is indicated by the string:

  - `* * * * *`: top of every minute.
  - `0 * * * *`: top of every hour.
  - `0 */2 * * *`: every 2 hours (i.e. 02:00:00, 04:00:00, ...)
  - `0 9 8 * *`: at 9:00:00AM (UTC) on the eighth day of every month
  
  **Note**: The parameter `cron` also supports a custom syntax of six fields, where the first field represents seconds.
  For more details about using this custom cron syntax, see: https://github.com/ncb000gt/node-cron.
  Here is an example using six fields notation:
    - `*/30 * * * * *`: every thirty seconds.

- `trigger_payload`: The value of this parameter becomes the content of the trigger every time the trigger is fired.

- `maxTriggers`: Stop firing triggers when this limit is reached. Defaults to infinite (-1).

- `startDate`: The date when the trigger will start running.  The trigger will fire based on the schedule specified by the `cron` parameter.   

- `stopDate`: The date when the trigger will stop running.  Triggers will no longer be fired once this date has been reached.

  **Note**: The `startDate` and `stopDate` parameters support an integer or string value.  The integer value represents the number of milliseconds 
  since 1 January 1970 00:00:00 UTC and the string value should be in the ISO 8601 format (http://www.ecma-international.org/ecma-262/5.1/#sec-15.9.1.15).


The following is an example of creating a trigger that will be fired once every 2 minutes with `name` and `place` values in the trigger event.  The trigger will not start firing until
January 1, 2019, 00:00:00 UTC and will stop firing January 31, 2019, 23:59:00 UTC.

  ```
  wsk trigger create periodic \
    --feed /whisk.system/alarms/alarm \
    --param cron "*/2 * * * *" \
    --param trigger_payload "{\"name\":\"Odin\",\"place\":\"Asgard\"}" \
    --param startDate "2019-01-01T00:00:00.000Z" \
    --param stopDate "2019-01-31T23:59:00.000Z"
  ```

Each generated event will include as parameters the properties specified in the `trigger_payload` value. In this case, each trigger event will have parameters `name=Odin` and `place=Asgard`.

## Firing a trigger event once  

The `/whisk.system/alarms/once` feed configures the Alarm service to fire a trigger event on a specified date. The parameters are as follows:

- `date`: The date when the trigger will be fired.  The trigger will be fired just once at the given time. 

  **Note**: The `date` parameter supports an integer or string value.  The integer value represents the number of milliseconds 
  since 1 January 1970 00:00:00 UTC and the string value should be in the ISO 8601 format (http://www.ecma-international.org/ecma-262/5.1/#sec-15.9.1.15).

- `trigger_payload`: The value of this parameter becomes the content of the trigger when the trigger is fired. 

The following is an example of creating a trigger that will be fired once on December 25, 2017, 12:30:00 UTC.

  ```
  wsk trigger create fireOnce \
    --feed /whisk.system/alarms/once \
    --param trigger_payload "{\"name\":\"Odin\",\"place\":\"Asgard\"}" \
    --param date "2017-12-25T12:30:00.000Z"
  ``` 
  