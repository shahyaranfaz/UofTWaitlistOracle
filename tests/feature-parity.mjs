import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const fixtures = JSON.parse(fs.readFileSync(new URL("./fixtures/python-feature-parity.json", import.meta.url), "utf8"));

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
  ${functionSource("campusDigit")}
  ${functionSource("campusFaculty")}
  ${functionSource("getTerm")}
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

for (const fixture of fixtures.cases) {
  const built = sandbox.build(fixture.code, fixture.current, fixture.meeting, fixture.position);
  for (const [feature, value] of Object.entries(fixture.expected)) {
    if (typeof value === "number") assert.ok(Math.abs(built[feature] - value) < 1e-12, `${fixture.name}.${feature}: ${built[feature]} != ${value}`);
    else assert.equal(built[feature], value, `${fixture.name}.${feature}`);
  }
}

const expected = fixtures.cases[0].expected;
const actual = sandbox.build(fixtures.cases[0].code, fixtures.cases[0].current, fixtures.cases[0].meeting, fixtures.cases[0].position);

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
