# srt-encoding-fixer

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
