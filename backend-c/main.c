#include <stdio.h>
#include <string.h>
#include <grpcpp/grpcpp.h>
#include "kzys.grpc.pb.h"

using grpc::Server;
using grpc::ServerBuilder;
using grpc::ServerContext;
using grpc::Status;
using kzys::MediaOrchestrator;
using kzys::SessionRequest;
using kzys::SessionResponse;
using kzys::StatusRequest;
using kzys::StatusResponse;

class MediaOrchestratorImpl final : public MediaOrchestrator::Service {
public:
    Status PrepareMediaSession(ServerContext*, const SessionRequest* req,
                               SessionResponse* resp) override {
        printf("[C-backend] PrepareMediaSession room=%s user=%s\n",
               req->room_id().c_str(), req->user_id().c_str());

        resp->set_sdp_answer("v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n");
        resp->set_media_server_endpoint("udp://kzys-backend-c:5000");
        return Status::OK;
    }

    Status StreamStatusUpdate(ServerContext*, const StatusRequest* req,
                              StatusResponse* resp) override {
        printf("[C-backend] StreamStatusUpdate room=%s user=%s status=%s\n",
               req->room_id().c_str(), req->user_id().c_str(), req->status().c_str());
        resp->set_acknowledged(true);
        return Status::OK;
    }
};

int main() {
    std::string addr("0.0.0.0:50051");
    MediaOrchestratorImpl service;

    ServerBuilder builder;
    builder.AddListeningPort(addr, grpc::InsecureServerCredentials());
    builder.RegisterService(&service);

    std::unique_ptr<Server> server(builder.BuildAndStart());
    printf("KZYS C-Backend gRPC server listening on %s\n", addr.c_str());
    server->Wait();
    return 0;
}
