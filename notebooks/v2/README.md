# Notebook pipeline v2

Run notebooks in numeric order. Version 1 is preserved for provenance but must not feed v2.

When executing from a shell, enable `set -e` so a failed notebook stops the sequence instead of producing misleading missing-artifact errors in later notebooks.

1. `01_build_censored_cache.ipynb` reconstructs queues, censors incomplete outcomes, uses cumulative observed downward movement, performs offering/day-stratified rank sampling, and records hashes and versions.
2. `02_development_selection.ipynb` performs model and feature selection on the earlier development sessions and uses paired offering-clustered comparisons.
3. `03_same_season_calibration_and_uncertainty.ipynb` evaluates calibration within season and reports offering-clustered uncertainty.
4. `04_latest_session_evaluation_and_release.ipynb` evaluates the locked pipeline on the latest completed Fall/Winter and Summer sessions and applies thresholds locked by Notebook 3. Passing seasonal models are marked validated. A seasonal model that beats the simple baselines but misses strict calibration gates can be exported only as experimental, with every failed check embedded in the artifact.

## Reproducibility

The cache manifest records source-session hashes and the exact package versions used by the run. Result checkpoints include data, specification, score, and environment fingerprints. The upstream archive remains mutable, so a run is reproducible only with the recorded source files or matching hashes and the recorded environment versions.
