#!/bin/sh
# Generate a self-signed cert at start (like Vite basicSsl) so camera/mic work over HTTPS.
set -eu

CERT_DIR=/etc/nginx/tls
mkdir -p "$CERT_DIR"

if [ ! -f "$CERT_DIR/tls.crt" ] || [ ! -f "$CERT_DIR/tls.key" ]; then
  HOST="${PUBLIC_HOST:-localhost}"
  case "$HOST" in
    ""|localhost|CHANGE_ME*|CHANGE_ME_*) HOST="localhost" ;;
  esac
  SAN="DNS:localhost,IP:127.0.0.1"
  if echo "$HOST" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    SAN="${SAN},IP:${HOST}"
  elif [ -n "$HOST" ] && [ "$HOST" != "localhost" ]; then
    SAN="${SAN},DNS:${HOST}"
  fi

  echo "Generating self-signed TLS cert (SAN=${SAN})"
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -keyout "$CERT_DIR/tls.key" \
    -out "$CERT_DIR/tls.crt" \
    -subj "/CN=${HOST}" \
    -addext "subjectAltName=${SAN}"
fi

exec nginx -g "daemon off;"
