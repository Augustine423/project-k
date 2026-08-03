# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Production image (CI / GKE / docker compose)
#
# BUILD-TIME (baked into static assets by Vite):
#   VITE_API_URL — leave empty for same-origin behind nginx (/api, /ws).
#                  Set only when API is on a different public origin.
#
# RUNTIME:
#   PUBLIC_HOST — used to stamp self-signed cert SAN (camera/mic need HTTPS)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build && \
  rm -rf node_modules .npm /app/src /app/*.config.* /app/.* 2>/dev/null || true

FROM nginx:1.27-alpine AS production
# Compose passes nginx.compose.conf; K8s mounts its own ConfigMap over default.conf.
ARG NGINX_CONF=nginx.compose.conf
RUN apk add --no-cache openssl && rm -rf /var/cache/apk/* && \
  rm -rf /var/log/nginx/* /etc/nginx/conf.d/default.conf.default
COPY ${NGINX_CONF} /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint-web.sh
RUN chmod +x /docker-entrypoint-web.sh
COPY --from=build /app/dist /usr/share/nginx/html
# Remove source maps and test files from dist
RUN find /usr/share/nginx/html -type f \( -name '*.map' -o -name '*.test.*' \) -delete
EXPOSE 80 443
ENTRYPOINT ["/docker-entrypoint-web.sh"]

# ---------------------------------------------------------------------------
# Dev image (local docker compose — Vite HMR + HTTPS via basicSsl)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS dev
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
