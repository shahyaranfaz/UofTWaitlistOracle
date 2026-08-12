import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "notebooks" / "v2"))

from oracle_v2_targets import cumulative_downward_movement, label_position


assert cumulative_downward_movement([10, 8]) == 2
assert cumulative_downward_movement([10, 12]) == 0

# Visible turnover remains movement even when later arrivals refill the queue.
assert cumulative_downward_movement([10, 5, 10, 5]) == 10
assert cumulative_downward_movement([30, 20, 30, 20]) == 20

# A reached rank is observed even when the archive ends early.
assert label_position(3, 3, 24, 6) == 1

# An unresolved negative is usable only with sufficiently complete follow-up.
assert label_position(1, 2, 5, 6) == 0
assert label_position(1, 2, 7, 6) is None

print("V2 target reconstruction tests passed")
