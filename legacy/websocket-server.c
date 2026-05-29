/* WebSocket Server using poll() for multiple concurrent connections */
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <poll.h>
#include <fcntl.h>

#define PORT 8080
#define MAX_FDS 1024
#define BUFFER_SIZE 4096

void set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

int main(void) {
    int server_fd, client_fd;
    struct sockaddr_in address;
    struct pollfd fds[MAX_FDS];
    int nfds = 1;
    char buffer[BUFFER_SIZE];

    server_fd = socket(AF_INET, SOCK_STREAM, 0);
    set_nonblocking(server_fd);
    
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(PORT);
    
    bind(server_fd, (struct sockaddr *)&address, sizeof(address));
    listen(server_fd, 10);
    
    fds[0].fd = server_fd;
    fds[0].events = POLLIN;

    printf("Server listening on port %d with poll() concurrency\n", PORT);

    while (1) {
        int ret = poll(fds, nfds, -1);
        if (ret < 0) break;

        for (int i = 0; i < nfds; i++) {
            if (fds[i].revents == 0) continue;

            if (fds[i].fd == server_fd) {
                client_fd = accept(server_fd, NULL, NULL);
                set_nonblocking(client_fd);
                fds[nfds].fd = client_fd;
                fds[nfds].events = POLLIN;
                nfds++;
                printf("New connection: %d\n", client_fd);
            } else {
                int bytes = read(fds[i].fd, buffer, BUFFER_SIZE);
                if (bytes <= 0) {
                    close(fds[i].fd);
                    fds[i] = fds[nfds - 1];
                    nfds--;
                } else {
                    printf("Received %d bytes from %d\n", bytes, fds[i].fd);
                    // Handle message here
                }
            }
        }
    }
    return 0;
}
