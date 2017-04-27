#!/bin/bash
#
# use the command line interface to install standard actions deployed
# automatically
#
# To run this command
# ./installCatalog.sh <authkey> <edgehost> <dburl> <dbprefix> <apihost>

set -e
set -x

: ${OPENWHISK_HOME:?"OPENWHISK_HOME must be set and non-empty"}
WSK_CLI="$OPENWHISK_HOME/bin/wsk"

if [ $# -eq 0 ]
then
echo "Usage: ./installCatalog.sh <authkey> <edgehost> <dburl> <dbprefix> <apihost>"
fi

AUTH="$1"
EDGEHOST="$2"
DB_URL="$3"
DB_NAME="${4}alarmservice"
APIHOST="$5"

# If the auth key file exists, read the key in the file. Otherwise, take the
# first argument as the key itself.
if [ -f "$AUTH" ]; then
    AUTH=`cat $AUTH`
fi

# Make sure that the EDGEHOST is not empty.
: ${EDGEHOST:?"EDGEHOST must be set and non-empty"}

# Make sure that the DB_URL is not empty.
: ${DB_URL:?"DB_URL must be set and non-empty"}

# Make sure that the DB_NAME is not empty.
: ${DB_NAME:?"DB_NAME must be set and non-empty"}

# Make sure that the APIHOST is not empty.
: ${APIHOST:?"APIHOST must be set and non-empty"}

PACKAGE_HOME="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

export WSK_CONFIG_FILE= # override local property file to avoid namespace clashes

echo Installing Alarms package.

$WSK_CLI -i --apihost "$EDGEHOST" package update --auth "$AUTH" --shared yes alarms \
     -a description 'Alarms and periodic utility' \
     -a parameters '[ {"name":"cron", "required":true}, {"name":"trigger_payload", "required":false} ]' \
     -p apihost "$APIHOST" \
     -p cron '' \
     -p trigger_payload ''

$WSK_CLI -i --apihost "$EDGEHOST" action update --kind nodejs:6 --auth "$AUTH" alarms/alarm "$PACKAGE_HOME/action/alarm.js" \
     -a description 'Fire trigger when alarm occurs' \
     -a feed true

$WSK_CLI -i --apihost "$EDGEHOST" package update --auth "$AUTH" --shared no alarmsWeb \
     -p DB_URL "$DB_URL" \
     -p DB_NAME "$DB_NAME" \
     -p apihost "$APIHOST"

# make alarmWebAction.zip
cd action
npm install

if [ -e alarmWebAction.zip ]
then
    rm -rf alarmWebAction.zip
fi

zip -r alarmWebAction.zip package.json alarmWebAction.js node_modules

$WSK_CLI -i --apihost "$EDGEHOST" action update --kind nodejs:6 --auth "$AUTH" alarmsWeb/alarmWebAction "$PACKAGE_HOME/action/alarmWebAction.zip" \
    -a description 'Create/Delete a trigger in alarms provider Database' \
    --web true





