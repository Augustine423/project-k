/* Minimal VideoRoom Core - Adapted from Janus */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdbool.h>
#include "videoroom-config.h"

typedef struct {
    uint64_t room_id;
    char description[256];
    uint32_t max_publishers;
    uint32_t bitrate;
    char audiocodec[32];
    char videocodec[32];
    bool is_private;
    char secret[64];
    char pin[64];
} Room;

typedef struct {
    uint64_t user_id;
    char display[128];
    bool audio_active;
    bool video_active;
    uint32_t audio_ssrc;
    uint32_t video_ssrc;
} Publisher;

typedef struct {
    Room *rooms[MAX_ROOMS];
    int room_count;
} VideoRoomCore;

static VideoRoomCore core = {0};

/* Create a new room */
int create_room(uint64_t room_id, const char *description) {
    if (core.room_count >= MAX_ROOMS) return -1;
    
    Room *room = malloc(sizeof(Room));
    room->room_id = room_id;
    strncpy(room->description, description, sizeof(room->description)-1);
    room->max_publishers = DEFAULT_MAX_PUBLISHERS;
    room->bitrate = DEFAULT_BITRATE;
    strcpy(room->audiocodec, DEFAULT_AUDIOCODEC);
    strcpy(room->videocodec, DEFAULT_VIDEOCODEC);
    room->is_private = false;
    
    core.rooms[core.room_count++] = room;
    printf("Room %lu created: %s\n", room_id, description);
    return 0;
}

/* Join room */
int join_room(uint64_t room_id, uint64_t user_id, const char *display) {
    for (int i = 0; i < core.room_count; i++) {
        if (core.rooms[i]->room_id == room_id) {
            printf("User %lu joined room %lu as '%s'\n", user_id, room_id, display);
            return 0;
        }
    }
    return -1;
}

/* List rooms */
void list_rooms(void) {
    printf("Active rooms (%d):\n", core.room_count);
    for (int i = 0; i < core.room_count; i++) {
        Room *r = core.rooms[i];
        printf("  Room %lu: %s (max publishers: %u)\n", 
               r->room_id, r->description, r->max_publishers);
    }
}

/* Main initialization */
int init_videoroom(void) {
    printf("VideoRoom core initialized\n");
    printf("Default config: %s audio, %s video, %u kbps\n",
           DEFAULT_AUDIOCODEC, DEFAULT_VIDEOCODEC, DEFAULT_BITRATE/1000);
    return 0;
}

int main(void) {
    init_videoroom();
    
    /* Test rooms */
    create_room(1234, "Team Meeting");
    create_room(5678, "Project Discussion");
    
    /* Test joins */
    join_room(1234, 1001, "Alice");
    join_room(1234, 1002, "Bob");
    join_room(5678, 1003, "Charlie");
    
    list_rooms();
    
    return 0;
}
