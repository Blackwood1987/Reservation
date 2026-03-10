import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const baseTargets = [
  "app.js",
  "app.html",
  "styles.css",
  "core-utils.mjs",
  "ui-text.mjs",
  "index.html",
  "login.js",
  "firebase.json",
  "firestore.rules",
  ".gitignore",
  ".editorconfig",
  ".gitattributes",
  "src.code-workspace",
  "tests/run-tests.mjs",
  "tests/check-text-integrity.mjs",
  "scripts/verify-demo.ps1",
  "scripts/verify-demo.cmd"
];

const mojibakeRules = [
  { label: "replacement-character", regex: /\uFFFD/u },
  { label: "question-mark-before-hangul", regex: /\?[\u3131-\u318e\uac00-\ud7a3]/u },
  { label: "cjk-hangul-mix", regex: /(?:[\u4e00-\u9fff][\uac00-\ud7a3]|[\uac00-\ud7a3][\u4e00-\u9fff])/u },
  { label: "private-use-character", regex: /[\ue000-\uf8ff]/u }
];

const brokenTagHeuristics = [
  /\?<\/(?:button|div|span|h[1-6]|p)>/i,
  /\?\/(?:button|div|span|h[1-6]|p)>/i
];

function getTargetFiles() {
  const docsDir = path.join(repoRoot, "docs");
  const docFiles = fs.existsSync(docsDir)
    ? fs.readdirSync(docsDir)
        .filter(name => name.endsWith(".md"))
        .map(name => path.join("docs", name))
    : [];

  return [...baseTargets, ...docFiles];
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function scanFile(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath)) return [];

  const issues = [];
  const raw = fs.readFileSync(fullPath);

  if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
    issues.push({ file: relativePath, line: null, message: "UTF-8 BOM detected" });
  }

  const text = raw.toString("utf8");

  if (text.includes("\r\n")) {
    issues.push({ file: relativePath, line: null, message: "CRLF detected (expected LF only)" });
  }

  for (const rule of mojibakeRules) {
    const match = rule.regex.exec(text);
    if (match?.index != null) {
      issues.push({
        file: relativePath,
        line: lineNumber(text, match.index),
        message: `Suspicious mojibake pattern detected (${rule.label}): ${match[0]}`
      });
    }
  }

  if (/\.(?:html|js|mjs|md)$/i.test(relativePath)) {
    for (const regex of brokenTagHeuristics) {
      const match = regex.exec(text);
      if (match?.index != null) {
        issues.push({
          file: relativePath,
          line: lineNumber(text, match.index),
          message: `Suspicious broken tag exposure detected: ${match[0]}`
        });
      }
    }
  }

  return issues;
}

const issues = getTargetFiles()
  .map(scanFile)
  .flat()
  .sort((a, b) => normalizePath(a.file).localeCompare(normalizePath(b.file)) || (a.line || 0) - (b.line || 0));

if (issues.length > 0) {
  console.error("Text integrity check failed:");
  for (const issue of issues) {
    const location = issue.line ? `${normalizePath(issue.file)}:${issue.line}` : normalizePath(issue.file);
    console.error(`- ${location} ${issue.message}`);
  }
  process.exit(1);
}

console.log("Text integrity check passed");
