FROM ubuntu:14.04

ENV DEBIAN_FRONTEND noninteractive
ENV NODE_SETUP_DOWNLOAD_SHA 30084249bdd56119cb61be682a56829a11a4c94e21c5d005d326dedb66776104

# Initial update and some basics.
# This odd double update seems necessary to get curl to download without 404 errors.
RUN apt-get update --fix-missing && \
  apt-get install -y wget && \
  apt-get update && \
  apt-get install -y curl && \
  apt-get update && \
  apt-get remove -y nodejs && \
  curl -sL https://deb.nodesource.com/setup_8.x -o setup_8.x && \ 
  echo "${NODE_SETUP_DOWNLOAD_SHA} setup_8.x" | sha256sum -c - && \
  cat setup_8.x | bash - && \
  rm setup_8.x && \
  apt-get install -y nodejs

# only package.json
ADD package.json /
RUN cd / && npm install --production

# App
ADD provider/. /alarmsTrigger/

EXPOSE 8080

CMD ["/bin/bash", "-c", "node /alarmsTrigger/app.js >> /logs/alarmsTrigger_logs.log 2>&1"]
