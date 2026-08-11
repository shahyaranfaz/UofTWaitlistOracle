# UofT Waitlist Oracle

UofT Waitlist Oracle estimates the probability that a waitlist rank will clear
for a specific University of Toronto course and lecture section. It combines
the current queue, section capacity, time remaining, recent movement, course
context, and public enrollment history in a model that runs entirely in the 
browser.

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

### Defining clearance

The archive does not identify individual students. Clearance is therefore
inferred from cumulative observed downward waitlist changes between a snapshot
and the deadline. Later increases do not erase earlier queue movement because
those students generally joined behind the rank being evaluated.

This is a conservative proxy: movement that occurs entirely between collector
snapshots cannot be observed. Capacity increases count as queue advancement
because they create seats for students already waiting.

Each training row represents one waitlist rank in one lecture on one observed
day. Its target is `cleared` when cumulative observed queue movement from that
day to the waitlist deadline reaches that rank.

### Model

The Oracle uses separate histogram gradient-boosted tree models for
Fall/Winter and Summer. Each ensemble contains 200 small trees with at most 15
leaves. Missing numeric values are filled with the training median. No post-hoc
probability calibration is applied.

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

The **Driven by** list is a local explanation of the displayed estimate. For
each feature group, the browser calculates the prediction again after replacing
that group's values with their training medians. A `+` means the entered case
raises the estimate relative to those typical values, while a `−` means it
lowers it. Because trees contain interactions, these effects do not need to add
up to the displayed percentage and should not be interpreted as causal.

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

Position rows are weighted so that every lecture-section day contributes equal
total weight. This prevents a large queue from dominating training or scoring
simply because it creates more possible rank rows.

Four metrics capture different parts of performance:

- **Accuracy** is the share of correct clear or not-clear predictions using a
  50% cutoff.
- **Brier score** measures the error in the probabilities themselves. Lower is
  better.
- **Expected calibration error (ECE)** measures whether stated probabilities
  match observed outcomes. Lower is better.
- **ROC AUC** measures how well a method ranks likely clears above likely
  misses. Higher is better.

## Benchmark against simple rules

The complete benchmark calculation, fold-level results, and figure generation
are available in
[Notebook 7](notebooks/v1/07_production_benchmark.ipynb). The full modelling
sequence is documented in the
[version 1 notebook guide](notebooks/v1/README.md).

The Oracle is compared with three understandable baselines:

- **Historical percentage:** how often the same rank cleared in previous
  lectures of the course at the equivalent date.
- **Literal 10% rule:** predicts clear when rank is no more than 10% of lecture
  capacity.
- **Boosted 10% rule:** a fitted probability curve that still uses only
  waitlist rank divided by lecture capacity.

All four methods are scored on the same rows. The historical baseline has exact
rank evidence for 61.9% of Fall/Winter validation weight and 53.9% of Summer
validation weight.

| Season      |                Method |  Accuracy |      Brier |        ECE |    ROC AUC |
|-------------|----------------------:|----------:|-----------:|-----------:|-----------:|
| Fall/Winter |          Oracle model | **94.6%** | **0.0394** | **0.0098** | **0.9673** |
| Fall/Winter | Historical percentage |     89.4% |     0.0995 |     0.0901 |     0.6813 |
| Fall/Winter |      Literal 10% rule |     71.6% |     0.2843 |     0.2843 |     0.6366 |
| Fall/Winter |      Boosted 10% rule |     89.7% |     0.0882 |     0.0251 |     0.6715 |
| Summer      |          Oracle model | **94.5%** | **0.0418** |     0.0245 | **0.9486** |
| Summer      | Historical percentage |     92.9% |     0.0669 |     0.0632 |     0.6754 |
| Summer      |      Literal 10% rule |     74.1% |     0.2590 |     0.2590 |     0.6477 |
| Summer      |      Boosted 10% rule |     92.1% |     0.0711 | **0.0157** |     0.6868 |

![Oracle model versus simple waitlist baselines](docs/assets/model-baseline-benchmark.png)

![Probability error across chronological holdouts](docs/assets/model-chronological-benchmark.png)

The Oracle reduced the mean Brier error by 55.4% against the boosted 10%
rule, 60.4% against the historical percentage, and 86.2% against the literal
10% rule in Fall/Winter. The Summer reductions were 41.3%, 37.6%, and 83.9%. It
also had the best Brier score in every chronological holdout.

### Production inference

The exported model bundle contains the numeric imputation values, ensemble
baseline log-odds, and every tree split and leaf value. The browser reconstructs
the selected lecture's live features and traverses the trees locally. Historical
outcomes are fetched separately and shown as evidence. They do not change the
model percentage.

### Limitations

- Queue size and clearance are inferred from collector snapshots rather than
  individual student records.
- Movement that happens entirely between snapshots can be missed.
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
