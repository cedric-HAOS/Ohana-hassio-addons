# syntax=docker/dockerfile:1
FROM node:18-alpine AS base

WORKDIR /home/node/app
ENV LOG_FORMAT=text
RUN apk add --no-cache tzdata

FROM base AS dependencies
COPY app/package*.json app/index.js ./
RUN apk add --no-cache --virtual build_tools make gcc g++ python3 linux-headers udev \
    && npm ci --omit=dev --no-audit --omit=optional --no-update-notifier \
    && npm rebuild --build-from-source \
    && apk del build_tools

FROM base AS release
ARG BUILD_VERSION=9.0.6-ohana.3
ARG BUILD_ARCH
LABEL io.hass.name="teleinfo2mqtt Ohana" \
      io.hass.description="Téléinformation Linky vers MQTT et Ohana-Agent" \
      io.hass.arch="${BUILD_ARCH}" \
      io.hass.version="${BUILD_VERSION}" \
      io.hass.type="app" \
      org.opencontainers.image.title="teleinfo2mqtt Ohana" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.source="https://github.com/cedric-HAOS/Ohana-hassio-addons" \
      org.opencontainers.image.licenses="MIT"
COPY --from=dependencies /home/node/app/node_modules ./node_modules
COPY Docker.entrypoint.sh /usr/bin/entrypoint.sh
RUN chmod +x /usr/bin/entrypoint.sh
ENTRYPOINT ["/usr/bin/entrypoint.sh"]
COPY app/ ./
CMD ["node", "index"]
