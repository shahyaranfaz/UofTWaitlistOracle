# UofT Waitlist Oracle

An explainable, static waitlist estimator for University of Toronto courses. It compares a student's current position with the same course's historical enrollment trajectories from the public [Enrollment Data](https://github.com/ICPRplshelp/Enrollment-Data) archive.

## What it does

- Uses only prior offerings of the same course as evidence.
- Aligns offerings by days remaining until the waitlist deadline.
- Infers waitlist demand as `max(enrollment - capacity, 0)` while a section is full.
- Shows the individual historical outcomes behind every estimate.
- Runs entirely in the browser and can be hosted on GitHub Pages.

The result is a historical estimate, not a guarantee or an official U of T service.

## Run locally

Because the app fetches public JSON, serve the folder instead of opening `index.html` directly:

```sh
python -m http.server 8000
```

Then visit <http://localhost:8000>.

## Deploy

Push to GitHub and enable **Settings → Pages → Source: GitHub Actions**. The included workflow deploys the site on every push to `main` or `master`.

## Method

For every previous Fall/Winter or Summer session where the requested course exists, the app:

1. Locates the snapshot with the same number of days remaining before that session's waitlist deadline.
2. Reconstructs waitlist demand from the combined enrollment log and the capacity at that time.
3. Measures how many positions cleared between that snapshot and the deadline.
4. Counts how often the user's position would have cleared.

The displayed percentage is the direct empirical rate: `cleared / comparable offerings`. Raw outcomes remain visible, and confidence is deliberately tied to the small number of available prior offerings.

## Data credit

Historical data is maintained by [ICPRplshelp](https://github.com/ICPRplshelp/Enrollment-Data) and originates from U of T's public timetable builder. The upstream repository asks consumers not to use Git to fetch the dataset; this app requests only the few public JSON files needed for the selected course.
