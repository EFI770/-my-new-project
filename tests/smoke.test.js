import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../assets/styles.css", import.meta.url), "utf8");
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

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

test("unverified email accounts are blocked at login", () => {
  assert.match(app, /if\(!E\.verified\)return k\("האימייל עדיין לא אומת/);
  assert.match(app, /verified:!1/);
});

test("demo limitations are disclosed and not misrepresented as production auth", () => {
  assert.match(app, /localStorage/);
  assert.match(app, /אימות אימייל מדומה לצורך דמו/);
  assert.match(readme, /לא מערכת ייצור מאובטחת/);
  assert.match(readme, /אין להזין כרגע מידע אישי או רגיש/);
});

test("matching score rewards topic overlap and caps at 100", () => {
  const scorerMatch = app.match(/function ov\(e,n\)\{[\s\S]*?return\{score:t,reasons:r\}\}/);
  assert.ok(scorerMatch, "matching scorer function must exist");
  const scorer = vm.runInNewContext(`${scorerMatch[0]}; ov`);
  const perfect = scorer(
    { topics: ["גמרא"], level: "בינוני", days: ["א׳"], hours: ["ערב"], frequency: "שבועי", modes: ["וידאו"] },
    { topics: ["גמרא"], level: "בינוני", days: ["א׳"], hours: ["ערב"], frequency: "שבועי", modes: ["וידאו"] }
  );
  assert.equal(perfect.score, 100);
  assert.equal(perfect.reasons.length, 5);
  const noOverlap = scorer(
    { topics: ["גמרא"], level: "בינוני", days: ["א׳"], hours: ["ערב"], frequency: "שבועי", modes: ["וידאו"] },
    { topics: ["תנ״ך"], level: "מתחיל", days: ["ב׳"], hours: ["בוקר"], frequency: "יומי", modes: ["טלפון"] }
  );
  assert.equal(noOverlap.score, 0);
});
