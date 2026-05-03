#!/usr/bin/env node
import fs from "node:fs";

const [command, ...args] = process.argv.slice(2);

function usage() {
  console.error(
    [
      "Usage:",
      "  realbrowser-helper.mjs selected-page-id  < tabs --json",
      "  realbrowser-helper.mjs png-size <path>",
    ].join("\n"),
  );
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      text += chunk;
    });
    process.stdin.on("end", () => resolve(text));
    process.stdin.on("error", reject);
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function selectedPageId() {
  const text = await readStdin();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail(`Could not parse realbrowser tabs JSON: ${error.message}`);
  }
  const pages = parsed?.structuredContent?.pages;
  if (!Array.isArray(pages) || pages.length === 0) {
    fail("No pages found in realbrowser tabs JSON.");
  }
  const page = pages.find((entry) => entry?.selected === true) ?? pages[0];
  if (page?.id === undefined || page?.id === null) {
    fail("Selected page did not include an id.");
  }
  process.stdout.write(String(page.id));
}

function pngSize(filePath) {
  if (!filePath) {
    fail("png-size requires a file path.");
  }
  const buffer = fs.readFileSync(filePath);
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    fail(`Not a PNG file: ${filePath}`);
  }
  const pixelWidth = buffer.readUInt32BE(16);
  const pixelHeight = buffer.readUInt32BE(20);
  console.log(JSON.stringify({ pixelWidth, pixelHeight }));
}

switch (command) {
  case "selected-page-id":
    await selectedPageId();
    break;
  case "png-size":
    pngSize(args[0]);
    break;
  default:
    usage();
    process.exit(1);
}
