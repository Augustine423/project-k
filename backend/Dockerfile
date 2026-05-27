FROM alpine:latest AS builder

# Install build dependencies
RUN apk add --no-cache gcc musl-dev make

# Copy backend source
WORKDIR /app
COPY . .

# Compile
RUN gcc -o websocket-server websocket-server.c -Wall -Wextra -static
RUN gcc -o media-router media-router.c -Wall -Wextra -static
RUN gcc -o videoroom-core videoroom-core.c -Wall -Wextra -static

# Runtime image
FROM alpine:latest
WORKDIR /app

# Copy binaries
COPY --from=builder /app/websocket-server .
COPY --from=builder /app/media-router .
COPY --from=builder /app/videoroom-core .

# Expose ports
EXPOSE 8080

# Start WebSocket server
CMD ["./websocket-server"]
