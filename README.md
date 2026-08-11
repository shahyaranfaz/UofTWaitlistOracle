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

### Model

The Oracle uses separate L2-regularized logistic models for Fall/Winter and 
Summer. Inputs include:

- waitlist rank and current queue size
- rank and queue size relative to section capacity
- days remaining and piecewise near-deadline effects
- movement over the preceding three and seven days
- section capacity and recent capacity changes
- course code, campus, and course term
- near-deadline interactions with queue ratios and Summer subsession

Lecture selection determines the live capacity, queue, and movement inputs.
Lecture identifiers such as `LEC0101` are not themselves predictors.

### Validation

Evaluation is chronological and season-specific: each validation session is
predicted using only earlier completed sessions from the same enrollment
calendar. Position rows are weighted so that each lecture-section day
contributes equal total weight, preventing large queues from dominating the 
results.

The primary metric is Brier score, which measures probability error and rewards
calibration as well as discrimination. Lower is better. Expected calibration
error (ECE) is also lower-is-better. ROC AUC is higher-is-better.

| Model                      | Mean Brier | Worst-fold Brier | Mean ECE | Mean ROC AUC |
|----------------------------|-----------:|-----------------:|---------:|-------------:|
| Fall/Winter seasonal model |     0.0483 |           0.0519 |   0.0124 |       0.9557 |
| Summer seasonal model      |     0.0466 |           0.0571 |   0.0280 |       0.9478 |

Fall/Winter performance is strong across the principal metrics. Summer is less
stable close to the deadline: on the newest Summer holdout, the seven-day
calibration gap was 20.1 percentage points. The application labels both models
experimental and gives Summer estimates an additional warning.

## Why not just use the 10% rule?

The common “rank below 10% of class capacity” rule uses useful information, but
it discards the actual queue, time remaining, recent movement, course history,
and calendar. The model retains both absolute ranks and capacity-relative
ratios rather than imposing a single cutoff.

The production model was compared with both the literal 10% cutoff and the
naive same-course historical percentage on six chronological holdouts. For a
fair comparison with the historical method, every score below uses only rows
for which at least one prior lecture had cached evidence for the exact rank.
That subset covered 61.9% of Fall/Winter validation weight and 53.9% of Summer
validation weight.

| Season      | Method                | Mean Brier |   Mean ECE | Mean ROC AUC |
|-------------|-----------------------|-----------:|-----------:|-------------:|
| Fall/Winter | Oracle model          | **0.0427** | **0.0117** |   **0.9597** |
| Fall/Winter | Historical percentage |     0.0995 |     0.0901 |       0.6813 |
| Fall/Winter | 10% rule              |     0.2843 |     0.2843 |       0.6366 |
| Summer      | Oracle model          | **0.0414** | **0.0234** |   **0.9517** |
| Summer      | Historical percentage |     0.0669 |     0.0632 |       0.6754 |
| Summer      | 10% rule              |     0.2590 |     0.2590 |       0.6477 |

![Oracle model versus simple waitlist rules](docs/assets/model-baseline-benchmark.png)

On this common subset, the Oracle reduced the mean Brier error by 85.0% versus
the 10% rule and 57.1% versus the historical percentage in Fall/Winter. The
corresponding Summer reductions were 84.0% and 38.2%. The model won every
chronological fold.

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
