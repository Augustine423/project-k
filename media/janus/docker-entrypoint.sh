#!/bin/sh
set -eu

# Renders the *.jcfg.template files (see config/) into real Janus configs,
# substituting only the variables we explicitly reference -- envsubst with a
# variable list, so any literal "${...}" Janus itself might expect elsewhere
# is left untouched.

: "${JANUS_NODE_ID:=janus-node-1}"
: "${JANUS_RTP_PORT_RANGE:=10000-10200}"
# Separate from JANUS_RTP_PORT_RANGE (which is the ICE/media port range for
# regular WebRTC PeerConnections): this range is only used for the
# Streaming plugin's rtp_forward targets in webinar/broadcast fan-out (see
# server/internal/webinar), so the two pools never collide on the same node.
: "${JANUS_STREAMING_PORT_RANGE:=15000-15200}"
: "${STUN_SERVER:=stun.l.google.com}"
: "${JANUS_ADMIN_SECRET:=changeme-admin-secret}"
: "${JANUS_VIDEOROOM_ADMIN_KEY:=changeme-videoroom-key}"
: "${JANUS_CORS_ORIGIN:=*}"

export JANUS_NODE_ID JANUS_RTP_PORT_RANGE JANUS_STREAMING_PORT_RANGE STUN_SERVER \
    JANUS_ADMIN_SECRET JANUS_VIDEOROOM_ADMIN_KEY JANUS_CORS_ORIGIN

VARS='${JANUS_NODE_ID} ${JANUS_RTP_PORT_RANGE} ${JANUS_STREAMING_PORT_RANGE} ${STUN_SERVER} ${JANUS_ADMIN_SECRET} ${JANUS_VIDEOROOM_ADMIN_KEY} ${JANUS_CORS_ORIGIN}'

for template in /opt/janus/etc/janus/*.jcfg.template; do
    out="${template%.template}"
    envsubst "$VARS" < "$template" > "$out"
done

exec "$@"
