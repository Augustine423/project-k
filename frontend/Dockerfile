# Stage 1: Build the React app
FROM node:18-alpine AS builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
# Pass LiveKit server URL at build time: docker build --build-arg REACT_APP_LIVEKIT_URL=wss://your-livekit-host
ARG REACT_APP_LIVEKIT_URL
ENV REACT_APP_LIVEKIT_URL=$REACT_APP_LIVEKIT_URL
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine
# Copy build output to Nginx's default directory
COPY --from=builder /app/build /usr/share/nginx/html
# Add custom Nginx config for React SPA routing
COPY frontend/nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
