# Build stage
FROM gcc:latest AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgrpc-dev libgrpc++-dev libprotobuf-dev protobuf-compiler \
    protobuf-compiler-grpc pkg-config libssl-dev \
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
    g++ -std=c++17 -O2 -static-libgcc -static-libstdc++ \
    -o media-server main.cpp kzys.pb.cc kzys.grpc.pb.cc \
    $(pkg-config --cflags --libs grpc++ protobuf) \
    -lpthread -Wl,-Bstatic -lssl -lcrypto -Wl,-Bdynamic || \
    g++ -std=c++17 -O2 -o media-server main.cpp kzys.pb.cc kzys.grpc.pb.cc \
    $(pkg-config --cflags --libs grpc++ protobuf) -lpthread

# Runtime stage — copy ALL shared libs from builder to avoid missing .so issues
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgrpc++ libprotobuf-dev libre2-9 libssl3 libcares2 libabsl20220623 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /root/
COPY --from=builder /app/media-server .
EXPOSE 50051
CMD ["./media-server"]
