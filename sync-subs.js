#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { parseArgs } = require("util");
const iconv = require("iconv-lite");

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

const USAGE = `Usage: node sync-subs.js <input> [output] [options]

Resynchronize SRT subtitle timings.

  -i, --input <path>      input .srt (or 1st positional)
  -o, --output <path>     output .srt (or 2nd positional;
                          default: "<input>.synced.srt")
      --from <fps>        source frame rate (positive number)
      --to <fps>          target frame rate (positive number)
      --offset <val>      constant shift; +later, -earlier.
                          Units: ms (default), s, sec. e.g. -2.5s, 500ms
      --anchor <old=new>  reference point; give exactly twice.
                          Times as HH:MM:SS,mmm or milliseconds.
      --encoding <enc>    decode input with this encoding (default: utf8)
      --dry-run           print computed params + preview; write nothing
  -h, --help              show this help

Examples:
  node sync-subs.js movie.srt --from 25 --to 23.976
  node sync-subs.js in.srt out.srt --offset -2.5s
  node sync-subs.js in.srt --anchor 00:00:10,000=00:00:12,500 \\
                           --anchor 01:30:00,000=01:30:04,000
`;

function stripBom(str) {
  return str.charCodeAt(0) === 0xfeff ? str.slice(1) : str;
}

function previewCues(original, resynced) {
  const re = /(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/g;
  const before = original.match(re) || [];
  const after = resynced.match(re) || [];
  const lines = [];
  if (before.length > 0) {
    lines.push(`  first: ${before[0]}  ->  ${after[0]}`);
  }
  if (before.length > 1) {
    const i = before.length - 1;
    lines.push(`  last:  ${before[i]}  ->  ${after[i]}`);
  }
  return lines.join("\n");
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      input: { type: "string", short: "i" },
      output: { type: "string", short: "o" },
      from: { type: "string" },
      to: { type: "string" },
      offset: { type: "string" },
      anchor: { type: "string", multiple: true },
      encoding: { type: "string", default: "utf8" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }

  const inputPath = values.input || positionals[0];
  if (!inputPath) {
    console.error(USAGE);
    throw new Error("No input file given.");
  }

  const parsed = path.parse(inputPath);
  const defaultOut = path.join(parsed.dir, `${parsed.name}.synced${parsed.ext || ".srt"}`);
  const outputPath = values.output || positionals[1] || defaultOut;

  const { scale, offset, mode } = resolveScaleOffset({
    from: values.from,
    to: values.to,
    offset: values.offset,
    anchors: values.anchor,
  });

  const buf = fs.readFileSync(inputPath);
  const decoded = stripBom(iconv.decode(buf, values.encoding));

  const { text, count } = applyResync(decoded, scale, offset);

  const summary =
    `[info] mode=${mode} scale=${scale.toFixed(6)} ` +
    `offset=${Math.round(offset)}ms timestamps=${count}`;

  if (values["dry-run"]) {
    console.log(summary);
    console.log("[info] dry run — no file written");
    const preview = previewCues(decoded, text);
    if (preview) {
      console.log(preview);
    }
    return;
  }

  fs.writeFileSync(outputPath, text, "utf8");
  console.log(summary);
  console.log(`Done. Read "${inputPath}", wrote "${outputPath}".`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    if (err.code === "ENOENT") {
      console.error(`Failed to resync file: input not found.`);
      console.error("Make sure the path to the .srt file is correct.");
    } else {
      console.error("Failed to resync file:", err.message);
    }
    process.exit(1);
  }
}
