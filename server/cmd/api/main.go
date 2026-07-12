// Command api is the control-plane entrypoint: Redis room registry, LiveKit
// token issuance, and HTTP/WebSocket signaling for chat and host controls.
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
	"projectk/server/internal/livekit"
	"projectk/server/internal/logger"
	"projectk/server/internal/redisstore"
	"projectk/server/internal/rooms"
	"projectk/server/internal/turn"
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

	jwtIssuer := auth.NewIssuer(cfg.JWTSigningSecret)
	lkIssuer := livekit.NewTokenIssuer(cfg.LiveKitAPIKey, cfg.LiveKitAPISecret, cfg.LiveKitPublicURL)
	turnIssuer := turn.NewIssuer(cfg.TURNSharedSecret, cfg.TURNHost, cfg.TURNPort, cfg.TURNTLSPort, cfg.TURNUseTLS)

	roomService := rooms.NewService(
		store,
		jwtIssuer,
		lkIssuer,
		turnIssuer,
		cfg.MaxRoomParticipants,
		log,
	)

	hub := wshub.New(log)

	handlers := &httpapi.Handlers{
		Rooms:       roomService,
		Hub:         hub,
		JWT:         jwtIssuer,
		Redis:       store,
		Log:         log,
		ServiceName: cfg.ServiceName,
		MediaHost:   cfg.TURNHost,
	}
	hub.SetClientMessageHandler(handlers.HandleWSClientMessage)

	mux := httpapi.NewRouter(handlers, cfg.CORSOrigin)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Info("control plane listening", "port", cfg.Port, "maxParticipants", cfg.MaxRoomParticipants)
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
