import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

function functionSource(name) {
  const marker = `export function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing exported function ${name}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1).replace("export ", "");
  }
  throw new Error(`Unclosed function ${name}`);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`
  const campusFaculty = code => code.endsWith("5F") ? "ERIN" : code.endsWith("3F") ? "SCAR" : "ARTSC";
  const getTerm = code => code.at(-1);
  ${functionSource("capacityAt")}
  ${functionSource("snapshotAt")}
  ${functionSource("meetingSnapshotAt")}
  ${functionSource("modelFeatures")}
  ${functionSource("modelMedian")}
  ${functionSource("coherentCounterfactual")}
  ${functionSource("parseSessionManifest")}
  globalThis.build = modelFeatures;
  globalThis.counterfactual = coherentCounterfactual;
  globalThis.parseManifest = parseSessionManifest;
`, sandbox);

const deadline = 2_000_000_000;
const day = 86_400;
const course = {
  timeIntervals: [deadline - 10 * day, deadline - 7 * day, deadline - 3 * day, deadline - day],
};
const meeting = {
  enrollmentCap: 100,
  enrollmentCapComplex: {initialCap: 100, capChanges: [{time: deadline - 2 * day, newCapacity: 110}]},
  enrollmentLogs: [125, 127, 124, 126],
};
const current = {course, deadline, daysRemaining: 1};
const actual = sandbox.build("CSC369H1F", current, meeting, 20);

const expected = {
  position_to_capacity: 20 / 110,
  waitlist_to_capacity: 20 / 110,
  days_to_deadline: 1,
  movement_3d: 8,
  movement_7d: 11,
  position: 20,
  waitlist: 20,
  capacity: 110,
  capacity_changed_7d: 1,
  position_to_waitlist: 1,
  days_squared: 1,
  log_waitlist: Math.log1p(20),
  movement_velocity_7d: 11 / 7,
  near_deadline_7d: 1,
  days_under_7: 6,
  days_under_14: 13,
  days_over_60: 0,
  second_subsession_days: 0,
  second_subsession_near_7d: 0,
  position_ratio_near_7d: 20 / 110,
  waitlist_ratio_near_7d: 20 / 110,
  rank_over_30pct: 0,
  campus_erin: 0,
  campus_scar: 0,
  term_winter: 0,
  term_full_year: 0,
  winter_near_7d: 0,
  scar_near_7d: 0,
  course_code: "CSC369H1F",
  campus: "ARTSC",
  term: "fall",
};

for (const [feature, value] of Object.entries(expected)) {
  if (typeof value === "number") assert.ok(Math.abs(actual[feature] - value) < 1e-12, `${feature}: ${actual[feature]} != ${value}`);
  else assert.equal(actual[feature], value, feature);
}

const shortMeeting = {...meeting, enrollmentLogs: [125, 127]};
const shortFeatures = sandbox.build("CSC369H1F", current, shortMeeting, 20);
assert.equal(shortFeatures.waitlist, 27, "Short logs must use their last real value, not a fabricated zero");

const numericFeatures = Object.keys(expected).filter(key => typeof expected[key] === "number");
const model = {numeric_features: numericFeatures, imputation_values: numericFeatures.map(key => expected[key])};
const rankComparison = sandbox.counterfactual(model, actual, "rank");
assert.ok(rankComparison.position <= rankComparison.waitlist);
assert.ok(Math.abs(rankComparison.position_to_capacity - rankComparison.position / rankComparison.capacity) < 1e-12);
assert.ok(Math.abs(rankComparison.position_to_waitlist - rankComparison.position / rankComparison.waitlist) < 1e-12);
const timingComparison = sandbox.counterfactual(model, actual, "timing");
assert.equal(timingComparison.near_deadline_7d, Number(timingComparison.days_to_deadline <= 7));
assert.equal(timingComparison.days_squared, timingComparison.days_to_deadline ** 2);
const manifest = sandbox.parseManifest({
  sessions: [{sessionCode: "20269"}, {sessionCode: "20265"}, {sessionCode: "20269"}],
  default: "20269"
});
assert.deepEqual([...manifest.sessions], ["20265", "20269"]);
assert.equal(manifest.current, "20269");
console.log("Production feature parity fixture passed");
