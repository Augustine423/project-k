FROM nginx:alpine

# Copy frontend files
COPY . /usr/share/nginx/html/

# Copy nginx config template
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Use envsubst to replace variables at runtime
CMD ["/bin/sh", "-c", "envsubst '$$BACKEND_HOST' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]

EXPOSE 80
