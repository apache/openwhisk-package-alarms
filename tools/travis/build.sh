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

set -e

# Build script for Travis-CI.

SCRIPTDIR=$(cd $(dirname "$0") && pwd)
ROOTDIR="$SCRIPTDIR/../.."
UTILDIR="$ROOTDIR/../incubator-openwhisk-utilities"
OPENWHISK_HOME="$ROOTDIR/../openwhisk"

# run scancode
cd $UTILDIR
scancode/scanCode.py --config scancode/ASF-Release.cfg $ROOTDIR

# jshint support
sudo apt-get -y install nodejs npm
sudo npm install -g jshint

# run jshint
cd $ROOTDIR
jshint --exclude tests .

export OPENWHISK_HOME
cd $OPENWHISK_HOME
TERM=dumb ./gradlew --console=plain distDocker -PdockerImagePrefix=testing

cd $OPENWHISK_HOME/ansible

ANSIBLE_CMD="ansible-playbook -i environments/local -e docker_image_prefix=testing"

$ANSIBLE_CMD setup.yml
$ANSIBLE_CMD prereq.yml
$ANSIBLE_CMD couchdb.yml
$ANSIBLE_CMD initdb.yml
$ANSIBLE_CMD properties.yml

$ANSIBLE_CMD wipe.yml
$ANSIBLE_CMD openwhisk.yml


cd $TRAVIS_BUILD_DIR
./gradlew distDocker

cd $TRAVIS_BUILD_DIR/ansible
$ANSIBLE_CMD serviceprovider.yml
