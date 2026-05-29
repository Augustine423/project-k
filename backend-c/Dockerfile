# Build stage
FROM gcc:latest AS builder
WORKDIR /app
COPY . .
RUN gcc -std=c11 -Wall -Wextra -O2 -o media-server main.c

# Runtime stage
FROM debian:bookworm-slim
WORKDIR /root/
COPY --from=builder /app/media-server .
CMD ["./media-server"]
