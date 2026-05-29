# Stage 1: Build the React app
FROM node:18-alpine AS builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine
# Copy build output to Nginx's default directory
COPY --from=builder /app/build /usr/share/nginx/html
# Add custom Nginx config for React SPA routing
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
