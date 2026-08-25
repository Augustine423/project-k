FROM gcc:14-bookworm AS build

RUN apt-get update \
    && apt-get install -y --no-install-recommends cmake ninja-build \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY . /src

RUN cmake -S /src -B /src/build -G Ninja -DCMAKE_BUILD_TYPE=Release \
    && cmake --build /src/build

FROM debian:bookworm-slim

WORKDIR /app
COPY --from=build /src/build/kzys_media_layer_demo /app/kzys_media_layer_demo
COPY --from=build /src/build/kzys_media_layer_stress /app/kzys_media_layer_stress

ENTRYPOINT ["/app/kzys_media_layer_demo"]

