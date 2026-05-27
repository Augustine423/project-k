/* Basic Room Management Structure */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_ROOMS 10
#define MAX_USERS_PER_ROOM 20

typedef struct {
    int room_id;
    int users[MAX_USERS_PER_ROOM];
    int user_count;
} Room;

Room room_registry[MAX_ROOMS];
int room_count = 0;

void add_user_to_room(int room_id, int user_id) {
    for (int i = 0; i < room_count; i++) {
        if (room_registry[i].room_id == room_id) {
            if (room_registry[i].user_count < MAX_USERS_PER_ROOM) {
                room_registry[i].users[room_registry[i].user_count++] = user_id;
                printf("User %d joined room %d\n", user_id, room_id);
            }
            return;
        }
    }
    // New room
    if (room_count < MAX_ROOMS) {
        room_registry[room_count].room_id = room_id;
        room_registry[room_count].users[0] = user_id;
        room_registry[room_count].user_count = 1;
        room_count++;
        printf("Created room %d and added user %d\n", room_id, user_id);
    }
}
