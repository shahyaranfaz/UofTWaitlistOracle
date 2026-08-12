# UofT Waitlist Oracle

UofT Waitlist Oracle estimates the probability that a waitlist will record
enough net shrinkage to cover an entered position for a specific
University of Toronto course and lecture section. It combines the current
queue, section capacity, time remaining, recent movement, course context, and
public enrollment history in a model that runs entirely in the browser.

Every estimate is accompanied by the underlying outcomes from previous lecture
offerings. The percentage is a statistical estimate—not a guarantee, academic
advice, or an official U of T forecast.

## Methodology

### Reconstructing the queue

The public archive records enrollment demand, section capacity, capacity
changes, and collection timestamps. At each observation, the inferred waitlist
size is:

```text
max(enrollment demand - section capacity, 0)
```

Offerings are aligned by days remaining before the applicable U of T waitlist
deadline, rather than by calendar date or enrollment deadline.

### Live queue freshness

The live collector can lag behind a student joining a waitlist. The website
therefore accepts ranks up to five positions beyond the latest inferred queue.
When no waitlist is recorded, ranks 1 through 5 remain available for this
freshness allowance. For live model inputs, the current queue is the larger of
the latest inferred queue and the entered rank. That effective queue is used
for the model's queue and queue-ratio features. Recent-movement features remain
the actual changes between archived snapshots.

### Defining the target

The archive does not identify individual students or record admission offers.
The model target is therefore whether the queue's net observed decrease from a
snapshot to the final sufficiently complete pre-deadline observation reaches a
given rank. Later increases offset earlier decreases.

This is not verified student advancement. A departure behind a student can
shrink the queue without advancing that student, while a departure ahead that
is offset by a new arrival between snapshots can be invisible. The proxy can
therefore err in either direction. Capacity increases can also contribute to
an observed decrease.

Each training row represents one waitlist rank in one lecture on one observed
day. The legacy internal target column is named `cleared`, but it is 1 when
net observed shrinkage reaches that rank. The percentage
estimates this archive-derived target, not the probability of receiving an
offer directly.

### Model

The Oracle uses separate histogram gradient-boosted tree models for
Fall/Winter and Summer. Each ensemble contains 200 small trees with at most 15
leaves and L2 regularization of 3. Missing numeric values are filled with the
training median. No post-hoc probability calibration is applied.

The production model has 26 numeric features:

- **Rank:** raw rank, rank divided by capacity, and rank divided by current
  waitlist size
- **Queue:** raw waitlist size, log waitlist size, and waitlist divided by
  capacity
- **Capacity:** section capacity and whether capacity changed in the previous
  seven days
- **Time:** days before the waitlist deadline, squared days, a seven-day flag,
  days below seven, days below fourteen, and days beyond sixty
- **Movement:** observed movement over three days, observed movement over seven
  days, and seven-day movement velocity
- **Interactions:** rank-to-capacity and waitlist-to-capacity near the deadline,
  plus an indicator for ranks above 30% of capacity
- **Context:** campus and course-term indicators, including their near-deadline
  interactions

Lecture selection determines the live capacity, queue, and movement inputs.
Lecture identifiers such as `LEC0101` are not themselves predictors.

### Understanding Driven by

The **Driven by** list is a local explanation of the displayed estimate. The
browser changes one underlying factor toward its typical training value and
recomputes every dependent ratio and interaction together. A `+` means the
entered case raises the estimate relative to that coherent comparison, while a
`−` means it lowers it. Because trees contain interactions, these effects do
not need to add up to the displayed percentage and should not be interpreted as
causal.

### Training and validation

The archive covers completed Fall/Winter and Summer sessions from 2022 through
Summer 2026. Evaluation uses rolling-origin validation rather than a random
train/test split. There are six holdouts, three per season:

| Model       | Training sessions | Validation session |
|-------------|------------------:|-------------------:|
| Fall/Winter |         2022–2023 |          2023–2024 |
| Fall/Winter |         2022–2024 |          2024–2025 |
| Fall/Winter |         2022–2025 |          2025–2026 |
| Summer      |              2023 |               2024 |
| Summer      |         2023–2024 |               2025 |
| Summer      |         2023–2025 |               2026 |

Each fold adds the previous validation session to the next training set. The
model therefore predicts a future session using only information that would
have existed at that time. No rows from the validation session enter its
training data, preprocessing statistics, category encoding, or capacity-only
baseline fit.

Metrics are calculated separately for each holdout and then averaged across
the three folds in that season. After model and feature decisions are complete,
the two production models are refit on all completed sessions available to
their season. The current session is used only to construct live prediction
inputs.

After sampling, position rows are renormalized so every retained lecture
offering contributes total weight 1 and each retained day contributes equally
within that offering. This prevents large queues, longer collection histories,
or random differences in retained rows from dominating training or scoring.

Four metrics capture different parts of performance:

- **Accuracy** is the share of correct target-met or target-not-met predictions using a
  50% cutoff.
- **Brier score** measures the error in the probabilities themselves. Lower is
  better.
- **Expected calibration error (ECE)** measures whether stated probabilities
  match observed outcomes. Lower is better.
