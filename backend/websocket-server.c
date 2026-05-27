/* WebSocket Server for Signaling - Fixed version */
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>

#define PORT 8080
#define BUFFER_SIZE 4096

void handle_websocket_message(int client_fd, const char *message) {
    printf("WebSocket message: %s\n", message);
    
    /* Simple echo for testing */
    char response[BUFFER_SIZE];
    snprintf(response, sizeof(response), 
             "{\"type\":\"echo\",\"message\":\"Received: %s\"}", message);
    
    write(client_fd, response, strlen(response));
}

int main(void) {
    int server_fd, client_fd;
    struct sockaddr_in address;
    int addrlen = sizeof(address);
    char buffer[BUFFER_SIZE];
    
    /* Create socket */
    server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd == 0) {
        perror("socket failed");
        exit(EXIT_FAILURE);
    }
    
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(PORT);
    
    if (bind(server_fd, (struct sockaddr *)&address, sizeof(address)) < 0) {
        perror("bind failed");
        close(server_fd);
        exit(EXIT_FAILURE);
    }
    
    if (listen(server_fd, 3) < 0) {
        perror("listen failed");
        close(server_fd);
        exit(EXIT_FAILURE);
    }
    
    printf("WebSocket server listening on port %d\n", PORT);
    printf("Press Ctrl+C to stop\n");
    
    while (1) {
        client_fd = accept(server_fd, (struct sockaddr *)&address, (socklen_t*)&addrlen);
        if (client_fd < 0) {
            perror("accept failed");
            continue;
        }
        
        /* Read request */
        int bytes = read(client_fd, buffer, BUFFER_SIZE);
        if (bytes > 0) {
            buffer[bytes] = '\0';
            
            /* Check if it's WebSocket handshake */
            if (strstr(buffer, "Upgrade: websocket")) {
                /* Send WebSocket handshake response */
                const char *handshake = 
                    "HTTP/1.1 101 Switching Protocols\r\n"
                    "Upgrade: websocket\r\n"
                    "Connection: Upgrade\r\n"
                    "Sec-WebSocket-Accept: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n";
                write(client_fd, handshake, strlen(handshake));
                
                printf("WebSocket client connected\n");
                
                /* Simple echo loop */
                while (1) {
                    bytes = read(client_fd, buffer, BUFFER_SIZE);
                    if (bytes <= 0) break;
                    
                    buffer[bytes] = '\0';
                    handle_websocket_message(client_fd, buffer);
                }
            }
        }
        
        close(client_fd);
        printf("Client disconnected\n");
    }
    
    close(server_fd);
    return 0;
}
