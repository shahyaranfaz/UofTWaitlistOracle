import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "notebooks" / "v2"))

from oracle_v2_targets import label_position, net_drop_to_deadline


assert net_drop_to_deadline(10, 8) == 2
assert net_drop_to_deadline(10, 12) == 0

# Temporary drops and recoveries do not matter. Only the start and terminal
# queues define the V2 target, so churn cannot be counted repeatedly.
assert net_drop_to_deadline(10, 9) == 1

# A reached rank is observed even when the archive ends early.
assert label_position(10, 7, 3, 24, 6) == 1

# An unresolved negative is usable only with sufficiently complete follow-up.
assert label_position(10, 9, 2, 5, 6) == 0
assert label_position(10, 9, 2, 7, 6) is None

print("V2 target reconstruction tests passed")
