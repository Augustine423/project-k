// KZYS media-core — C++ Janus orchestrator (native performance path).
// Watches Redis for room mode changes and applies Janus VideoRoom edits:
// publisher caps, bitrate tuning, and aggregate load metrics for KEDA/Karpenter.
#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <ctime>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#include <curl/curl.h>
#include <hiredis/hiredis.h>

namespace {

struct Config {
    std::string redis_host = "redis";
    int redis_port = 6379;
    std::string janus_secret = "janusoverlord";
    int poll_ms = 1000;
    std::map<std::string, std::string> janus_admin_by_node;
};

struct RoomState {
    std::string id;
    std::string janus_node_id;
    std::string janus_room_id;
    std::string secret;
    std::string mode;
    int max_publishers = 50;
};

std::vector<std::string> split_csv(const std::string& raw) {
    std::vector<std::string> out;
    std::stringstream ss(raw);
    std::string item;
    while (std::getline(ss, item, ',')) {
        if (!item.empty()) out.push_back(item);
    }
    return out;
}

static size_t curl_write_cb(char* ptr, size_t size, size_t nmemb, void* userdata) {
    auto* out = static_cast<std::string*>(userdata);
    out->append(ptr, size * nmemb);
    return size * nmemb;
}

std::string env_or(const char* key, const char* fallback) {
    const char* v = std::getenv(key);
    return (v && *v) ? std::string(v) : std::string(fallback);
}

Config load_config() {
    Config cfg;
    const std::string redis_url = env_or("REDIS_URL", "redis://redis:6379");
    if (redis_url.rfind("redis://", 0) == 0) {
        auto host_port = redis_url.substr(8);
        auto colon = host_port.find(':');
        cfg.redis_host = host_port.substr(0, colon);
        if (colon != std::string::npos) {
            cfg.redis_port = std::stoi(host_port.substr(colon + 1));
        }
    }
    cfg.janus_secret = env_or("JANUS_ADMIN_SECRET", "janusoverlord");
    cfg.poll_ms = std::stoi(env_or("MEDIA_CORE_POLL_MS", "1000"));

    const std::string nodes = env_or("JANUS_NODES", "");
    for (const auto& entry : split_csv(nodes)) {
        std::vector<std::string> parts;
        std::stringstream ss(entry);
        std::string part;
        while (std::getline(ss, part, '|')) parts.push_back(part);
        if (parts.size() >= 2) cfg.janus_admin_by_node[parts[0]] = parts[1];
    }
    if (cfg.janus_admin_by_node.empty()) {
        cfg.janus_admin_by_node["janus-1"] = env_or("JANUS_ADMIN_URL", "http://janus:7088/admin");
    }
    return cfg;
}

std::string json_escape(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 8);
    for (char c : s) {
        if (c == '"') out += "\\\"";
        else if (c == '\\') out += "\\\\";
        else out += c;
    }
    return out;
}

std::string extract_json_string(const std::string& json, const std::string& key) {
    const std::string needle = "\"" + key + "\":\"";
    auto pos = json.find(needle);
    if (pos == std::string::npos) return "";
    pos += needle.size();
    auto end = json.find('"', pos);
    if (end == std::string::npos) return "";
    return json.substr(pos, end - pos);
}

int extract_json_int(const std::string& json, const std::string& key, int fallback = 0) {
    const std::string needle = "\"" + key + "\":";
    auto pos = json.find(needle);
    if (pos == std::string::npos) return fallback;
    pos += needle.size();
    while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) pos++;
    return std::atoi(json.c_str() + pos);
}

RoomState parse_room(const std::string& json) {
    RoomState room;
    room.id = extract_json_string(json, "Id");
    if (room.id.empty()) room.id = extract_json_string(json, "id");
    room.janus_node_id = extract_json_string(json, "JanusNodeId");
    if (room.janus_node_id.empty()) room.janus_node_id = extract_json_string(json, "janusNodeId");
    room.janus_room_id = extract_json_string(json, "JanusRoomId");
    if (room.janus_room_id.empty()) room.janus_room_id = extract_json_string(json, "janusRoomId");
    room.secret = extract_json_string(json, "Secret");
    if (room.secret.empty()) room.secret = extract_json_string(json, "secret");
    room.mode = extract_json_string(json, "Mode");
    if (room.mode.empty()) room.mode = extract_json_string(json, "mode");
    room.max_publishers = extract_json_int(json, "MaxPublishers", extract_json_int(json, "maxPublishers", 50));
    return room;
}

