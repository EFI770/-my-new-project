import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../assets/styles.css", import.meta.url), "utf8");

test("HTML entry point uses Hebrew RTL and responsive viewport", () => {
  assert.match(html, /<html lang="he" dir="rtl">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /id="root"/);
});

test("all local app assets referenced by the entry point exist", () => {
  assert.ok(existsSync(new URL("../assets/app.js", import.meta.url)));
  assert.ok(existsSync(new URL("../assets/styles.css", import.meta.url)));
  assert.match(html, /\.\/assets\/app\.js/);
  assert.match(html, /\.\/assets\/styles\.css/);
});

test("bundled app contains its React mount and core Hebrew UI", () => {
  assert.match(app, /createRoot\(document\.getElementById\(["']root["']\)\)/);
  assert.match(app, /חברותא/);
  assert.ok(app.length > 100_000, "app bundle unexpectedly small");
});

test("stylesheet contains app layout styles", () => {
  assert.match(css, /--green-dark/);
  assert.match(css, /@media/);
});
