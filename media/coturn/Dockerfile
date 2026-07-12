# Coturn STUN/TURN image for GKE — relay range opened at runtime via NLB.
FROM coturn/coturn:4.6.2

COPY turnserver.conf /etc/coturn/turnserver.conf

# STUN/TURN listeners
EXPOSE 3478/tcp 3478/udp 5349/tcp

# TURN relay UDP load-test range: 20000-29000 (9001 ports).
# Full range is declared in K8s NLB + deployment containerPorts.
