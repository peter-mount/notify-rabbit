FROM area51/node:latest-job
MAINTAINER Peter Mount <peter@retep.org>

ENV CMD=/opt/notify-rabbit.js

COPY *.* /opt/

WORKDIR /opt

CMD $CMD

RUN npm install &&\
    chmod +x $CMD
