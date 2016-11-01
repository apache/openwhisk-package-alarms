#!/bin/bash
#
# use the command line interface to install standard actions deployed
# automatically
#
# To run this command
# ./installCatalog.sh  <AUTH> <APIHOST> <ALARM_TRIGGER_HOST> <ALARM_TRIGGER_PORT>
# AUTH and APIHOST are found in $HOME/.wskprops

set -e
set -x

: ${OPENWHISK_HOME:?"OPENWHISK_HOME must be set and non-empty"}
WSK_CLI="$OPENWHISK_HOME/bin/wsk"

if [ $# -eq 0 ]
then
echo "Usage: ./installCatalog.sh <authkey> <apihost> <alarmtriggerhost> <alarmtriggerport>"
fi

AUTH="$1"
APIHOST="$2"
ALARM_TRIGGER_HOST="$3"
ALARM_TRIGGER_PORT="$4"


# If the auth key file exists, read the key in the file. Otherwise, take the
# first argument as the key itself.
if [ -f "$AUTH" ]; then
    AUTH=`cat $AUTH`
fi

# Make sure that the APIHOST is not empty.
: ${APIHOST:?"APIHOST must be set and non-empty"}

ALARM_PROVIDER_ENDPOINT=$ALARM_TRIGGER_HOST':'$ALARM_TRIGGER_PORT
echo 'alarms trigger package endpoint:' $ALARM_PROVIDER_ENDPOINT

PACKAGE_HOME="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

export WSK_CONFIG_FILE= # override local property file to avoid namespace clashes

echo Installing Alarms package.

$WSK_CLI -i --apihost "$APIHOST" package update --auth "$AUTH"  --shared yes alarms \
     -a description 'Alarms and periodic utility' \
     -a parameters '[ {"name":"cron", "required":true}, {"name":"trigger_payload", "required":false} ]' \
     -p package_endpoint $ALARM_PROVIDER_ENDPOINT \
     -p cron '' \
     -p trigger_payload ''

$WSK_CLI -i --apihost "$APIHOST" action update --auth "$AUTH" --shared yes alarms/alarm "$PACKAGE_HOME/action/alarm.js" \
     -a description 'Fire trigger when alarm occurs' \
     -a feed true


