import fs from "node:fs";
import assert from "node:assert/strict";

const artifact = JSON.parse(
  fs.readFileSync(new URL("../model/oracle-model.json", import.meta.url), "utf8")
);

assert.ok(Number.isInteger(artifact.schema_version));
assert.ok(artifact.schema_version >= 6);

if (artifact.schema_version >= 8) {
  assert.equal(artifact.target, "cumulative_observed_downward_movement");
}

for (const season of ["fall_winter", "summer"]) {
  const model = artifact.models?.[season];

  assert.ok(model, `Missing ${season} model`);

  if (artifact.schema_version >= 7) {
    assert.ok(
      ["validated", "experimental"].includes(model.quality),
      `${season} has an unknown release quality`
    );

    if (model.quality === "experimental") {
      assert.ok(
        model.failed_release_checks?.length > 0,
        `${season} experimental model lacks failed checks`
      );
      assert.ok(
        model.release_diagnostics,
        `${season} experimental model lacks diagnostics`
      );
    }
  }

  assert.equal(model.numeric_features.length, model.imputation_values.length);
  assert.ok(model.trees.length > 0);
  assert.ok(model.trees.every(tree => tree.some(node => node.leaf)));

  const calibrationMethod = model.calibration?.method ?? "none";

  assert.ok(
    ["none", "platt", "isotonic"].includes(calibrationMethod),
    `${season} has unknown calibration method: ${calibrationMethod}`
  );

  if (calibrationMethod === "platt") {
    const parameters = model.calibration.parameters ?? model.calibration;

    assert.ok(
      Number.isFinite(parameters.coefficient),
      `${season} Platt calibration has invalid coefficient`
    );
    assert.ok(
      Number.isFinite(parameters.intercept),
      `${season} Platt calibration has invalid intercept`
    );
  }

  if (calibrationMethod === "isotonic") {
    const { x, y } = model.calibration;

    assert.ok(Array.isArray(x), `${season} isotonic calibration lacks x array`);
    assert.ok(Array.isArray(y), `${season} isotonic calibration lacks y array`);
    assert.ok(x.length > 0, `${season} isotonic calibration is empty`);
    assert.equal(
      x.length,
      y.length,
      `${season} isotonic calibration x/y lengths differ`
    );

    assert.ok(
      x.every(Number.isFinite),
      `${season} isotonic calibration has non-finite x values`
    );
    assert.ok(
      y.every(Number.isFinite),
      `${season} isotonic calibration has non-finite y values`
    );

    assert.ok(
      x.every((value, i) => i === 0 || value >= x[i - 1]),
      `${season} isotonic calibration x values are not nondecreasing`
    );
    assert.ok(
      y.every((value, i) => i === 0 || value >= y[i - 1]),
      `${season} isotonic calibration y values are not nondecreasing`
    );
  }
}

console.log("Model artifact validation passed");