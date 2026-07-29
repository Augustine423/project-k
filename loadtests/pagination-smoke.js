import http from "k6/http";
import { check } from "k6";

const BASE = __ENV.BASE_URL || "http://127.0.0.1:4000";

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ["rate==1"],
  },
};

export default function () {
  const create = http.post(
    `${BASE}/api/rooms`,
    JSON.stringify({ displayName: "Pagination Host", maxUsers: 500 }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(create, { create: (r) => r.status === 201 });
  const roomId = JSON.parse(create.body).room.id;

  for (let i = 0; i < 120; i++) {
    const join = http.post(
      `${BASE}/api/rooms/${roomId}/join`,
      JSON.stringify({ displayName: `Member-${i}` }),
      { headers: { "Content-Type": "application/json" } },
    );
    check(join, { [`join ${i}`]: (r) => r.status === 200 });
  }

  const page1 = http.get(`${BASE}/api/rooms/${roomId}/participants?offset=0&limit=50`);
  check(page1, { "page1 200": (r) => r.status === 200 });
  const p1 = JSON.parse(page1.body);
  check(null, {
    "page1 size 50": () => p1.items.length === 50,
    "total 121": () => p1.total === 121,
    "has more": () => p1.hasMore === true,
  });

  const count = http.get(`${BASE}/api/rooms/${roomId}/participants/count`);
  check(count, { "count 200": (r) => r.status === 200 });
  const c = JSON.parse(count.body);
  check(null, { "count matches": () => c.count === 121 });
}
