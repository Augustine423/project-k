# Build stage
FROM gcc:latest AS builder
RUN apt-get update && apt-get install -y cmake libgrpc++-dev protobuf-compiler-grpc
WORKDIR /app
COPY . .
RUN gcc -o media-server main.c -lgrpc -lprotobuf

# Runtime stage
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y libgrpc++1
WORKDIR /root/
COPY --from=builder /app/media-server .
CMD ["./media-server"]
