# srt-encoding-fixer

[![CI](https://github.com/mihai-dulgheru/srt-encoding-fixer/actions/workflows/ci.yml/badge.svg)](https://github.com/mihai-dulgheru/srt-encoding-fixer/actions/workflows/ci.yml)

Small Node.js CLI tool to fix broken Romanian `.srt` subtitle files:

- Detects the correct encoding (UTF-8, Windows-1250/1252, or common mojibake patterns).
- Normalizes Romanian diacritics (ș/ț with comma instead of ş/ţ with cedilla).
- Outputs clean UTF-8 SRT files.

## Installation

```bash
npm install
```

## Usage

```bash
node fix-subs.js input.srt output-fixed.srt            # auto-detect
node fix-subs.js input.srt output-fixed.srt cp1250     # force cp1250
node fix-subs.js input.srt output-fixed.srt mojibake   # force mojibake scenario
```

Example:

```bash
node fix-subs.js srt/jerry-broken.srt srt/jerry-fixed.srt
```

## Resync timing

`sync-subs.js` fixes subtitle _timing_ (frame-rate mismatch or drift), separate
from encoding. Every timestamp is transformed by `new = old * scale + offset`.

```bash
# Frame-rate conversion (e.g. PAL 25fps source retimed for 23.976fps video)
node sync-subs.js movie.srt --from 25 --to 23.976

# Constant shift: push all lines 2.5s earlier (+ = later, - = earlier).
# Negative values must use the = form so the leading - isn't read as a flag.
node sync-subs.js in.srt out.srt --offset=-2.5s

# Two-point anchor: give the correct time of the first and last line;
# scale and offset are derived automatically.
node sync-subs.js in.srt \
  --anchor 00:00:10,000=00:00:12,500 \
  --anchor 01:30:00,000=01:30:04,000

# Preview without writing
node sync-subs.js movie.srt --from 25 --to 23.976 --dry-run
```

Options: `-i/--input`, `-o/--output` (default `<input>.synced.srt`), `--from`,
`--to`, `--offset` (units `ms`/`s`/`sec`), `--anchor` (twice), `--encoding`
(default `utf8`), `--dry-run`, `-h/--help`.

If the input encoding is also broken, run `fix-subs.js` first, then
`sync-subs.js`.
