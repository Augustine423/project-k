/* Media Routing Logic (SFU) */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

typedef struct {
    uint32_t ssrc;
    uint32_t timestamp;
    uint8_t payload[1500];
    size_t length;
} RTPPacket;

typedef struct {
    uint64_t publisher_id;
    uint32_t audio_ssrc;
    uint32_t video_ssrc;
    uint64_t *subscribers;  // Array of subscriber IDs
    int sub_count;
} Stream;

typedef struct {
    uint64_t room_id;
    Stream *streams[50];
    int stream_count;
} RoomMedia;

static RoomMedia rooms[10];
static int room_count = 0;

/* Route RTP packet from publisher to subscribers */
void route_rtp_packet(uint64_t room_id, uint64_t publisher_id, 
                      RTPPacket *packet, uint32_t ssrc) {
    
    /* Find room */
    RoomMedia *room = NULL;
    for (int i = 0; i < room_count; i++) {
        if (rooms[i].room_id == room_id) {
            room = &rooms[i];
            break;
        }
    }
    if (!room) return;
    
    /* Find publisher stream */
    Stream *stream = NULL;
    for (int i = 0; i < room->stream_count; i++) {
        if (room->streams[i]->publisher_id == publisher_id) {
            stream = room->streams[i];
            break;
        }
    }
    if (!stream) return;
    
    /* Forward to all subscribers */
    for (int i = 0; i < stream->sub_count; i++) {
        uint64_t subscriber_id = stream->subscribers[i];
        
        /* In real implementation:
           1. Map publisher SSRC to subscriber SSRC
           2. Adjust timestamp offset
           3. Forward via WebRTC transport
           4. Handle simulcast/bitrate adaptation
        */
        
        printf("Forwarding packet from publisher %lu to subscriber %lu\n",
               publisher_id, subscriber_id);
    }
}

/* Add subscriber to stream */
int subscribe_to_stream(uint64_t room_id, uint64_t publisher_id, 
                        uint64_t subscriber_id) {
    
    for (int i = 0; i < room_count; i++) {
        if (rooms[i].room_id == room_id) {
            RoomMedia *room = &rooms[i];
            
            for (int j = 0; j < room->stream_count; j++) {
                Stream *stream = room->streams[j];
                if (stream->publisher_id == publisher_id) {
                    
                    /* Add subscriber */
                    stream->subscribers = realloc(stream->subscribers, 
                                                 (stream->sub_count + 1) * sizeof(uint64_t));
                    stream->subscribers[stream->sub_count++] = subscriber_id;
                    
                    printf("Subscriber %lu added to publisher %lu in room %lu\n",
                           subscriber_id, publisher_id, room_id);
                    return 0;
                }
            }
        }
    }
    return -1;
}

/* Initialize media router */
void init_media_router(void) {
    printf("Media Router (SFU) initialized\n");
    printf("Functions: RTP routing, SSRC mapping, subscriber management\n");
}

int main(void) {
    init_media_router();
    
    /* Test routing */
    RTPPacket test_packet = {12345, 1000, {0}, 100};
    route_rtp_packet(1234, 1001, &test_packet, 12345);
    
    return 0;
}
