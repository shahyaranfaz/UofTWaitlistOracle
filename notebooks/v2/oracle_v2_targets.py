"""Target construction shared by the v2 cache notebook and automated tests."""


def cumulative_downward_movement(waitlists) -> int:
    """Sum every observed downward queue step in a forward trajectory."""
    values = [int(value) for value in waitlists]
    return sum(max(left - right, 0) for left, right in zip(values, values[1:]))


def label_position(
    observed_movement: int,
    position: int,
    terminal_gap_hours: float,
    maximum_negative_gap_hours: float,
):
    """Return 1/0 when observed, or None for a right-censored negative."""
    if int(position) <= int(observed_movement):
        return 1
    if float(terminal_gap_hours) > float(maximum_negative_gap_hours):
        return None
    return 0
