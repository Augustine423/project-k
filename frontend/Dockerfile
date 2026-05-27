FROM nginx:alpine

# Copy frontend files
COPY . /usr/share/nginx/html/

# Create nginx config with environment variable for backend host
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
        proxy_pass http://${BACKEND_HOST}:8080; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "Upgrade"; \
        proxy_set_header Host $host; \
    } \
} \
' > /etc/nginx/templates/default.conf.template

# Use envsubst to replace variables at runtime
CMD ["/bin/sh", "-c", "envsubst '$$BACKEND_HOST' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]

EXPOSE 80
