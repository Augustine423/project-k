FROM debian:bookworm-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake pkg-config libcurl4-openssl-dev libhiredis-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY CMakeLists.txt .
COPY src/main.cpp src/main.cpp

RUN cmake -B build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build --config Release

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libcurl4 libhiredis0.14 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /src/build/media-core /usr/local/bin/media-core

ENV MEDIA_CORE_POLL_MS=1000
EXPOSE 8090

CMD ["media-core"]
