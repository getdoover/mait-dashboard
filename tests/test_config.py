from mait_dashboard.app_config import MaitDashboardConfig


def _props():
    return MaitDashboardConfig.to_schema()["properties"]


def test_nothing_to_list_by_hand():
    # What to show is found from the devices' installs, not configured.
    props = _props()
    for key in ("tanks", "pumps", "flow_meters", "pivots", "link_health_app_key"):
        assert key not in props


def test_sees_its_own_group_by_default():
    perms = _props()["dv_proc_extended_permissions"]
    assert perms["x-defaultDeviceGroup"] is True
    assert {"groups", "devices"} <= set(perms["properties"])
    assert perms["x-extraDeviceFields"] == ["name", "display_name", "app_installs__id"]


def test_full_width_by_default():
    assert _props()["interpreter_full_width"]["default"] is True
