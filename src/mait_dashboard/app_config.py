"""Display settings for the dashboard.

The widget finds what to show by itself: every device this install is granted
under Devices (dv_proc_extended_permissions, its own group by default) is
checked for Pump Control (Pump role), Analog Level Sensor Processor, Flow Meter
Processor, Pivot Control and Link Health installs, and each row is named after
its device.
"""

from pathlib import Path

from pydoover import config
from pydoover.processor import ExtendedPermissionsConfig

APP_NAME = "mait_dashboard"


class MaitDashboardConfig(config.Schema):
    title = config.String(
        "Title",
        name="title",
        default="Site Overview",
        description="Heading shown at the top of the dashboard.",
        position=1,
    )
    low_level_pct = config.Number(
        "Low Level (%)",
        name="low_level_pct",
        default=30.0,
        description="Tanks at or below this level are shown amber.",
        position=2,
    )
    critical_level_pct = config.Number(
        "Critical Level (%)",
        name="critical_level_pct",
        default=10.0,
        description="Tanks at or below this level are shown red.",
        position=3,
    )
    stale_after_min = config.Number(
        "Stale After (min)",
        name="stale_after_min",
        default=30.0,
        description="A reading older than this is marked stale (it is still shown).",
        position=4,
    )
    extended_permissions = ExtendedPermissionsConfig(
        default_device_group=True,
        extra_fields=["name", "display_name", "app_installs__id"],
    )
    position = config.ApplicationPosition(default=10)
    full_width = config.ApplicationFullWidth(default=True)


def export() -> None:
    MaitDashboardConfig.export(
        Path(__file__).parents[2] / "doover_config.json", APP_NAME
    )
