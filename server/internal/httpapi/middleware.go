package httpapi

import (
	"context"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"projectk/server/internal/auth"
	"projectk/server/internal/rooms"
)

// hostRoles are the auth.Role string values allowed to perform host-level
// actions -- kept in sync with rooms.RoleHost / rooms.RoleCoHost.
var hostRoles = map[auth.Role]bool{
	auth.Role(rooms.RoleHost):   true,
	auth.Role(rooms.RoleCoHost): true,
}

type ctxKey string

const claimsCtxKey ctxKey = "claims"

// requireHost verifies the caller's JWT, checks it matches the room in the
// URL, and checks the role is allowed to perform host-level actions.
func (h *Handlers) requireHost(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		token := strings.TrimPrefix(authHeader, "Bearer ")
		if token == "" || token == authHeader {
			writeError(w, http.StatusUnauthorized, "missing bearer token")
			return
		}
		claims, err := h.JWT.Verify(token)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid token")
			return
		}
		roomID := chi.URLParam(r, "roomID")
		if claims.RoomID != roomID {
			writeError(w, http.StatusForbidden, "token does not match room")
			return
		}
		if !hostRoles[claims.Role] {
			writeError(w, http.StatusForbidden, "host privileges required")
			return
		}
		ctx := context.WithValue(r.Context(), claimsCtxKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func claimsFromContext(ctx context.Context) *auth.Claims {
	claims, _ := ctx.Value(claimsCtxKey).(*auth.Claims)
	return claims
}

// requireParticipant verifies the caller's JWT matches the room in the URL,
// without restricting to host roles -- used for actions any admitted
// participant (publisher or viewer) can trigger, like reporting their own
// publish streams for webinar fan-out.
func (h *Handlers) requireParticipant(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		token := strings.TrimPrefix(authHeader, "Bearer ")
		if token == "" || token == authHeader {
			writeError(w, http.StatusUnauthorized, "missing bearer token")
			return
		}
		claims, err := h.JWT.Verify(token)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid token")
			return
		}
		if claims.RoomID != chi.URLParam(r, "roomID") {
			writeError(w, http.StatusForbidden, "token does not match room")
			return
		}
		ctx := context.WithValue(r.Context(), claimsCtxKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
