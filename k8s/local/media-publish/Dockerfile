# Laptop-only ICE/TURN port forwarder (not Coturn, not LiveKit).
# Forwards Windows host ports to the kind control-plane on the `kind` Docker network.
FROM alpine:3.20
RUN apk add --no-cache socat
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh
EXPOSE 7881/tcp 3478/tcp 3478/udp 7882/udp 20000/udp
ENTRYPOINT ["/entrypoint.sh"]
