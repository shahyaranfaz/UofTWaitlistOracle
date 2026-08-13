import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARTIFACT = json.loads((ROOT / "model" / "oracle-model.json").read_text(encoding="utf-8"))


def calibrate(probability, calibration):
    method = calibration.get("method", "none")
    if method == "none":
        return probability
    if method == "platt":
        bounded = min(max(probability, 1e-6), 1 - 1e-6)
        parameters = calibration.get("parameters", calibration)
        score = parameters["intercept"] + parameters["coefficient"] * math.log(bounded / (1 - bounded))
        return 1 / (1 + math.exp(-score))
    if method == "isotonic":
        x, y = calibration["x"], calibration["y"]
        if probability <= x[0]: return y[0]
        if probability >= x[-1]: return y[-1]
        upper = next(i for i, value in enumerate(x) if value >= probability)
        weight = (probability - x[upper - 1]) / (x[upper] - x[upper - 1])
        return y[upper - 1] + weight * (y[upper] - y[upper - 1])
    raise ValueError(method)


def predict(model, features):
    values = [features.get(name) for name in model["numeric_features"]]
    values = [value if isinstance(value, (int, float)) and math.isfinite(value) else model["imputation_values"][i]
              for i, value in enumerate(values)]
    score = model["baseline_log_odds"]
    for tree in model["trees"]:
        index = 0
        while not tree[index]["leaf"]:
            node = tree[index]; value = values[node["feature"]]
            index = node["left"] if value <= node["threshold"] else node["right"]
        score += tree[index]["value"]
    return calibrate(1 / (1 + math.exp(-score)), model.get("calibration", {"method": "none"}))


def cases():
    output = []
    for season, model in ARTIFACT["models"].items():
        median = dict(zip(model["numeric_features"], model["imputation_values"]))
        variants = [median, {**median, "position": 1.0, "position_to_capacity": 0.01, "position_to_waitlist": 0.05},
                    {**median, "position": 100.0, "position_to_capacity": 0.5, "position_to_waitlist": 1.0}]
        for number, features in enumerate(variants, 1):
            output.append({"name": f"{season}_{number}", "season": season, "features": features,
                           "expected_probability": predict(model, features)})
    return {"generated_by": "independent Python evaluator of the serialized production artifact; Notebook 4 replaces this with scikit-learn fixtures on rerun",
            "schema_version": ARTIFACT["schema_version"], "cases": output}


if __name__ == "__main__":
    output = ROOT / "tests" / "fixtures" / "python-inference-parity.json"
    output.write_text(json.dumps(cases(), indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {output}")
