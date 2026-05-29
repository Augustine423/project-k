# Build stage
FROM gcc:latest AS builder
WORKDIR /app
COPY backend-c/ .
RUN gcc -std=c11 -Wall -Wextra -O2 -o media-server main.c

# Runtime stage
FROM debian:bookworm-slim
WORKDIR /root/
COPY --from=builder /app/media-server .
EXPOSE 50051
CMD ["./media-server"]
