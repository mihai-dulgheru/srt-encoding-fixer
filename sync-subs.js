#!/usr/bin/env node

function timeToMs(timeStr) {
  const [h, m, sMs] = timeStr.split(":");
  const [s, ms] = sMs.split(",");
  return (
    Number(h) * 3600000 +
    Number(m) * 60000 +
    Number(s) * 1000 +
    Number(ms)
  );
}

function msToTime(ms) {
  let t = Math.trunc(ms);
  if (t < 0) {
    t = 0;
  }
  const h = Math.floor(t / 3600000);
  t %= 3600000;
  const m = Math.floor(t / 60000);
  t %= 60000;
  const s = Math.floor(t / 1000);
  const rem = t % 1000;
  const pad = (n, width) => String(n).padStart(width, "0");
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(rem, 3)}`;
}

function parseOffset(str) {
  const match = /^([+-]?\d+(?:\.\d+)?)\s*(ms|sec|s)?$/i.exec(String(str).trim());
  if (!match) {
    throw new Error(`Invalid --offset value: "${str}"`);
  }
  const value = Number(match[1]);
  const unit = (match[2] || "ms").toLowerCase();
  const factor = unit === "s" || unit === "sec" ? 1000 : 1;
  return value * factor;
}

module.exports = { timeToMs, msToTime, parseOffset };
