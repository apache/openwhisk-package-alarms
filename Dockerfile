FROM node:10.15.3

# only package.json
ADD package.json /
RUN cd / && npm install --production

# App
ADD provider/. /alarmsTrigger/

EXPOSE 8080

CMD ["/bin/bash", "-c", "node /alarmsTrigger/app.js"]
