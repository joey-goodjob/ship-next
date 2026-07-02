import assert from "node:assert/strict";

import {
  getClarityAnalyticsData,
  normalizeClarityDays,
} from "../src/modules/clarity-analytics/service";

async function testClampsRequestedDays() {
  assert.equal(normalizeClarityDays("2"), 2);
  assert.equal(normalizeClarityDays("99"), 3);
  assert.equal(normalizeClarityDays("bad"), 1);
  assert.equal(normalizeClarityDays(null), 1);
}

async function testMissingTokenSkipsExternalRequest() {
  let called = false;
  const data = await getClarityAnalyticsData({
    days: "1",
    token: "",
    fetchFn: async () => {
      called = true;
      throw new Error("should not fetch without a token");
    },
  });

  assert.equal(called, false);
  assert.equal(data.configured, false);
  assert.equal(data.error, "missing_token");
  assert.deepEqual(data.groups, []);
}

async function testFetchesAndNormalizesClarityPayload() {
  const calls: string[] = [];
  const data = await getClarityAnalyticsData({
    days: "2",
    token: "test-token",
    fetchFn: async (input, init) => {
      calls.push(String(input));
      assert.equal(init?.headers?.Authorization, "Bearer test-token");

      return new Response(
        JSON.stringify([
          {
            metricName: "PopularPages",
            information: [
              { url: "/create", sessionsCount: "8", pagesPerSession: "2.5" },
              { url: "/", sessionsCount: 5 },
            ],
          },
          {
            metricName: "Browser",
            information: [{ name: "Chrome", sessionsCount: 7 }],
          },
        ]),
        { status: 200 }
      );
    },
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0], /numOfDays=2/);
  assert.equal(data.configured, true);
  assert.equal(data.days, 2);
  assert.equal(data.groups.length, 2);
  assert.equal(data.groups[0].label, "Popular Pages");
  assert.equal(data.groups[0].rows[0].label, "/create");
  assert.equal(data.groups[0].rows[0].metrics.sessionsCount, 8);
  assert.equal(data.groups[0].rows[0].metrics.pagesPerSession, 2.5);
}

async function testExternalErrorIsReturnedAsData() {
  const data = await getClarityAnalyticsData({
    days: "1",
    token: "test-token",
    fetchFn: async () =>
      new Response(JSON.stringify({ message: "Too many requests" }), {
        status: 429,
      }),
  });

  assert.equal(data.configured, true);
  assert.equal(data.error, "clarity_request_failed");
  assert.equal(data.status, 429);
  assert.equal(data.groups.length, 0);
}

async function testNetworkErrorIsReturnedAsData() {
  const data = await getClarityAnalyticsData({
    days: "1",
    token: "test-token",
    fetchFn: async () => {
      throw new Error("network down");
    },
  });

  assert.equal(data.configured, true);
  assert.equal(data.error, "clarity_request_failed");
  assert.equal(data.message, "network down");
  assert.equal(data.groups.length, 0);
}

async function run() {
  await testClampsRequestedDays();
  await testMissingTokenSkipsExternalRequest();
  await testFetchesAndNormalizesClarityPayload();
  await testExternalErrorIsReturnedAsData();
  await testNetworkErrorIsReturnedAsData();
  console.log("clarity analytics service tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
