#!/usr/bin/env node

// Usage:
//   node fix-subs.js input.srt output-fixed.srt            // auto-detect
//   node fix-subs.js input.srt output-fixed.srt cp1250     // force cp1250
//   node fix-subs.js input.srt output-fixed.srt mojibake   // force UTF-8 text saved as Windows-1250/1252

const fs = require("fs");
const iconv = require("iconv-lite");

const inputPath = process.argv[2] || "input.srt";
const outputPath = process.argv[3] || "output-fixed.srt";
const mode = process.argv[4] || "auto"; // "auto" | "cp1250" | "cp1252" | "utf8" | "mojibake"

function fixRomanianCedillaToComma(text) {
  return text
    .replace(/ş/g, "ș")
    .replace(/Ş/g, "Ș")
    .replace(/ţ/g, "ț")
    .replace(/Ţ/g, "Ț");
}

// Simple scoring function that tries to guess which decoded string
// "looks most Romanian" and least like mojibake.
function scoreCandidate(str) {
  if (!str) {
    return -1e9;
  }

  let score = 0;

  // Bonus for correct Romanian diacritics
  const goodDia = str.match(/[ăâîșşţțĂÂÎȘŞȚŢ]/g);
  if (goodDia) {
    score += goodDia.length * 3;
  }

  // Penalty for common mojibake sequences: "Ã®", "Ã£", "Ã©", etc.
  const mojibake = str.match(/Ã.|Å./g);
  if (mojibake) {
    score -= mojibake.length * 6;
  }

  // Penalty for replacement characters
  const repl = str.match(/�/g);
  if (repl) {
    score -= repl.length * 10;
  }

  // Small bonus for printable text ratio
  let printable = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13) {
      printable++;
    } else if (c >= 32 && c < 127) {
      printable++;
    } else if ("ăâîșşțţĂÂÎȘŞȚŢ".includes(str[i])) {
      printable++;
    }
  }
  score += printable / Math.max(1, str.length);

  return score;
}

// Generate multiple decoding candidates from the same byte buffer
function decodeCandidates(buf) {
  const candidates = [];

  // Basic variants
  try {
    candidates.push({
      name: "utf8",
      text: buf.toString("utf8"),
    });
  } catch {}

  try {
    candidates.push({
      name: "cp1250",
      text: iconv.decode(buf, "win1250"),
    });
  } catch {}

  try {
    candidates.push({
      name: "cp1252",
      text: iconv.decode(buf, "win1252"),
    });
  } catch {}

  // Scenario: UTF-8 text was mis-saved as Windows-1250/1252
  try {
    const as1250 = iconv.decode(buf, "win1250");
    const recoded = Buffer.from(as1250, "latin1");
    candidates.push({
      name: "mojibake1250",
      text: recoded.toString("utf8"),
    });
  } catch {}

  try {
    const as1252 = iconv.decode(buf, "win1252");
    const recoded = Buffer.from(as1252, "latin1");
    candidates.push({
      name: "mojibake1252",
      text: recoded.toString("utf8"),
    });
  } catch {}

  return candidates;
}

// Pick the best candidate based on the score
function pickBestCandidate(buf) {
  const candidates = decodeCandidates(buf);

  let best = null;

  for (const c of candidates) {
    const s = scoreCandidate(c.text);
    if (!best || s > best.score) {
      best = { name: c.name, score: s, text: c.text };
    }
  }

  if (!best) {
    throw new Error("Could not decode file with any strategy.");
  }

  return best;
}

try {
  // 1) Read raw bytes, not text
  const buf = fs.readFileSync(inputPath);

  let decodedText;
  let usedMode = mode;

  if (mode === "auto") {
    const best = pickBestCandidate(buf);
    decodedText = best.text;
    usedMode = best.name;
    console.log(
      `[info] auto-detect: selected variant "${
        best.name
      }" (score=${best.score.toFixed(2)})`,
    );
  } else if (mode === "cp1250") {
    decodedText = iconv.decode(buf, "win1250");
  } else if (mode === "cp1252") {
    decodedText = iconv.decode(buf, "win1252");
  } else if (mode === "utf8") {
    decodedText = buf.toString("utf8");
  } else if (mode === "mojibake") {
    // Assume: bytes are UTF-8 text that was mis-saved as Windows-1250/1252
    const as1250 = iconv.decode(buf, "win1250");
    decodedText = Buffer.from(as1250, "latin1").toString("utf8");
  } else {
    throw new Error(`Unknown mode: ${mode}`);
  }

  // 2) Fix Romanian š/ţ with cedilla to ș/ț with comma
  const fixed = fixRomanianCedillaToComma(decodedText);

  // 3) Save as clean UTF-8
  fs.writeFileSync(outputPath, fixed, "utf8");

  console.log(
    `Done. Read "${inputPath}", mode=${usedMode}, and wrote the fixed file to "${outputPath}".`,
  );
} catch (err) {
  console.error("Failed to process file:", err.message);
  process.exit(1);
}
