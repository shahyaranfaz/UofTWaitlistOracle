import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const notebook = fs.readFileSync(path.join(root, "notebooks", "v2", "01_build_censored_cache.ipynb"), "utf8");

assert.doesNotMatch(app, /const\s+SESSIONS\s*=\s*\[/, "Sessions must come from the archive manifest");
assert.match(app, /fetchJson\("sessions\.json"\)/, "The archive session manifest must be loaded");
assert.match(app, /requestId\s*!==\s*lectureRequestId/, "Stale lecture requests must be ignored");
assert.match(app, /const session = CURRENT_SESSION;/, "Current estimates must use the manifest's current session");
assert.doesNotMatch(app, /for\s*\(const session of \[\.\.\.SESSIONS\]\.reverse\(\)\)/, "Current data must not fall back to old sessions");

assert.match(notebook, /MAX_NEGATIVE_CENSOR_GAP_HOURS/, "Notebook 1 must enforce negative-label censoring");
assert.match(notebook, /effective_budget/, "Notebook 1 must preserve stratified position coverage");

console.log("Project maintenance contracts passed");
