"""Target construction shared by the v2 cache notebook and automated tests."""


def net_drop_to_deadline(start_waitlist: int, terminal_waitlist: int) -> int:
    """Observed net queue shrinkage, never cumulative temporary drops."""
    return max(int(start_waitlist) - int(terminal_waitlist), 0)


def label_position(
    start_waitlist: int,
    terminal_waitlist: int,
    position: int,
    terminal_gap_hours: float,
    maximum_negative_gap_hours: float,
):
    """Return 1/0 when observed, or None for a right-censored negative."""
    movement = net_drop_to_deadline(start_waitlist, terminal_waitlist)
    if int(position) <= movement:
        return 1
    if float(terminal_gap_hours) > float(maximum_negative_gap_hours):
        return None
    return 0
