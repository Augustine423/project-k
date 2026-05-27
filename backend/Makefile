CC = gcc
CFLAGS = -Wall -Wextra
TARGETS = websocket-server media-router videoroom-core

all: $(TARGETS)

websocket-server: websocket-server.c
	$(CC) $(CFLAGS) -o $@ $<

media-router: media-router.c
	$(CC) $(CFLAGS) -o $@ $<

videoroom-core: videoroom-core.c videoroom-config.h
	$(CC) $(CFLAGS) -o $@ videoroom-core.c

clean:
	rm -f $(TARGETS)

.PHONY: all clean
