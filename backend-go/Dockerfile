# Build stage
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY backend-go/go.mod backend-go/go.sum ./
RUN go mod download
COPY backend-go/ .
RUN CGO_ENABLED=0 GOOS=linux go build -o signaling-server main.go

# Final stage
FROM alpine:latest
WORKDIR /root/
COPY --from=builder /app/signaling-server .
EXPOSE 8080
CMD ["./signaling-server"]