- **ROC AUC** measures how well a method ranks likely target-met rows above likely
  misses. Higher is better.

## Benchmark against simple rules

The complete benchmark calculation, fold-level results, and figure generation
are available in
[Notebook 7](notebooks/v1/07_production_benchmark.ipynb). The full modelling
sequence is documented in the
[version 1 notebook guide](notebooks/v1/README.md).

The Oracle is compared with three understandable baselines:

- **Historical percentage:** the success rate of the previous lecture offerings
  listed when you query the Oracle. A lecture counts as a success when its net
  observed shrinkage at the equivalent date was at least the entered position.
- **Literal 10% rule:** predicts that net shrinkage reaches the entered position when rank is no more than 10% of lecture
  capacity.
- **Boosted 10% rule:** a fitted probability curve that still uses only
  waitlist rank divided by lecture capacity.

The Oracle and both capacity baselines are scored on every validation row. The
historical percentage is available only when an earlier lecture reached the
exact entered position. A second table therefore compares all four methods on
that common subset, which covers 53.5% of Fall/Winter validation weight and
40.7% of Summer validation weight.

### Overall performance on all validation rows

| Season      |           Method |  Accuracy |      Brier |        ECE |    ROC AUC |
|-------------|-----------------:|----------:|-----------:|-----------:|-----------:|
| Fall/Winter |     Oracle model | **93.3%** | **0.0483** | **0.0127** | **0.9574** |
| Fall/Winter | Literal 10% rule |     65.1% |     0.3493 |     0.3493 |     0.6394 |
| Fall/Winter | Boosted 10% rule |     88.2% |     0.0982 |     0.0245 |     0.6874 |
| Summer      |     Oracle model | **93.9%** | **0.0459** |     0.0266 | **0.9433** |
| Summer      | Literal 10% rule |     71.2% |     0.2878 |     0.2878 |     0.6439 |
| Summer      | Boosted 10% rule |     91.1% |     0.0791 | **0.0203** |     0.6803 |

### Direct comparison on the historical-comparable subset

| Season      |                Method |  Accuracy |      Brier |        ECE |    ROC AUC |
|-------------|----------------------:|----------:|-----------:|-----------:|-----------:|
| Fall/Winter |          Oracle model | **93.9%** | **0.0436** | **0.0121** | **0.9617** |
| Fall/Winter | Historical percentage |     93.0% |     0.0637 |     0.0563 |     0.8227 |
| Fall/Winter |      Literal 10% rule |     67.5% |     0.3252 |     0.3252 |     0.6387 |
| Fall/Winter |      Boosted 10% rule |     89.5% |     0.0898 |     0.0240 |     0.6855 |
| Summer      |          Oracle model | **95.3%** | **0.0358** |     0.0204 | **0.9505** |
| Summer      | Historical percentage |     94.9% |     0.0488 |     0.0465 |     0.7398 |
| Summer      |      Literal 10% rule |     75.1% |     0.2493 |     0.2493 |     0.6672 |
| Summer      |      Boosted 10% rule |     93.5% |     0.0591 | **0.0136** |     0.7115 |

The figures below visualize this common subset so that every plotted method is
evaluated on identical rows.

![Oracle model versus simple waitlist baselines](docs/assets/model-baseline-benchmark.png)

![Probability error across chronological holdouts](docs/assets/model-chronological-benchmark.png)

On the common subset, the Oracle reduced mean Brier error by 51.4% against the
boosted 10% rule, 31.5% against the exact historical percentage, and 86.6%
against the literal 10% rule in Fall/Winter. The Summer reductions were 39.3%,
26.5%, and 85.6%. Overall model performance is represented by the all-validation
table, not the easier historical-comparable subset.

Ranks above 100 are materially harder. Their mean Brier was 0.1696 in
Fall/Winter and 0.2289 in Summer, with mean ECE of 0.0910 and 0.2068.

### Production inference

The exported model bundle contains the numeric imputation values, ensemble
baseline log-odds, and every tree split and leaf value. The browser reconstructs
the selected lecture's live features and traverses the trees locally. Historical
outcomes are fetched separately and shown as evidence. They do not change the
model percentage.

### Limitations

- Queue size and net shrinkage are inferred from collector snapshots rather than
  student records or admission offers.
- Departures behind a rank can be counted as movement, while movement hidden by
  offsetting arrivals between snapshots can be missed. The target can therefore
  differ from an individual student's actual advancement in either direction.
- Course scheduling, instructor changes, reserved seats, and student behavior
  can shift between years.
- Summer has fewer comparable observations and should be treated with more
  caution.
- The percentage is an estimate, not a guarantee or an official U of T
  forecast.

## Historical evidence

For transparency, the result page also shows how the requested rank performed
across every eligible previous lecture offering of the course at the comparable
date. This evidence is not silently substituted for the model and remains
visible even when the model disagrees with it.

## Data and attribution

Enrollment history is maintained by 
[ICPRplshelp](https://github.com/ICPRplshelp/Enrollment-Data) and originates
from U of T's public timetable builder. The application fetches only the public
files required for the selected course. A local archive is retained for 
reproducible research but is not deployed or wired into the website.
