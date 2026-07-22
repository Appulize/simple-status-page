# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS frontend

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY bin/vendor.mjs bin/vendor.mjs
COPY public/assets public/assets
RUN npm run vendor

FROM php:8.4-apache-bookworm

RUN docker-php-ext-install -j"$(nproc)" opcache \
    && a2enmod rewrite \
    && rm -rf /tmp/pear

ARG VERSION=dev
LABEL org.opencontainers.image.title="simple-status-page" \
      org.opencontainers.image.description="A lightweight, self-hosted status page" \
      org.opencontainers.image.source="https://github.com/Appulize/simple-status-page" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}"

WORKDIR /var/www/html
COPY --chown=www-data:www-data . .
COPY --from=frontend --chown=www-data:www-data /app/public/assets/vendor public/assets/vendor
COPY docker/apache-vhost.conf /etc/apache2/sites-available/000-default.conf
COPY docker/php.ini /usr/local/etc/php/conf.d/simple-status-page.ini
COPY docker/entrypoint.sh /usr/local/bin/simple-status-page-entrypoint

ENV SSP_DATA_ROOT=/data

VOLUME ["/data"]
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl --fail --silent --show-error http://127.0.0.1/api/health >/dev/null || exit 1

ENTRYPOINT ["simple-status-page-entrypoint"]
CMD ["apache2-foreground"]
