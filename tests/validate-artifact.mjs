import fs from "node:fs";
import assert from "node:assert/strict";

const artifact = JSON.parse(fs.readFileSync(new URL("../model/oracle-model.json", import.meta.url), "utf8"));
assert.ok(Number.isInteger(artifact.schema_version));
assert.ok(artifact.schema_version >= 6);
for (const season of ["fall_winter", "summer"]) {
  const model = artifact.models?.[season];
  assert.ok(model, `Missing ${season} model`);
  if (artifact.schema_version >= 7) assert.equal(model.quality, "validated", `${season} did not pass release validation`);
  assert.equal(model.numeric_features.length, model.imputation_values.length);
  assert.ok(model.trees.length > 0);
  assert.ok(model.trees.every(tree => tree.some(node => node.leaf)));
  assert.ok(["none", "platt"].includes(model.calibration?.method ?? "none"));
  if (model.calibration?.method === "platt") {
    const parameters = model.calibration.parameters ?? model.calibration;
    assert.ok(Number.isFinite(parameters.coefficient));
    assert.ok(Number.isFinite(parameters.intercept));
  }
}
console.log("Model artifact validation passed");
