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

function parseAnchorTime(str) {
  const s = String(str).trim();
  if (/^\d+$/.test(s)) {
    return Number(s);
  }
  if (/^\d{2}:\d{2}:\d{2},\d{3}$/.test(s)) {
    return timeToMs(s);
  }
  throw new Error(`Invalid anchor time: "${str}" (use HH:MM:SS,mmm or ms)`);
}

function resolveScaleOffset(opts) {
  const anchors = opts.anchors || [];
  const hasFrom = opts.from !== undefined;
  const hasTo = opts.to !== undefined;
  const hasOffset = opts.offset !== undefined;

  if (anchors.length > 0) {
    if (hasFrom || hasTo || hasOffset) {
      throw new Error("--anchor cannot be combined with --from/--to/--offset.");
    }
    if (anchors.length !== 2) {
      throw new Error("--anchor must be given exactly two times.");
    }
    const points = anchors.map((a) => {
      const eq = a.indexOf("=");
      if (eq === -1) {
        throw new Error(`Invalid --anchor "${a}" (expected old=new).`);
      }
      return {
        old: parseAnchorTime(a.slice(0, eq)),
        neu: parseAnchorTime(a.slice(eq + 1)),
      };
    });
    if (points[0].old === points[1].old) {
      throw new Error("--anchor points must have non-identical old times.");
    }
    const scale =
      (points[1].neu - points[0].neu) / (points[1].old - points[0].old);
    const offset = points[0].neu - scale * points[0].old;
    return { scale, offset, mode: "anchor" };
  }

  if (hasFrom !== hasTo) {
    throw new Error("Specify both --from and --to (source and target fps).");
  }

  let scale = 1;
  if (hasFrom && hasTo) {
    const from = Number(opts.from);
    const to = Number(opts.to);
    if (!Number.isFinite(from) || from <= 0 || !Number.isFinite(to) || to <= 0) {
      throw new Error("--from and --to must be positive numbers.");
    }
    scale = from / to;
  }

  const offset = hasOffset ? parseOffset(opts.offset) : 0;

  if (scale === 1 && offset === 0) {
    throw new Error(
      "Nothing to do: specify --from/--to, --offset, or two --anchor points.",
    );
  }

  let mode;
  if (scale !== 1 && offset !== 0) {
    mode = "fps+offset";
  } else if (scale !== 1) {
    mode = "fps";
  } else {
    mode = "offset";
  }
  return { scale, offset, mode };
}

const TIMING_RE =
  /(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/g;

function applyResync(text, scale, offset) {
  let count = 0;
  const out = text.replace(TIMING_RE, (m, start, end) => {
    count += 1;
    const newStart = msToTime(Math.round(timeToMs(start) * scale + offset));
    const newEnd = msToTime(Math.round(timeToMs(end) * scale + offset));
    return `${newStart} --> ${newEnd}`;
  });
  return { text: out, count };
}

module.exports = { timeToMs, msToTime, parseOffset, resolveScaleOffset, applyResync };
