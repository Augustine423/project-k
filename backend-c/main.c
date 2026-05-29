#include <stdio.h>
#include <signal.h>
#include <unistd.h>

static volatile int running = 1;

static void handle_signal(int sig) {
    (void)sig;
    running = 0;
}

int main(void) {
    signal(SIGTERM, handle_signal);
    signal(SIGINT, handle_signal);

    puts("KZYS C-Backend Media Orchestrator Starting...");
    puts("Waiting for gRPC commands from the Go signaling service...");

    while (running) {
        sleep(1);
    }

    puts("Shutting down.");
    return 0;
}
