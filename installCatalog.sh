#!/bin/bash
#
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements.  See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License.  You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

#
# use the command line interface to install standard actions deployed
# automatically
#
# If the authentication information in your database contains special characters that require encoding,
# run the script in the following format:
# ./installCatalog.sh <authkey> <edgehost> <apihost> <workers> <dburl> <dbprefix> <dbusername> <dbpassword>
#
# Otherwise, run it in the following format:
# ./installCatalog.sh <authkey> <edgehost> <apihost> <workers> <dburl> <dbprefix>

set -e
set -x

: ${OPENWHISK_HOME:?"OPENWHISK_HOME must be set and non-empty"}
WSK_CLI="$OPENWHISK_HOME/bin/wsk"


if [ $# -ne 6 ] && [ $# -ne 8 ]; then
    echo "
If the authentication information in your database contains special characters that require encoding,
run the script in the following format:
./installCatalog.sh <authkey> <edgehost> <apihost> <workers> <dburl> <dbprefix> <dbusername> <dbpassword>
 Otherwise, run it in the following format:
./installCatalog.sh <authkey> <edgehost> <apihost> <workers> <dburl> <dbprefix>"
    exit 1
fi

AUTH="$1"
EDGEHOST="$2"
APIHOST="$3"
WORKERS="$4"
DB_URL="$5"
DB_NAME="${6}alarmservice"
DB_USERNAME="$7"
DB_PASSWORD="$8"
LIMIT_CRON_FIELDS="${LIMIT_CRON_FIELDS}"
ACTION_RUNTIME_VERSION=${ACTION_RUNTIME_VERSION:="nodejs:14"}

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
     -a parameters '[ {"name":"trigger_payload", "required":false} ]' \
     -p apihost "$APIHOST" \
     -p trigger_payload ''

# make alarmFeed.zip
cd action

if [ -e alarmFeed.zip ]; then
    rm -rf alarmFeed.zip
fi

cp -f alarmFeed_package.json package.json
npm install
rm -rf alarmFeed.zip
zip -r alarmFeed.zip lib package.json alarm.js -q

$WSK_CLI -i --apihost "$EDGEHOST" action update --kind "$ACTION_RUNTIME_VERSION" --auth "$AUTH" alarms/alarm "$PACKAGE_HOME/action/alarmFeed.zip" \
     -a description 'Fire trigger when alarm occurs' \
     -a parameters '[ {"name":"cron", "required":true}, {"name":"timezone", "required":false}, {"name":"startDate", "required":false}, {"name":"stopDate", "required":false}, {"name":"strict", "required":false} ]' \
     -a feed true

$WSK_CLI -i --apihost "$EDGEHOST" action update --kind "$ACTION_RUNTIME_VERSION" --auth "$AUTH" alarms/once "$PACKAGE_HOME/action/alarmFeed.zip" \
     -a description 'Fire trigger once when alarm occurs' \
     -a parameters '[ {"name":"date", "required":true}, {"name":"deleteAfterFire", "required":false} ]' \
     -a feed true \
     -p fireOnce true

$WSK_CLI -i --apihost "$EDGEHOST" action update --kind "$ACTION_RUNTIME_VERSION" --auth "$AUTH" alarms/interval "$PACKAGE_HOME/action/alarmFeed.zip" \
     -a description 'Fire trigger at specified interval' \
     -a parameters '[ {"name":"minutes", "required":true}, {"name":"startDate", "required":false}, {"name":"stopDate", "required":false} ]' \
     -a feed true \
     -p isInterval true

COMMAND=" -i --apihost $EDGEHOST package update --auth $AUTH --shared no alarmsWeb \
    -p DB_URL $DB_URL \
    -p DB_NAME $DB_NAME \
    -p apihost $APIHOST"

if [ -n "$DB_USERNAME" ] && [ -n "$DB_PASSWORD" ]; then
    COMMAND+=" -p DB_USERNAME $DB_USERNAME"
    COMMAND+=" -p DB_PASSWORD $DB_PASSWORD"
fi

if [ -n "$WORKERS" ]; then
    COMMAND+=" -p workers $WORKERS"
fi

if [ -n "$LIMIT_CRON_FIELDS" ]; then
    COMMAND+=" -p limitCronFields $LIMIT_CRON_FIELDS"
fi

$WSK_CLI $COMMAND

# make alarmWebAction.zip
cp -f alarmWeb_package.json package.json
npm install
rm -rf alarmWebAction.zip
zip -r alarmWebAction.zip lib package.json alarmWebAction.js node_modules -q

$WSK_CLI -i --apihost "$EDGEHOST" action update --kind "$ACTION_RUNTIME_VERSION" --auth "$AUTH" alarmsWeb/alarmWebAction "$PACKAGE_HOME/action/alarmWebAction.zip" \
    -a description 'Create/Delete a trigger in alarms provider Database' \
    --web true





