// Package logger provides a single shared structured logger (stdlib slog,
// JSON output) so container logs are easy to ship to any log aggregator.
package logger

import (
	"log/slog"
	"os"
)

func New() *slog.Logger {
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	return slog.New(handler)
}
