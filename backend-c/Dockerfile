# Build stage
FROM gcc:latest AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgrpc-dev libgrpc++-dev libprotobuf-dev protobuf-compiler \
    protobuf-compiler-grpc pkg-config \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend-c/ .
COPY api/proto/ api/proto/
RUN protoc -I api/proto \
    --cpp_out=. \
    --grpc_out=. \
    --plugin=protoc-gen-grpc=$(which grpc_cpp_plugin) \
    api/proto/kzys.proto
RUN cp main.c main.cpp && \
    g++ -std=c++17 -O2 -o media-server main.cpp kzys.pb.cc kzys.grpc.pb.cc \
    $(pkg-config --cflags --libs grpc++ protobuf) -lpthread
# Collect all shared libs the binary needs
RUN ldd /app/media-server | awk '/=>/{print $3}' | xargs -I{} cp {} /app/

# Runtime stage — copy binary + all its libs
FROM debian:bookworm-slim
WORKDIR /root/
COPY --from=builder /app/media-server .
COPY --from=builder /app/*.so* /usr/local/lib/
RUN ldconfig
EXPOSE 50051
CMD ["./media-server"]
