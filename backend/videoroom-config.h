/* VideoRoom Configuration */
#ifndef VIDEOROOM_CONFIG_H
#define VIDEOROOM_CONFIG_H

/* Room defaults */
#define DEFAULT_MAX_PUBLISHERS 50
#define DEFAULT_BITRATE 128000
#define DEFAULT_AUDIOCODEC "opus"
#define DEFAULT_VIDEOCODEC "vp8"

/* Network */
#define DEFAULT_WS_PORT 8188
#define DEFAULT_WSS_PORT 8989

/* Limits */
#define MAX_ROOMS 100
#define MAX_PARTICIPANTS_PER_ROOM 100

#endif /* VIDEOROOM_CONFIG_H */