bool janus_edit_room(const Config& cfg, const RoomState& room) {
    auto it = cfg.janus_admin_by_node.find(room.janus_node_id);
    if (it == cfg.janus_admin_by_node.end()) {
        std::cerr << "no janus admin for node " << room.janus_node_id << std::endl;
        return false;
    }

    const int bitrate = (room.mode == "webinar") ? 1'500'000 : 2'000'000;
    std::ostringstream body;
    body << "{"
         << "\"janus\":\"message_plugin\","
         << "\"transaction\":\"mc-" << room.id << "\","
         << "\"secret\":\"" << json_escape(cfg.janus_secret) << "\","
         << "\"plugin\":\"janus.plugin.videoroom\","
         << "\"request\":{"
         << "\"request\":\"edit\","
         << "\"room\":\"" << json_escape(room.janus_room_id) << "\","
         << "\"secret\":\"" << json_escape(room.secret) << "\","
         << "\"new_publishers\":" << room.max_publishers << ","
         << "\"new_bitrate\":" << bitrate << ","
         << "\"description\":\"KZYS " << json_escape(room.id) << " [" << json_escape(room.mode) << "]\""
         << "}}";

    CURL* curl = curl_easy_init();
    if (!curl) return false;

    std::string response;
    struct curl_slist* headers = nullptr;
    headers = curl_slist_append(headers, "Content-Type: application/json");

    curl_easy_setopt(curl, CURLOPT_URL, it->second.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body.str().c_str());
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, curl_write_cb);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L);

    const CURLcode rc = curl_easy_perform(curl);
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);

    if (rc != CURLE_OK) {
        std::cerr << "janus edit failed room=" << room.id << " err=" << curl_easy_strerror(rc) << std::endl;
        return false;
    }

    std::cout << "janus edit room=" << room.id << " mode=" << room.mode
              << " publishers=" << room.max_publishers << std::endl;
    return response.find("success") != std::string::npos;
}

bool apply_room_mode(redisContext* ctx, const Config& cfg, const std::string& room_id) {
    const std::string key = "room:" + room_id;
    redisReply* reply = static_cast<redisReply*>(redisCommand(ctx, "GET %s", key.c_str()));
    if (!reply || reply->type != REDIS_REPLY_STRING) {
        if (reply) freeReplyObject(reply);
        return false;
    }

    const RoomState room = parse_room(reply->str);
    freeReplyObject(reply);

    if (room.janus_room_id.empty()) {
        std::cerr << "incomplete room record " << room_id << std::endl;
        return false;
    }

    RoomState mutable_room = room;
    if (mutable_room.secret.empty()) {
        redisReply* secret_reply = static_cast<redisReply*>(
            redisCommand(ctx, "GET room:%s:secret", room_id.c_str()));
        if (secret_reply && secret_reply->type == REDIS_REPLY_STRING) {
            mutable_room.secret = secret_reply->str;
        }
        if (secret_reply) freeReplyObject(secret_reply);
    }

    if (mutable_room.secret.empty()) {
        std::cerr << "missing room secret " << room_id << std::endl;
        return false;
    }

    return janus_edit_room(cfg, mutable_room);
}

void refresh_aggregate_load(redisContext* ctx) {
    redisReply* rooms = static_cast<redisReply*>(redisCommand(ctx, "SMEMBERS kzys:active_rooms"));
    if (!rooms || rooms->type != REDIS_REPLY_ARRAY) {
        if (rooms) freeReplyObject(rooms);
        return;
    }

    long total_load = 0;
    long webinar_rooms = 0;

    for (size_t i = 0; i < rooms->elements; i++) {
        const char* room_id = rooms->element[i]->str;
        redisReply* room_reply = static_cast<redisReply*>(redisCommand(ctx, "GET room:%s", room_id));
        if (!room_reply || room_reply->type != REDIS_REPLY_STRING) {
            if (room_reply) freeReplyObject(room_reply);
            continue;
        }
        const RoomState room = parse_room(room_reply->str);
        freeReplyObject(room_reply);

        redisReply* media = static_cast<redisReply*>(redisCommand(ctx, "HLEN room:%s:media", room_id));
        const long participants = media && media->type == REDIS_REPLY_INTEGER ? media->integer : 0;
        if (media) freeReplyObject(media);

        total_load += std::max(1L, participants / 2);
        if (room.mode == "webinar") {
            webinar_rooms++;
            total_load += std::max(1L, participants / 4);
        }
    }
    freeReplyObject(rooms);

    redisCommand(ctx, "SET kzys:total_node_load %ld", total_load);
    redisCommand(ctx, "SET kzys:webinar_rooms %ld", webinar_rooms);
    redisCommand(ctx, "SET kzys:media_core_heartbeat %ld", static_cast<long>(std::time(nullptr)));
}

}  // namespace

int main() {
    const Config cfg = load_config();
    curl_global_init(CURL_GLOBAL_DEFAULT);

    std::cout << "kzys-media-core starting redis=" << cfg.redis_host << ":" << cfg.redis_port << std::endl;

    while (true) {
        redisContext* ctx = redisConnect(cfg.redis_host.c_str(), cfg.redis_port);
        if (!ctx || ctx->err) {
            std::cerr << "redis connect error, retrying…" << std::endl;
            if (ctx) redisFree(ctx);
            std::this_thread::sleep_for(std::chrono::seconds(2));
            continue;
        }

        while (true) {
            redisReply* reply = static_cast<redisReply*>(
                redisCommand(ctx, "BLPOP kzys:mode:apply_queue %d", std::max(1, cfg.poll_ms / 1000)));
            if (!reply) {
                std::cerr << "redis BLPOP failed" << std::endl;
                break;
            }

            if (reply->type == REDIS_REPLY_ARRAY && reply->elements == 2) {
                const char* room_id = reply->element[1]->str;
                if (room_id) apply_room_mode(ctx, cfg, room_id);
            }
            freeReplyObject(reply);

            refresh_aggregate_load(ctx);
        }

        redisFree(ctx);
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }

    curl_global_cleanup();
    return 0;
}
