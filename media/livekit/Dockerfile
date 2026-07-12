# LiveKit SFU image for GKE — config baked; UDP media range opened at runtime via NLB.
FROM livekit/livekit-server:v1.9.12

COPY livekit.yaml /etc/livekit.yaml

# Signaling (Gateway) + RTC TCP fallback
EXPOSE 7880/tcp 7881/tcp

# WebRTC media UDP load-test range: 50000-59000 (9001 ports).
# Individual UDP ports are not listed here; K8s NLB + deployment containerPorts
# declare the full range. LiveKit binds from port_range_start/end in livekit.yaml.

CMD ["--config", "/etc/livekit.yaml"]
