#!/bin/sh
set -eu
# /data and /config are RAM-backed; persistent certificate/ACME material is
# restored exclusively from Docker's encrypted secret store.
tar -xf /run/secrets/caddy_state -C /data
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
