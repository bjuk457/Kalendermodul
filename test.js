// node test.js
const assert = require("assert");
const { groupEvents, parseTime } = require("./kalendermodul-card.js");

const now = new Date(2026, 9, 30, 12, 0); // 30.10.2026 12:00
const ev = (summary, s, e, allDay = false) => ({ summary, start: s, end: e, allDay });

const groups = groupEvents([
  ev("Morgen früh", new Date(2026, 9, 31, 8), new Date(2026, 9, 31, 9)),
  ev("Vorbei", new Date(2026, 9, 30, 8), new Date(2026, 9, 30, 9)),
  ev("Heute Abend", new Date(2026, 9, 30, 18), new Date(2026, 9, 30, 19)),
  ev("Urlaub seit gestern", new Date(2026, 9, 29), new Date(2026, 10, 2), true),
], now);

assert.deepStrictEqual(groups.map((g) => g.key), ["2026-10-30", "2026-10-31"]);
assert.deepStrictEqual(groups[0].events.map((e) => e.summary), ["Urlaub seit gestern", "Heute Abend"]);
assert.strictEqual(parseTime({ date: "2026-10-30" }).date.getDate(), 30);
assert.strictEqual(parseTime({ date: "2026-10-30" }).allDay, true);
console.log("ok");
