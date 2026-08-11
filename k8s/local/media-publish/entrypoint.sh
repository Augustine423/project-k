#!/bin/sh
set -eu
: "${CP_IP:?CP_IP must be the kind control-plane IP on the kind Docker network}"

socat TCP4-LISTEN:7881,bind=0.0.0.0,fork,reuseaddr TCP4:"${CP_IP}":7881 &
socat TCP4-LISTEN:3478,bind=0.0.0.0,fork,reuseaddr TCP4:"${CP_IP}":3478 &
socat UDP4-LISTEN:3478,bind=0.0.0.0,fork,reuseaddr UDP4:"${CP_IP}":3478 &
socat UDP4-LISTEN:7882,bind=0.0.0.0,fork,reuseaddr UDP4:"${CP_IP}":7882 &
socat UDP4-LISTEN:20000,bind=0.0.0.0,fork,reuseaddr UDP4:"${CP_IP}":20000 &
wait
