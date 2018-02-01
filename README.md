# Using the Alarm package

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](http://www.apache.org/licenses/LICENSE-2.0)
[![Build Status](https://travis-ci.org/apache/incubator-openwhisk-package-alarms.svg?branch=master)](https://travis-ci.org/apache/incubator-openwhisk-package-alarms)

The `/whisk.system/alarms` package can be used to fire a trigger at a specified frequency. Alarms are useful for setting up recurring jobs or tasks, such as invoking a system backup action every hour.

The package includes the following feeds.

| Entity | Type | Parameters | Description |
| --- | --- | --- | --- |
| `/whisk.system/alarms` | package | - | Alarms and periodic utility. |
| `/whisk.system/alarms/interval` | feed | minutes, trigger_payload, startDate, stopDate | Fire Trigger event on an interval based schedule. |
| `/whisk.system/alarms/once` | feed | date, trigger_payload, deleteAfterFire | Fire Trigger event once on a specific date. |
| `/whisk.system/alarms/alarm` | feed | cron, trigger_payload, startDate, stopDate | Fire Trigger event on a time-based schedule using cron. |


## Firing a trigger event periodically on an interval based schedule

The `/whisk.system/alarms/interval` feed configures the Alarm service to fire a Trigger event on an interval based schedule. The parameters are as follows:

- `minutes` (*required*): An integer representing the length of the interval (in minutes) between trigger fires.

- `trigger_payload` (*optional*): The value of this parameter becomes the content of the Trigger every time the Trigger is fired.

- `startDate` (*optional*): The date when the first trigger will be fired.  Subsequent fires will occur based on the interval length specified by the `minutes` parameter.   

- `stopDate` (*optional*): The date when the Trigger will stop running.  Triggers will no longer be fired once this date has been reached.

  **Note**: The `startDate` and `stopDate` parameters support an integer or string value.  The integer value represents the number of milliseconds since 1 January 1970 00:00:00 UTC and the string value should be in the ISO 8601 format (http://www.ecma-international.org/ecma-262/5.1/#sec-15.9.1.15).

The following example creates a trigger that is fired once every 2 minutes. The Trigger fires as soon as possible, and will stop firing January 31, 2019, 23:59:00 UTC.

  ```
  wsk trigger create interval \
    --feed /whisk.system/alarms/interval \
    --param minutes 2 \
    --param trigger_payload "{\"name\":\"Odin\",\"place\":\"Asgard\"}" \
    --param stopDate "2019-01-31T23:59:00.000Z"
  ```
  
Each generated event includes parameters, which are the properties that are specified by the `trigger_payload` value. In this case, each Trigger event has the parameters `name=Odin` and `place=Asgard`.

## Firing a trigger event once  

The `/whisk.system/alarms/once` feed configures the Alarm service to fire a trigger event on a specified date. The parameters are as follows:

- `date` (*required*): The date when the Trigger will be fired.  The Trigger will be fired just once at the given time. 

  **Note**: The `date` parameter supports an integer or string value.  The integer value represents the number of milliseconds 
  since 1 January 1970 00:00:00 UTC and the string value should be in the ISO 8601 format (http://www.ecma-international.org/ecma-262/5.1/#sec-15.9.1.15).

- `trigger_payload` (*optional*): The value of this parameter becomes the content of the Trigger when the Trigger is fired. 

- `deleteAfterFire` (*optional*, default: false): The value of this parameter determines whether the Trigger and potentially all of its associated rules will be deleted after the Trigger is fired.  
  - `false`: No action will be taken after the Trigger fires. 
  - `true`: The Trigger will be deleted after it fires. 
  - `rules`: The Trigger and all of its associated rules will be deleted after it fires.

The following is an example of creating a trigger that will be fired once on December 25, 2019, 12:30:00 UTC.  After the Trigger fires it will be deleted as well as all of its associated rules.  

  ```
  wsk trigger create fireOnce \
    --feed /whisk.system/alarms/once \
    --param trigger_payload "{\"name\":\"Odin\",\"place\":\"Asgard\"}" \
    --param date "2019-12-25T12:30:00.000Z" \
    --param deleteAfterFire "rules"
  ``` 

## Firing a Trigger on a time-based schedule using cron

The `/whisk.system/alarms/alarm` feed configures the Alarm service to fire a Trigger event at a specified frequency. The parameters are as follows:

- `cron` (*required*): A string, based on the UNIX crontab syntax that indicates when to fire the Trigger in Coordinated Universal Time (UTC). The string is a sequence of five fields that are separated by spaces: `X X X X X`.
For more information, see: http://crontab.org. The following strings are examples that use varying duration's of frequency.

  - `* * * * *`: The Trigger fires at the top of every minute.
  - `0 * * * *`: The Trigger fires at the top of every hour.
  - `0 */2 * * *`: The Trigger fires every 2 hours (that is, 02:00:00, 04:00:00, ...).
  - `0 9 8 * *`: The Trigger fires at 9:00:00AM (UTC) on the eighth day of every month.
  
  **Note**: The parameter `cron` supports five or six fields.  Not all OpenWhisk vendors may support 6 fields so please check their documentation for support.
  For more details about using this custom cron syntax, see: https://github.com/ncb000gt/node-cron.
  Here is an example using six fields notation:
    - `*/30 * * * * *`: every thirty seconds.
    
- `trigger_payload` (*optional*): The value of this parameter becomes the content of the Trigger every time the Trigger is fired.

- `startDate` (*optional*): The date when the Trigger will start running. The Trigger fires based on the schedule specified by the cron parameter.  

- `stopDate` (*optional*): The date when the Trigger will stop running. Triggers are no longer fired once this date is reached.

  **Note**: The `startDate` and `stopDate` parameters support an integer or string value.  The integer value represents the number of milliseconds since 1 January 1970 00:00:00 UTC, and the string value should be in the ISO 8601 format (http://www.ecma-international.org/ecma-262/5.1/#sec-15.9.1.15).

The following is an example of creating a trigger that fires once every 2 minutes with `name` and `place` values in the trigger event.  The Trigger will not start firing until
January 1, 2019, 00:00:00 UTC and will stop firing January 31, 2019, 23:59:00 UTC.

  ```
  wsk trigger create periodic \
    --feed /whisk.system/alarms/alarm \
    --param cron "*/2 * * * *" \
    --param trigger_payload "{\"name\":\"Odin\",\"place\":\"Asgard\"}" \
    --param startDate "2019-01-01T00:00:00.000Z" \
    --param stopDate "2019-01-31T23:59:00.000Z"
  ```

 **Note**: The parameter `maxTriggers` is deprecated and will be removed soon.  To stop the Trigger, use the `stopDate` parameter.
