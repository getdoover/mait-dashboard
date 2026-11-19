"""What the dashboard shows: ordered lists of tanks, pumps, flow meters and
pivots, each an app install on a device of the MAIT site.

The widget reads each install's tags (and a few display details from its
ui_state) straight from that device, so every device listed here must also be
granted under Devices (dv_proc_extended_permissions).
"""

from pathlib import Path

from pydoover import config
from pydoover.processor import ExtendedPermissionsConfig

APP_NAME = "mait_dashboard"


def _device(description: str) -> config.Device:
    return config.Device("Device", name="device", description=description)


def _app_key(default: str, what: str) -> config.String:
    return config.String(
        "App Key",
        name="app_key",
        default=default,
        description=f"The {what} install's app key on that device, e.g. '{default}'.",
    )


def _label() -> config.String:
    return config.String(
        "Label",
        name="label",
        default=None,
        required=False,
        description="Name shown on the dashboard. Defaults to the device name.",
    )


class TankItem(config.Object):
    device = _device("Device running the Analog Level Sensor Processor.")
    app_key = _app_key("analog_level_sensor_processor_1", "Analog Level Sensor Processor")
    label = _label()


class PumpItem(config.Object):
    device = _device("Device running Pump Control (Pump role).")
    app_key = _app_key("pump_control_1", "Pump Control")
    target = config.String(
        "Pump Target",
        name="target",
        description=(
            "The pump's Target in that Pump Control install (its Pumps list), "
            "e.g. 'pump_start' or 'pump_1'."
        ),
    )
    label = _label()


class FlowMeterItem(config.Object):
    device = _device("Device running the Flow Meter Processor.")
    app_key = _app_key("flow_meter_processor_1", "Flow Meter Processor")
    label = _label()


class PivotItem(config.Object):
    device = _device("Device running Pivot Control.")
    app_key = _app_key("pivot_control_1", "Pivot Control")
    label = _label()


class MaitDashboardConfig(config.Schema):
    title = config.String(
        "Title",
        name="title",
        default="Site Overview",
        description="Heading shown at the top of the dashboard.",
        position=1,
    )
    tanks = config.Array(
        "Tanks",
        name="tanks",
        element=TankItem("Tank"),
        default=[],
        description="Tank and storage levels, in the order shown.",
        position=2,
    )
    pumps = config.Array(
        "Pumps",
        name="pumps",
        element=PumpItem("Pump"),
        default=[],
        description=(
            "Pumps, in the order shown. Start and Stop press the pump's own "
            "Pump Control buttons, so the command, its pending state and its "
            "timeout are handled exactly as on the pump's page."
        ),
        position=3,
    )
    flow_meters = config.Array(
        "Flow Meters",
        name="flow_meters",
        element=FlowMeterItem("Flow Meter"),
        default=[],
        description="Flow meters, in the order shown.",
        position=4,
    )
    pivots = config.Array(
        "Pivots",
        name="pivots",
        element=PivotItem("Pivot"),
        default=[],
        description="Centre pivots, in the order shown.",
        position=5,
    )
    link_health_app_key = config.String(
        "Link Health App Key",
        name="link_health_app_key",
        default="link_health_1",
        required=False,
        description=(
            "App key of the Link Health install on each device, for its radio "
            "link status dot. Leave empty to hide link status."
        ),
        position=6,
    )
    low_level_pct = config.Number(
        "Low Level (%)",
        name="low_level_pct",
        default=30.0,
        description="Tanks at or below this level are shown amber.",
        position=7,
    )
    critical_level_pct = config.Number(
        "Critical Level (%)",
        name="critical_level_pct",
        default=10.0,
        description="Tanks at or below this level are shown red.",
        position=8,
    )
    stale_after_min = config.Number(
        "Stale After (min)",
        name="stale_after_min",
        default=30.0,
        description="A reading older than this is marked stale (it is still shown).",
        position=9,
    )
    extended_permissions = ExtendedPermissionsConfig(
        extra_fields=["name", "display_name", "app_installs__name", "app_installs__display_name"],
    )
    position = config.ApplicationPosition(default=10)
    full_width = config.ApplicationFullWidth(default=True)


def export() -> None:
    MaitDashboardConfig.export(
        Path(__file__).parents[2] / "doover_config.json", APP_NAME
    )
