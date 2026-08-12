# Notebook pipeline v2

Run notebooks in numeric order. Version 1 is preserved for provenance but must not feed v2.

1. `01_build_censored_cache.ipynb` reconstructs queues, censors incomplete outcomes, uses net movement, performs offering/day-stratified rank sampling, and records hashes and versions.
2. `02_development_selection.ipynb` performs all model and feature selection without loading the final sessions.
3. `03_same_season_calibration_and_uncertainty.ipynb` evaluates calibration within season and reports offering-clustered uncertainty.
4. `04_untouched_evaluation_and_release.ipynb` opens the final sessions once, evaluates the locked model, applies release gates, and exports only after every gate passes.

## Reproducibility

The cache manifest records source-session hashes and package versions. Result checkpoints include data, specification, score, and environment fingerprints. Use the pinned environment in `requirements-v2.txt`. The upstream archive remains mutable, so a run is reproducible only with the recorded source files or matching hashes.
