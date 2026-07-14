# Janus WebRTC Gateway - built from source (Meetecho upstream).
#
# We build the real Janus C core + VideoRoom/Streaming/TextRoom plugins from
# source rather than patching them, so we can track upstream security fixes.
# Scaling logic (room sharding, rtp_forward fan-out) lives in the Node
# control plane (see server/), which drives Janus purely through its
# documented Admin API and WebSocket/HTTP Janus API.

FROM debian:bookworm-slim AS build

ARG JANUS_VERSION=v1.4.1
ARG LIBNICE_VERSION=0.1.22
ARG LIBSRTP_VERSION=2.7.0
ARG USRSCTP_COMMIT=master

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        git build-essential ca-certificates pkg-config wget \
        automake autoconf libtool gengetopt \
        cmake meson ninja-build python3 python3-pip \
        libglib2.0-dev libjansson-dev libssl-dev libconfig-dev \
        libmicrohttpd-dev libwebsockets-dev \
        zlib1g-dev libcurl4-openssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# libnice (Debian's packaged version is too old/buggy for WebRTC ICE at scale)
RUN git clone --branch ${LIBNICE_VERSION} --depth 1 \
        https://gitlab.freedesktop.org/libnice/libnice.git && \
    cd libnice && \
    meson setup --prefix=/usr build && \
    ninja -C build && ninja -C build install

# libsrtp2 with OpenSSL (AES-GCM) support, needed for modern DTLS-SRTP profiles
RUN wget -q https://github.com/cisco/libsrtp/archive/refs/tags/v${LIBSRTP_VERSION}.tar.gz && \
    tar xf v${LIBSRTP_VERSION}.tar.gz && \
    cd libsrtp-${LIBSRTP_VERSION} && \
    ./configure --prefix=/usr --enable-openssl && \
    make shared_library -j"$(nproc)" && make install

# usrsctp, needed for WebRTC Data Channels (chat fallback / low-bandwidth control messages)
RUN git clone https://github.com/sctplab/usrsctp && \
    cd usrsctp && \
    ./bootstrap && \
    ./configure --prefix=/usr --disable-programs --disable-inet --disable-inet6 && \
    make -j"$(nproc)" && make install

RUN ldconfig

# Janus itself, pinned to a released tag
RUN git clone --branch ${JANUS_VERSION} --depth 1 https://github.com/meetecho/janus-gateway.git
WORKDIR /build/janus-gateway
RUN sh autogen.sh && \
    ./configure --prefix=/opt/janus \
        --enable-websockets \
        --enable-data-channels \
        --enable-rest \
        --enable-json-logger \
        --disable-rabbitmq \
        --disable-mqtt \
        --disable-nanomsg \
        --disable-plugin-sip \
        --disable-plugin-nosip \
        --disable-plugin-lua \
        --disable-plugin-duktape \
        --disable-plugin-audiobridge \
    && make -j"$(nproc)" \
    && make install \
    && make configs

# ---------------------------------------------------------------------------

FROM debian:bookworm-slim

# Using the same -dev metapackages as the build stage (rather than guessing
# exact runtime .so package name/version suffixes) keeps this correct across
# Debian releases at the cost of a larger image.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-dev libjansson-dev libssl-dev libconfig-dev \
        libmicrohttpd-dev libwebsockets-dev \
        gettext-base ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# libnice (meson) installs into the multiarch dir directly; libsrtp2 and
# usrsctp (autotools) install straight into /usr/lib.
COPY --from=build /usr/lib/x86_64-linux-gnu/libnice* /usr/lib/x86_64-linux-gnu/
COPY --from=build /usr/lib/libsrtp2* /usr/lib/x86_64-linux-gnu/
COPY --from=build /usr/lib/libusrsctp* /usr/lib/x86_64-linux-gnu/
COPY --from=build /opt/janus /opt/janus
RUN ldconfig

COPY config/*.template /opt/janus/etc/janus/
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# Normalize line endings (Windows checkouts can introduce CRLF, which breaks the shebang) and mark executable.
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8088 8188 7088 8089 8189
# ICE/media port range for regular WebRTC PeerConnections.
EXPOSE 10000-10200/udp
# Separate range for Streaming-plugin rtp_forward targets (webinar fan-out).
EXPOSE 15000-15200/udp

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["/opt/janus/bin/janus", "--configs-folder=/opt/janus/etc/janus"]
