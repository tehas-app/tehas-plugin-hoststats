FROM node:22-bookworm@sha256:e13726ca604184d7a91fcacab1fc09eefd642dc28e79ac34e85540dd93b78cfb
# The base the other tehas plugins pin. The view has no dependencies, so the build needs no network.

WORKDIR /plugin
COPY tehas-plugin.json package.json Dockerfile README.md LICENSE NOTICE /plugin/
COPY driver /plugin/driver
COPY view /plugin/view
COPY test /plugin/test
RUN ["node", "--test", "/plugin/test/*.test.mjs"]
# A new Docker volume takes the owner of the image's folder it is mounted on, so the runs' volumes are 10001's.
RUN mkdir -p /work /out /state && chown 10001:10001 /work /out /state

ENV HOME=/tmp NODE_ENV=production
USER 10001:10001
ENTRYPOINT ["node", "/plugin/driver/main.mjs"]
