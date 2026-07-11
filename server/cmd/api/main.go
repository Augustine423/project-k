// Command api is the control-plane entrypoint: loads config, wires up
// Redis, the Janus Admin API clients for each configured media node, the
// room service, and the HTTP/WebSocket router, then serves.
package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"projectk/server/internal/auth"
	"projectk/server/internal/config"
	"projectk/server/internal/httpapi"
	"projectk/server/internal/janusadmin"
	"projectk/server/internal/logger"
	"projectk/server/internal/redisstore"
	"projectk/server/internal/rooms"
	"projectk/server/internal/router"
	"projectk/server/internal/turn"
	"projectk/server/internal/webinar"
	"projectk/server/internal/wshub"
)

func main() {
	log := logger.New()

	cfg, err := config.Load()
	if err != nil {
		log.Error("failed to load config", "err", err)
		os.Exit(1)
	}

	store, err := redisstore.New(cfg.RedisURL)
	if err != nil {
		log.Error("failed to connect to redis", "err", err)
		os.Exit(1)
	}

	janusAdmins := make(map[string]*janusadmin.Client, len(cfg.JanusNodes))
	for _, node := range cfg.JanusNodes {
		janusAdmins[node.ID] = janusadmin.New(node.AdminURL, cfg.JanusAdminSecret)
	}

	nodeRouter := router.New(cfg.JanusNodes, store)
	jwtIssuer := auth.NewIssuer(cfg.JWTSigningSecret)
	turnIssuer := turn.NewIssuer(cfg.TURNSharedSecret, cfg.TURNHost, cfg.TURNPort)

	roomService := rooms.NewService(
		store,
		nodeRouter,
		janusAdmins,
		jwtIssuer,
		turnIssuer,
		cfg.JanusAdminSecret,
		cfg.JanusVideoRoomKey,
		log,
	)

	webinarService := webinar.NewService(
		store,
		nodeRouter,
		janusAdmins,
		cfg.JanusAdminSecret,
		cfg.JanusVideoRoomKey,
		cfg.StreamingPortRangeStart,
		cfg.StreamingPortRangeEnd,
		log,
	)

	hub := wshub.New(log)

	handlers := &httpapi.Handlers{
		Rooms:   roomService,
		Webinar: webinarService,
		Hub:     hub,
		JWT:     jwtIssuer,
		Redis:   store,
		Log:     log,
	}
	hub.SetClientMessageHandler(handlers.HandleWSClientMessage)

	mux := httpapi.NewRouter(handlers, cfg.CORSOrigin)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Info("control plane listening", "port", cfg.Port, "janusNodes", len(cfg.JanusNodes))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	log.Info("shutting down")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}
