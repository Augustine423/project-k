# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Production image (CI / GKE)
#
# BUILD-TIME (baked into static assets by Vite):
#   VITE_API_URL — leave empty for same-origin behind Gateway (/api, /ws).
#                  Set only when API is on a different public origin.
#
# RUNTIME (K8s ConfigMap / Secret / Gateway — NOT this Dockerfile):
#   LIVEKIT_URL, TURN_HOST, JWT secrets → Go control plane env
#   Join ticket returns livekitUrl to the browser at runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine AS production
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# ---------------------------------------------------------------------------
# Dev image (local docker compose — Vite HMR + proxy env at container runtime)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS dev
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
