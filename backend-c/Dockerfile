# Single stage — build and run in same image, no lib mismatch possible
FROM gcc:latest
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
    g++ -std=c++17 -O2 -o /usr/local/bin/media-server \
    main.cpp kzys.pb.cc kzys.grpc.pb.cc \
    $(pkg-config --cflags --libs grpc++ protobuf) -lpthread
EXPOSE 50051
CMD ["media-server"]
