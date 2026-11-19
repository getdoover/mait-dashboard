"""AWS Lambda entry point for the MAIT dashboard processor."""

from typing import Any

from pydoover.processor import run_app

from .application import MaitDashboard


def handler(event: dict[str, Any], context: Any) -> None:
    run_app(MaitDashboard(), event, context)
