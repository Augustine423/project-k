# Build stage
FROM golang:1.24-alpine AS builder
RUN apk add --no-cache protoc protobuf-dev git
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
RUN go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Regenerate proto files during build to ensure compatibility
RUN protoc --go_out=. --go_opt=paths=source_relative \
           --go-grpc_out=. --go-grpc_opt=paths=source_relative \
           api/proto/kzys.proto
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux go build -o signaling-server .

# Runtime stage
FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/signaling-server .
EXPOSE 50051 8080
CMD ["./signaling-server"]
