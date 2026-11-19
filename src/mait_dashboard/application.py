"""Hosts the dashboard widget; everything else runs in the browser."""

from datetime import datetime, timezone

from pydoover.models import (
    ConnectionConfig,
    ConnectionDetermination,
    ConnectionStatus,
    ConnectionType,
    DeploymentEvent,
)
from pydoover.models.data.connection import ConnectionDisplay
from pydoover.processor import Application

from .app_config import MaitDashboardConfig
from .app_ui import MaitDashboardUI


class MaitDashboard(Application):
    config_cls = MaitDashboardConfig
    ui_cls = MaitDashboardUI

    async def on_deployment(self, event: DeploymentEvent) -> None:
        # No data source of its own: mark it online and hide its connection
        # status rather than letting it read as offline.
        await self.api.ping_connection_at(
            datetime.now(timezone.utc),
            ConnectionStatus.continuous_online_no_ping,
            ConnectionDetermination.online,
            user_agent="mait_dashboard;dashboard",
        )
        await self.api.update_connection_config(
            ConnectionConfig(ConnectionType.periodic, display=ConnectionDisplay.never)
        )
