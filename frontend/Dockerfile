FROM nginx:alpine

# Copy frontend files
COPY . /usr/share/nginx/html/

# Nginx config for WebSocket proxy
RUN echo ' \
server { \
    listen 80; \
    server_name localhost; \
    \
    location / { \
        root /usr/share/nginx/html; \
        index test-frontend.html; \
    } \
    \
    location /ws { \
        proxy_pass http://backend:8080; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "Upgrade"; \
        proxy_set_header Host $host; \
    } \
} \
' > /etc/nginx/conf.d/default.conf

EXPOSE 80
