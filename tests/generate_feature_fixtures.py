import argparse
import json
import math
from pathlib import Path


DAY = 86_400
DEADLINE = 2_000_000_000


def capacity_at(meeting, timestamp):
    complex_capacity = meeting.get("enrollmentCapComplex")
    if not complex_capacity:
        return meeting["enrollmentCap"]
    capacity = complex_capacity.get("initialCap", meeting["enrollmentCap"])
    for change in complex_capacity.get("capChanges", []):
        time = change.get("time", change.get("timing", change.get("timestamp", 0)))
        if time <= timestamp:
            capacity = change.get("newCapacity", change.get("capAfter", change.get("newCap", change.get("capacity", capacity))))
    return capacity


def snapshot_at(course, deadline, days_remaining, maximum_index):
    target = deadline - days_remaining * DAY
    candidates = [(abs(time - target), index) for index, time in enumerate(course["timeIntervals"][: maximum_index + 1]) if time <= deadline]
    return min(candidates)[1] if candidates else -1


def campus(code):
    digit = code[-2]
    return {"3": "SCAR", "5": "ERIN"}.get(digit, "ARTSC")


def model_features(case):
    code, current, meeting, position = case["code"], case["current"], case["meeting"], case["position"]
    course, deadline, days = current["course"], current["deadline"], current["daysRemaining"]
    maximum = min(len(course["timeIntervals"]), len(meeting.get("enrollmentLogs", []))) - 1
    index = snapshot_at(course, deadline, days, maximum)
    index3 = snapshot_at(course, deadline, days + 3, maximum)
    index7 = snapshot_at(course, deadline, days + 7, maximum)
    time, time7 = course["timeIntervals"][index], course["timeIntervals"][index7]
    capacity, capacity7 = capacity_at(meeting, time), capacity_at(meeting, time7)
    waitlist_at = lambda i: max(meeting["enrollmentLogs"][i] - capacity_at(meeting, course["timeIntervals"][i]), 0)
    observed = waitlist_at(index)
    waitlist = max(observed, position)
    movement3, movement7 = waitlist_at(index3) - observed, waitlist_at(index7) - observed
    near7 = int(days <= 7)
    suffix = code[-1]
    term = {"F": "fall", "S": "winter"}.get(suffix, "full_year")
    current_campus = campus(code)
    position_capacity = position / capacity if capacity else 0
    waitlist_capacity = waitlist / capacity if capacity else 0
    return {
        "position_to_capacity": position_capacity, "waitlist_to_capacity": waitlist_capacity,
        "days_to_deadline": days, "movement_3d": movement3, "movement_7d": movement7,
        "position": position, "waitlist": waitlist, "capacity": capacity,
        "capacity_changed_7d": int(capacity != capacity7),
        "position_to_waitlist": min(position / waitlist, 1) if waitlist else 1,
        "days_squared": days ** 2, "log_waitlist": math.log1p(waitlist),
        "movement_velocity_7d": movement7 / 7, "near_deadline_7d": near7,
        "days_under_7": max(7 - days, 0), "days_under_14": max(14 - days, 0),
        "days_over_60": max(days - 60, 0), "second_subsession_days": int(suffix == "S") * days,
        "second_subsession_near_7d": int(suffix == "S") * near7,
        "position_ratio_near_7d": position_capacity * near7,
        "waitlist_ratio_near_7d": waitlist_capacity * near7,
        "rank_over_30pct": int(position_capacity > 0.30),
        "campus_erin": int(current_campus == "ERIN"), "campus_scar": int(current_campus == "SCAR"),
        "term_winter": int(term == "winter"), "term_full_year": int(term == "full_year"),
        "winter_near_7d": int(term == "winter") * near7,
        "scar_near_7d": int(current_campus == "SCAR") * near7,
        "course_code": code, "campus": current_campus, "term": term,
    }


def raw_case(name, code, days, offsets, logs, capacity, position, changes=None):
    meeting = {"enrollmentCap": capacity, "enrollmentLogs": logs}
    if changes is not None:
        meeting["enrollmentCapComplex"] = {"initialCap": capacity, "capChanges": changes}
    course = {"timeIntervals": [DEADLINE - offset * DAY for offset in offsets]}
    return {"name": name, "code": code, "current": {"course": course, "deadline": DEADLINE, "daysRemaining": days}, "meeting": meeting, "position": position}


CASES = [
    raw_case("fall_capacity_change", "CSC369H1F", 1, [10, 7, 3, 1], [125, 127, 124, 126], 100, 20, [{"time": DEADLINE - 2 * DAY, "newCapacity": 110}]),
    raw_case("winter_erin_short_log", "CSC108H5S", 1, [12, 8, 4, 1], [160, 150, 140], 120, 5),
    raw_case("fall_scar_long_horizon", "MATA32H3F", 65, [75, 72, 65, 60], [230, 220, 210, 205], 200, 15),
    raw_case("full_year_rank_above_queue", "BIO120Y1Y", 10, [20, 17, 13, 10], [92, 95, 93, 91], 90, 8),
]


def payload():
    return {"generator": "tests/generate_feature_fixtures.py", "cases": [{**case, "expected": model_features(case)} for case in CASES]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", type=Path)
    args = parser.parse_args()
    rendered = json.dumps(payload(), indent=2, sort_keys=True) + "\n"
    if args.check:
        if json.loads(args.check.read_text(encoding="utf-8")) != payload():
            raise SystemExit(f"Feature fixture is stale: regenerate {args.check}")
        print("Python feature fixture is current")
    else:
        print(rendered, end="")
