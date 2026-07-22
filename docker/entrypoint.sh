#!/bin/sh
set -eu

install -d -m 0700 -o www-data -g www-data \
    "$SSP_DATA_ROOT/config" \
    "$SSP_DATA_ROOT/cache" \
    "$SSP_DATA_ROOT/cache/sessions" \
    "$SSP_DATA_ROOT/cache/throttle"

exec docker-php-entrypoint "$@"
