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

const { resolveScaleOffset } = require("../sync-subs.js");

test("resolveScaleOffset: fps stretch 25 -> 23.976", () => {
  const r = resolveScaleOffset({ from: "25", to: "23.976" });
  assert.strictEqual(r.mode, "fps");
  assert.ok(Math.abs(r.scale - 25 / 23.976) < 1e-12);
  assert.strictEqual(r.offset, 0);
});

test("resolveScaleOffset: constant offset only", () => {
  const r = resolveScaleOffset({ offset: "-2.5s" });
  assert.strictEqual(r.mode, "offset");
  assert.strictEqual(r.scale, 1);
  assert.strictEqual(r.offset, -2500);
});

test("resolveScaleOffset: fps + offset compose", () => {
  const r = resolveScaleOffset({ from: "25", to: "23.976", offset: "500ms" });
  assert.strictEqual(r.mode, "fps+offset");
  assert.strictEqual(r.offset, 500);
});

test("resolveScaleOffset: two-point anchor derives scale and offset", () => {
  // old 0ms -> new 1000ms, old 10000ms -> new 11000ms => scale 1, offset 1000
  const r = resolveScaleOffset({ anchors: ["0=1000", "10000=11000"] });
  assert.strictEqual(r.mode, "anchor");
  assert.ok(Math.abs(r.scale - 1) < 1e-12);
  assert.ok(Math.abs(r.offset - 1000) < 1e-9);
});

test("resolveScaleOffset: anchor accepts timestamp strings", () => {
  const r = resolveScaleOffset({
    anchors: ["00:00:00,000=00:00:02,000", "00:10:00,000=00:10:02,000"],
  });
  assert.ok(Math.abs(r.scale - 1) < 1e-12);
  assert.ok(Math.abs(r.offset - 2000) < 1e-9);
});

test("resolveScaleOffset: errors", () => {
  assert.throws(() => resolveScaleOffset({}), /Nothing to do/);
  assert.throws(
    () => resolveScaleOffset({ from: "25" }),
    /both --from and --to/,
  );
  assert.throws(() => resolveScaleOffset({ from: "0", to: "24" }), /positive/);
  assert.throws(() => resolveScaleOffset({ anchors: ["1=2"] }), /exactly two/);
  assert.throws(
    () => resolveScaleOffset({ anchors: ["5=1", "5=2"] }),
    /identical/,
  );
  assert.throws(
    () => resolveScaleOffset({ anchors: ["0=1", "10=2"], offset: "500" }),
    /cannot be combined/,
  );
});

const { applyResync } = require("../sync-subs.js");

const SAMPLE =
  "1\n" +
  "00:00:10,000 --> 00:00:12,000\n" +
  "Hello there.\n" +
  "\n" +
  "2\n" +
  "00:41:00,000 --> 00:41:02,000\n" +
  "General Kenobi.\n";

test("applyResync stretches 25 -> 23.976 (round-half-up), values hand-verified", () => {
  const scale = 25 / 23.976;
  const { text, count } = applyResync(SAMPLE, scale, 0);
  assert.strictEqual(count, 2);
  // 10000 * 25/23.976 = 10427.09 -> 10427 ; 12000 -> 12512.51 -> 12513
  assert.match(text, /00:00:10,427 --> 00:00:12,513/);
  // 2460000 -> 2565065.07 -> 2565065 ; 2462000 -> 2567150.48 -> 2567150
  assert.match(text, /00:42:45,065 --> 00:42:47,150/);
  assert.match(text, /Hello there\./);
  assert.match(text, /General Kenobi\./);
});

test("applyResync applies constant offset and clamps negatives", () => {
  const { text } = applyResync(SAMPLE, 1, -15000);
  // 10000 - 15000 = -5000 -> clamp 0
  assert.match(text, /00:00:00,000 --> 00:00:00,000/);
});

test("applyResync leaves non-timing lines untouched", () => {
  const { text } = applyResync(SAMPLE, 1, 1000);
  assert.match(text, /^1$/m);
  assert.match(text, /^2$/m);
});
