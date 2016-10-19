FROM ubuntu:14.04

ENV DEBIAN_FRONTEND noninteractive

# Initial update and some basics.
# This odd double update seems necessary to get curl to download without 404 errors.
RUN apt-get update --fix-missing && \
  apt-get install -y wget && \
  apt-get update && \
  apt-get install -y curl && \
  apt-get update && \
  apt-get remove -y nodejs && \
  curl -sL https://deb.nodesource.com/setup_4.x | bash - && \
  apt-get install -y nodejs

# only package.json
ADD package.json /alarmsTrigger/
RUN cd /alarmsTrigger; npm install

# App
ADD . /alarmsTrigger

EXPOSE 8080

CMD ["/bin/bash", "-c", "node /alarmsTrigger/app.js >> /logs/alarmsTrigger_logs.log 2>&1"]
