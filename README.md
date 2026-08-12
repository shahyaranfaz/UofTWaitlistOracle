# UofT Waitlist Oracle

UofT Waitlist Oracle estimates the probability that a waitlist will record
enough cumulative downward movement to cover an entered position for a specific
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
Starting at each snapshot, the model adds every subsequently observed downward
queue step through the final sufficiently complete pre-deadline observation:

```text
sum(max(previous queue - next queue, 0))
```

The target is whether that cumulative observed movement reaches a given rank.
Later arrivals can refill the queue, but they do not erase movement that was
already visible.

This is not verified student advancement. A departure behind a student can
shrink the queue without advancing that student, while a departure ahead that
is offset by a new arrival between snapshots can be invisible. The proxy can
therefore err in either direction. Capacity increases can also contribute to
an observed decrease.

Each training row represents one waitlist rank in one lecture on one observed
day. The legacy internal target column is named `cleared`, but it is 1 when
cumulative observed downward movement reaches that rank. The percentage
estimates this archive-derived target, not the probability of receiving an
offer directly.

### Model

The Oracle uses separate histogram gradient-boosted tree models for
Fall/Winter and Summer. Each ensemble contains 200 small trees with at most 15
leaves and L2 regularization of 3. Missing numeric values are filled with the
training median. A same-season Platt mapping selected on earlier sessions
calibrates each model's probabilities.

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

The earlier holdouts are used for development selection and same-season
calibration. The last session of each season is evaluated only after features,
hyperparameters, calibration choices, and release gates are locked. The tables
below report those latest-session results. After evaluation, the two production
models are refit on all completed sessions available to their season. The
current session is used only to construct live prediction inputs.

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

The locked latest-session benchmark and figure generation are available in
[V2 Notebook 4](notebooks/v2/04_latest_session_evaluation_and_release.ipynb).
The full modelling sequence is documented in the
[version 2 notebook guide](notebooks/v2/README.md).

The Oracle is compared with three understandable baselines:

- **Historical percentage:** the success rate of the previous lecture offerings
  listed when you query the Oracle. A lecture counts as a success when its
  cumulative observed downward movement after the equivalent date was at least
  the entered position.
- **Literal 10% rule:** predicts that movement reaches the entered position when rank is no more than 10% of lecture
  capacity.
- **Boosted 10% rule:** a fitted probability curve that still uses only
  waitlist rank divided by lecture capacity.

The Oracle and both capacity baselines are scored on every validation row. The
historical percentage is available only when an earlier lecture reached the
exact entered position. A second table therefore compares all four methods on
that common subset, which covers 72.3% of Fall/Winter evaluation weight and
54.6% of Summer evaluation weight.

### Latest-session performance on all evaluation rows

| Season      |           Method |  Accuracy |      Brier |        ECE |    ROC AUC |
|-------------|-----------------:|----------:|-----------:|-----------:|-----------:|
| Fall/Winter |     Oracle model | **85.6%** | **0.1150** |     0.0319 | **0.7580** |
| Fall/Winter | Literal 10% rule |     82.8% |     0.1721 |     0.1721 |     0.4965 |
| Fall/Winter | Boosted 10% rule |     83.6% |     0.1374 | **0.0065** |     0.4909 |
| Summer      |     Oracle model | **77.7%** | **0.1646** |     0.0681 | **0.6995** |
| Summer      | Literal 10% rule |     69.6% |     0.3040 |     0.3040 |     0.6049 |
| Summer      | Boosted 10% rule |     76.6% |     0.1737 | **0.0267** |     0.6192 |

### Direct comparison on the historical-comparable subset

| Season      |                Method |  Accuracy |      Brier |        ECE |    ROC AUC |
|-------------|----------------------:|----------:|-----------:|-----------:|-----------:|
| Fall/Winter |          Oracle model | **86.5%** | **0.1080** |     0.0299 | **0.7697** |
| Fall/Winter | Historical percentage |     83.0% |     0.1563 |     0.1452 |     0.6546 |
| Fall/Winter |      Literal 10% rule |     84.2% |     0.1584 |     0.1584 |     0.4969 |
| Fall/Winter |      Boosted 10% rule |     84.8% |     0.1295 | **0.0173** |     0.4906 |
| Summer      |          Oracle model | **78.6%** | **0.1606** |     0.0667 | **0.6948** |
| Summer      | Historical percentage |     77.0% |     0.2218 |     0.2135 |     0.5992 |
| Summer      |      Literal 10% rule |     71.1% |     0.2886 |     0.2886 |     0.5988 |
| Summer      |      Boosted 10% rule |     78.0% |     0.1659 | **0.0279** |     0.6104 |

The figures below visualize this common subset so that every plotted method is
evaluated on identical rows.

![Oracle model versus simple waitlist baselines](docs/assets/model-baseline-benchmark.png)

![Probability error across chronological holdouts](docs/assets/model-chronological-benchmark.png)

On the common subset, the Oracle reduced Brier error by 16.7% against the
boosted 10% rule, 30.9% against the historical percentage, and 31.8% against
the literal 10% rule in Fall/Winter. The Summer reductions were 3.1%, 27.6%,
and 44.3%. Overall model performance is represented by the all-evaluation
table, not the easier historical-comparable subset.

### Release status

Fall/Winter passed every pre-locked release gate and is marked **validated**.
Summer beat the literal and boosted 10% baselines, but missed the strict ECE,
near-deadline, large-queue, and probability-bin calibration gates. It is
therefore released as **experimental**. Its latest-session ECE was 0.0681,
near-deadline gap 0.0894, large-queue gap 0.1507, and maximum eligible
probability-bin gap 0.1276. Summer percentages should be treated with extra
caution.

### Production inference

The exported model bundle contains the numeric imputation values, ensemble
baseline log-odds, and every tree split and leaf value. The browser reconstructs
the selected lecture's live features and traverses the trees locally. Historical
outcomes are fetched separately and shown as evidence. They do not change the
model percentage.

### Limitations

- Queue size and cumulative downward movement are inferred from collector snapshots rather than
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
