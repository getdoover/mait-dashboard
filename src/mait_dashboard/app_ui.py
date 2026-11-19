"""Registers the dashboard widget in the device page UI."""

from pathlib import Path

from pydoover import ui


class MaitDashboardUI(ui.UI, default_open=True):
    widget = ui.RemoteComponent(
        name="MaitDashboard",
        display_name="Site Dashboard",
        component_url="$config.app().dv_widget_url",
        scope="MaitDashboardWidget",
        module="./MaitDashboardWidget",
        app_key="$config.app().APP_KEY",
    )


def export() -> None:
    MaitDashboardUI(None, None, None).export(
        Path(__file__).parents[2] / "doover_config.json", "mait_dashboard"
    )
