/* Minimal VideoRoom Plugin Interface */
#ifndef VIDEOROOM_PLUGIN_H
#define VIDEOROOM_PLUGIN_H

#include <stdint.h>
#include <stdbool.h>

/* Room structure */
typedef struct {
    uint64_t room_id;
    char *description;
    uint32_t max_publishers;
    uint32_t bitrate;
    char *audiocodec;
    char *videocodec;
    bool is_private;
    char *secret;
    char *pin;
} videoroom_room;

/* Publisher structure */
typedef struct {
    uint64_t user_id;
    char *display;
    bool audio_active;
    bool video_active;
    uint32_t audio_ssrc;
    uint32_t video_ssrc;
} videoroom_publisher;

/* Subscriber structure */
typedef struct {
    uint64_t user_id;
    uint64_t publisher_id;
    uint32_t audio_ssrc;
    uint32_t video_ssrc;
} videoroom_subscriber;

/* Plugin interface */
typedef struct {
    /* Room management */
    int (*create_room)(videoroom_room *room);
    int (*destroy_room)(uint64_t room_id);
    videoroom_room* (*get_room)(uint64_t room_id);
    
    /* Participant management */
    int (*join_room)(uint64_t room_id, uint64_t user_id, const char *display);
    int (*leave_room)(uint64_t room_id, uint64_t user_id);
    
    /* Media handling */
    int (*publish_stream)(uint64_t room_id, uint64_t user_id, 
                         uint32_t audio_ssrc, uint32_t video_ssrc);
    int (*subscribe_stream)(uint64_t room_id, uint64_t subscriber_id, 
                           uint64_t publisher_id);
    
    /* Room listing */
    videoroom_room** (*list_rooms)(int *count);
} videoroom_plugin;

/* Create plugin instance */
videoroom_plugin* create_videoroom_plugin(void);

#endif /* VIDEOROOM_PLUGIN_H */
