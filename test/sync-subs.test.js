const test = require("node:test");
const assert = require("node:assert");
const { timeToMs, msToTime, parseOffset } = require("../sync-subs.js");

test("timeToMs parses HH:MM:SS,mmm to total milliseconds", () => {
  assert.strictEqual(timeToMs("00:00:00,000"), 0);
  assert.strictEqual(timeToMs("00:00:01,500"), 1500);
  assert.strictEqual(timeToMs("01:02:03,004"), 3723004);
});

test("msToTime formats milliseconds back to HH:MM:SS,mmm", () => {
  assert.strictEqual(msToTime(0), "00:00:00,000");
  assert.strictEqual(msToTime(1500), "00:00:01,500");
  assert.strictEqual(msToTime(3723004), "01:02:03,004");
});

test("msToTime clamps negative input to zero", () => {
  assert.strictEqual(msToTime(-5000), "00:00:00,000");
});

test("timeToMs and msToTime round-trip", () => {
  const t = "00:41:59,123";
  assert.strictEqual(msToTime(timeToMs(t)), t);
});

test("parseOffset handles units and sign", () => {
  assert.strictEqual(parseOffset("500"), 500);
  assert.strictEqual(parseOffset("500ms"), 500);
  assert.strictEqual(parseOffset("-2.5s"), -2500);
  assert.strictEqual(parseOffset("1.5sec"), 1500);
  assert.strictEqual(parseOffset("+250ms"), 250);
});

test("parseOffset throws on garbage", () => {
  assert.throws(() => parseOffset("abc"));
  assert.throws(() => parseOffset(""));
});
