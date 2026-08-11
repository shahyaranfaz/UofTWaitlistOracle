# Version 1 modelling notebooks

Run these notebooks in numerical order. Notebook 1 reconstructs the local
enrollment archive and owns the canonical cache. Every later notebook reads the
same cached session samples and does not parse the archive again.

1. [`01_build_dataset_cache.ipynb`](01_build_dataset_cache.ipynb) audits queue
   reconstruction, creates inferred rank-reach labels, validates them, and creates
   the deterministic per-session cache.
2. [`02_model_family_screening.ipynb`](02_model_family_screening.ipynb) compares
   compact logistic models, a contextual logistic model, gradient boosting, and
   the historical baseline.
3. [`03_feature_and_hyperparameter_search.ipynb`](03_feature_and_hyperparameter_search.ipynb)
   carries forward Notebook 2's boosted-tree winner and its strongest
   browser-exportable logistic challenger, then searches logistic feature sets
   and regularization. It also contains the controlled course-identity
   experiment comparing `CSC`, `3`, `CSC` + `3`, `CSC3`, `CSC369`, and the
   complete course code.
4. [`04_regularization_and_calibration.ipynb`](04_regularization_and_calibration.ipynb)
   tunes boosted-tree complexity and regularization, compares the winner with
   the strongest logistic model, tests chronological calibration, and inspects
   failure slices.
5. [`05_deadline_interactions.ipynb`](05_deadline_interactions.ipynb) tests
   targeted deadline, rank, term, and campus feature groups against the tuned
   boosted-tree control.
6. [`06_seasonal_models_and_export.ipynb`](06_seasonal_models_and_export.ipynb)
   separates Fall/Winter from Summer, selects seasonal boosted-tree feature
   sets, verifies exact serialized-tree predictions, and is the only notebook
   that exports the deployed model bundle.
7. [`07_production_benchmark.ipynb`](07_production_benchmark.ipynb) produces the
   final apples-to-apples baseline results and the figures used in the project
   README.

## Local inputs and generated files

The notebooks expect the upstream archive at
`data/Enrollment-Data-master`. The archive and generated `artifacts` directory
are intentionally excluded from Git because of their size. If every cache file
passes Notebook 1's schema and integrity checks, archive reconstruction is
skipped.

Long-running searches checkpoint their results under the ignored `artifacts`
directory. Run all seven notebooks in order before publishing a new model
version so saved outputs and written findings match the current code.
