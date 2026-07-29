import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://127.0.0.1:4000";
const MAX_USERS = Number(__ENV.MAX_USERS || "10000");
const TARGET_VUS = Number(__ENV.TARGET_VUS || "400");

export const options = {
  scenarios: {
    join_storm: {
      executor: "per-vu-iterations",
      vus: TARGET_VUS,
      iterations: TARGET_VUS,
      maxDuration: "3m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<4000"],
    checks: ["rate>0.97"],
  },
};

export function setup() {
  const res = http.post(
    `${BASE}/api/rooms`,
    JSON.stringify({ displayName: "Load Host", maxUsers: MAX_USERS }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(res, { "create room 201": (r) => r.status === 201 });
  if (res.status !== 201) {
    throw new Error(`setup failed: ${res.status} ${res.body}`);
  }
  const body = JSON.parse(res.body);
  return { roomId: body.room.id };
}

export default function (data) {
  const label = `User-${__VU}`;
  const join = http.post(
    `${BASE}/api/rooms/${data.roomId}/join`,
    JSON.stringify({ displayName: label }),
    { headers: { "Content-Type": "application/json" }, tags: { name: "join" } },
  );

  check(join, {
    "join 200": (r) => r.status === 200,
    "not full": (r) => r.status !== 409,
  });

  if (join.status === 200 && __VU % 50 === 0) {
    const countRes = http.get(`${BASE}/api/rooms/${data.roomId}/participants/count`, {
      tags: { name: "count" },
    });
    check(countRes, {
      "count 200": (r) => r.status === 200,
      "count > 0": (r) => {
        try {
          const parsed = JSON.parse(r.body);
          return (parsed.count || 0) > 0;
        } catch (_e) {
          return false;
        }
      },
    });
  }

  sleep(0.01);
}

export function teardown(data) {
  const countRes = http.get(`${BASE}/api/rooms/${data.roomId}/participants/count`);
  if (countRes.status === 200) {
    const parsed = JSON.parse(countRes.body);
    console.log(`final participant count: ${parsed.count || 0}`);
  }
}
