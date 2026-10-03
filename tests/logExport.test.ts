import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLogExport } from "../src/lib/logExport.ts";


const savedAt = new Date(2026, 9, 3, 17, 8, 9);

test("TXT filename preserves Unicode while removing Windows path and control characters", async () => {
  const { filename } = buildLogExport('  한글<>:"/\\|?*\u0000\u001f 앱.  ', [], savedAt);
  assert.equal(filename, "한글 앱_20261003-170809.txt");
});

test("TXT filename handles reserved device names, empty names and bounded Unicode length", async () => {
  for (const name of ["CON", "prn", "Aux.txt", "NUL", "COM1", "lpt9.log", "COM¹", "CONIN$", "CONOUT$"]) {
    const { filename } = buildLogExport(name, [], savedAt);
    assert.ok(filename.startsWith("app-"), `${name} must not remain a device name`);
    assert.ok(!/[<>:"/\\|?*]/.test(filename));
  }
  assert.equal(buildLogExport("... \u0000", [], savedAt).filename, "application_20261003-170809.txt");
  assert.equal(buildLogExport("앱😀".repeat(50), [], savedAt).filename, `${"앱😀".repeat(40)}_20261003-170809.txt`);
  assert.equal(buildLogExport("A".repeat(79) + " .tail", [], savedAt).filename, `${"A".repeat(79)}_20261003-170809.txt`);
});

test("TXT encodes the full fetched snapshot as UTF-8 BOM, UTC ISO timestamps and CRLF", async () => {
  const lines = [
    { at: "2026-10-03T17:00:00.123+09:00", message: "한글 시작 😀\n다음 줄\r\n끝" },
    { at: "2026-10-03T08:00:01Z", message: "last\ronly CR" },
  ];
  const { blob } = buildLogExport("한글 앱", lines, savedAt);
  lines[0].message = "changed after download";
  lines.push({ at: "2026-10-03T08:00:02Z", message: "not in fetched snapshot" });
  const expected = "\uFEFF[2026-10-03T08:00:00.123Z] 한글 시작 😀\r\n다음 줄\r\n끝\r\n[2026-10-03T08:00:01.000Z] last\r\nonly CR\r\n";
  assert.equal(blob.type, "text/plain;charset=utf-8");
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), new TextEncoder().encode(expected));
});

test("TXT preserves all 100 received entries independently of the 15-line screen preview", async () => {
  const lines = Array.from({ length: 100 }, (_, index) => ({
    at: "2026-10-03T08:00:00Z", message: `수신 로그 ${index + 1}`,
  }));
  const text = await buildLogExport("앱", lines, savedAt).blob.text();
  const records = text.split("\r\n").filter(Boolean);
  assert.equal(records.length, 100);
  assert.equal(records[0], "[2026-10-03T08:00:00.000Z] 수신 로그 1");
  assert.equal(records[99], "[2026-10-03T08:00:00.000Z] 수신 로그 100");
});