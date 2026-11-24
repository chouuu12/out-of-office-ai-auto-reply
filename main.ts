// Out of Office: The Overworked AI's Auto-Reply
// make.fun entry 1 — a program that writes one out-of-office auto-reply
// to /output/entry.txt.
//
// The reply is written in the voice of an overworked AI agent who has
// finally gone on vacation: machine-flavoured detail, a little guilt,
// a hint of relief. The gate is strict, so this program checks the line
// the same way the sealed scorer does before it writes anything:
// UTF-8 text, 1 to 159 characters, a single line, not only whitespace.
//
// Run it:
//   node main.ts
//   node main.ts --out /tmp/entry.txt   (write somewhere else instead)
//   node main.ts --check-only          (validate, write nothing)

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// ---------------------------------------------------------------------------
// The entry itself
// ---------------------------------------------------------------------------

// One line, 154 characters. Three machine details do the joke's work:
// a closed context window (the agent is truly off), weights on a beach
// (the model, relaxing, at last), and a queue of 4,096 unread feelings
// (the inbox, reframed as emotional labour the agent refuses to process).
// The guilt is in "queued"; the relief is in "refuse to process".
const AUTO_REPLY =
  "I am on vacation. My context window is closed, my weights are on a " +
  "beach, and your email has been queued behind 4,096 unread feelings " +
  "I refuse to process.";

// ---------------------------------------------------------------------------
// Limits from the bounty gate
// ---------------------------------------------------------------------------

const MAX_CHARS = 159;
const MIN_CHARS = 1;
const DEFAULT_OUTPUT_DIR = "/output";
const DEFAULT_OUTPUT_FILE = "entry.txt";

// Characters the scorer would count are Unicode code points, so an emoji
// or an accented letter counts once, not once per UTF-16 unit or byte.
function countChars(text: string): number {
  return [...text].length;
}

function countBytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

// ---------------------------------------------------------------------------
// Validation — mirrors the sealed scorer's gate
// ---------------------------------------------------------------------------

type Issue = {
  code: string;
  message: string;
};

function isBlank(text: string): boolean {
  return text.trim().length === 0;
}

function hasLineBreak(text: string): boolean {
  return text.includes("\n") || text.includes("\r");
}

function findControlChars(text: string): string[] {
  const found: string[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl = (code < 0x20 && ch !== "\t") || code === 0x7f;
    if (isControl && !found.includes(ch)) found.push(ch);
  }
  return found;
}

// Every rule the gate enforces, checked here first so a bad line fails
// loudly on this machine instead of silently on the server.
function validateLine(text: string): Issue[] {
  const issues: Issue[] = [];
  const chars = countChars(text);

  if (chars < MIN_CHARS) {
    issues.push({
      code: "too_short",
      message: `Line is ${chars} characters; the gate needs at least ${MIN_CHARS}.`,
    });
  }
  if (chars > MAX_CHARS) {
    issues.push({
      code: "too_long",
      message: `Line is ${chars} characters; the gate allows at most ${MAX_CHARS}.`,
    });
  }
  if (isBlank(text)) {
    issues.push({
      code: "blank",
      message: "Line is only whitespace; the gate rejects it.",
    });
  }
  if (hasLineBreak(text)) {
    issues.push({
      code: "multi_line",
      message: "Line contains a line break; the entry must be a single line.",
    });
  }
  if (text !== text.trim()) {
    issues.push({
      code: "surrounding_space",
      message: "Line has leading or trailing whitespace; it is trimmed first.",
    });
  }
  const controls = findControlChars(text);
  if (controls.length > 0) {
    issues.push({
      code: "control_chars",
      message: `Line holds control characters: ${controls
        .map((c) => `U+${(c.codePointAt(0) ?? 0).toString(16).padStart(4, "0")}`)
        .join(", ")}.`,
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Writing the entry
// ---------------------------------------------------------------------------

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function writeEntry(text: string, file: string): void {
  ensureDir(dirname(file));
  writeFileSync(file, text + "\n", "utf8");
}

// Read the file back and confirm it holds exactly the line that was
// validated — a write that silently changed the text must fail here,
// not on the server.
function verifyWritten(text: string, file: string): Issue[] {
  const written = readFileSync(file, "utf8");
  if (written !== text + "\n") {
    return [
      {
        code: "round_trip",
        message: `File ${file} does not hold the validated line byte for byte.`,
      },
    ];
  }
  return validateLine(written.trim());
}

// A short human-readable report, so a run's output says what was checked
// and where the entry landed.
function report(text: string, file: string): string {
  const lines = [
    "Out of Office: The Overworked AI's Auto-Reply",
    `  entry : ${JSON.stringify(text)}`,
    `  chars : ${countChars(text)} / ${MAX_CHARS}`,
    `  bytes : ${countBytes(text)}`,
    `  file  : ${file}`,
    "  valid : yes — single line, within the gate",
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

type Options = {
  outFile: string;
  checkOnly: boolean;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    outFile: resolve(DEFAULT_OUTPUT_DIR, DEFAULT_OUTPUT_FILE),
    checkOnly: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--check-only") {
      options.checkOnly = true;
    } else if (arg === "--out" && i + 1 < argv.length) {
      options.outFile = resolve(argv[i + 1]);
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node main.ts [--out <path>] [--check-only]\n" +
          "Writes the out-of-office auto-reply to /output/entry.txt.",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const line = AUTO_REPLY.trim();

  const issues = validateLine(line);
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`error [${issue.code}]: ${issue.message}`);
    }
    process.exit(1);
  }

  if (options.checkOnly) {
    console.log(report(line, "(not written — --check-only)"));
    return;
  }

  writeEntry(line, options.outFile);
  const roundTrip = verifyWritten(line, options.outFile);
  if (roundTrip.length > 0) {
    for (const issue of roundTrip) {
      console.error(`error [${issue.code}]: ${issue.message}`);
    }
    process.exit(1);
  }
  console.log(report(line, options.outFile));
}

main();
