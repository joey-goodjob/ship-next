import assert from "node:assert/strict";

import {
  aggregateBugRadarEvents,
  deriveBugRadarPriority,
  normalizeBugRadarMessage,
  type BugRadarEventLike,
} from "../src/modules/bug-radar/service";

const now = new Date("2026-07-02T14:30:00.000Z");

const events: BugRadarEventLike[] = [
  {
    eventType: "upload_failed",
    severity: "error",
    flow: "mp3_upload",
    action: "upload_failed",
    pathname: "/create",
    visitorId: "visitor-a",
    userId: "user-a",
    userName: "Alice",
    userEmail: "alice@example.com",
    message: "Storage is required for audio uploads in production",
    userAgent: "Mozilla/5.0 Chrome/125.0.0.0",
    source: "client",
    createdAt: new Date("2026-07-02T14:20:00.000Z"),
  },
  {
    eventType: "upload_failed",
    severity: "error",
    flow: "mp3_upload",
    action: "upload_failed",
    pathname: "/create",
    visitorId: "visitor-b",
    userId: "user-b",
    message: "Storage is required for audio uploads in production",
    userAgent: "Mozilla/5.0 Chrome/125.0.0.0",
    source: "api",
    createdAt: new Date("2026-07-02T14:25:00.000Z"),
  },
  {
    eventType: "audio_duration_failed",
    severity: "error",
    flow: "mp3_upload",
    action: "decode_audio",
    pathname: "/",
    visitorId: "visitor-c",
    message: "Unable to decode audio waveform",
    userAgent: "Mozilla/5.0 Version/17.0 Mobile Safari/605.1.15",
    source: "client",
    createdAt: new Date("2026-07-02T13:10:00.000Z"),
  },
  {
    eventType: "upload_failed",
    severity: "error",
    flow: "mp3_upload",
    action: "upload_failed",
    pathname: "/create",
    visitorId: "admin-test",
    message: "Storage is required for audio uploads in production",
    userAgent: "Mozilla/5.0 Chrome/125.0.0.0",
    source: "admin_test",
    isTest: true,
    createdAt: new Date("2026-07-02T14:28:00.000Z"),
  },
];

assert.equal(
  normalizeBugRadarMessage("TypeError: Cannot read properties of undefined (reading 'foo')"),
  "TypeError: Cannot read properties of undefined",
);

assert.equal(deriveBugRadarPriority({ eventType: "generation_failed", severity: "error", affectedUsers: 1, count: 1 }), "critical");
assert.equal(deriveBugRadarPriority({ eventType: "user_error_visible", severity: "warning", affectedUsers: 1, count: 1 }), "high");
assert.equal(deriveBugRadarPriority({ eventType: "resource_load_failed", severity: "warning", affectedUsers: 1, count: 1 }), "medium");

const radar = aggregateBugRadarEvents(events, { now, includeTestEvents: true });

assert.equal(radar.summary.totalEvents, 4);
assert.equal(radar.summary.realEvents, 3);
assert.equal(radar.summary.testEvents, 1);
assert.equal(radar.summary.affectedUsers, 3);

assert.equal(radar.problems[0].eventType, "upload_failed");
assert.equal(radar.problems[0].pathname, "/create");
assert.equal(radar.problems[0].count, 3);
assert.equal(radar.problems[0].affectedUsers, 3);
assert.equal(radar.problems[0].realAffectedUsers, 2);
assert.equal(radar.problems[0].testEvents, 1);
assert.equal(radar.problems[0].priority, "critical");
assert.equal(radar.problems[0].browserSummary, "Chrome");
assert.match(radar.problems[0].summary, /Storage is required/);
assert.deepEqual(radar.problems[0].affectedUsersList.find((item) => item.id === "user-a"), {
  id: "user-a",
  label: "alice@example.com",
  email: "alice@example.com",
  name: "Alice",
  eventCount: 1,
});
assert.equal(radar.problems[0].examples.find((item) => item.userId === "user-a")?.userEmail, "alice@example.com");
assert.equal(radar.problems[0].examples.find((item) => item.userId === "user-a")?.userName, "Alice");

const flow = radar.flows.find((item) => item.flow === "mp3_upload");
assert.ok(flow);
assert.equal(flow?.events, 4);
assert.equal(flow?.failures, 4);

console.log("bug radar rules tests passed");
