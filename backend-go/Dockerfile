# Build stage
FROM golang:1.24-alpine AS builder
RUN apk add --no-cache protoc protobuf-dev git
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
RUN go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.5.1
WORKDIR /app
COPY backend-go/ .
COPY api/proto/ api/proto/
RUN go mod download
# Regenerate proto files during build to ensure compatibility
RUN protoc -I api/proto \
           --go_out=pb --go_opt=paths=source_relative \
           --go-grpc_out=pb --go-grpc_opt=paths=source_relative \
           api/proto/kzys.proto
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux go build -o signaling-server .

# Runtime stage
FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/signaling-server .
EXPOSE 50051 8080
CMD ["./signaling-server"]
