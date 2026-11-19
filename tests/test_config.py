from mait_dashboard.app_config import MaitDashboardConfig


def _props():
    return MaitDashboardConfig.to_schema()["properties"]


def test_lists_are_ordered_arrays_of_device_items():
    props = _props()
    for key, app_key in [
        ("tanks", "analog_level_sensor_processor_1"),
        ("pumps", "pump_control_1"),
        ("flow_meters", "flow_meter_processor_1"),
        ("pivots", "pivot_control_1"),
    ]:
        item = props[key]["items"]["properties"]
        assert item["device"]["format"] == "doover-resource-device"
        assert item["app_key"]["default"] == app_key
        assert props[key]["default"] == []


def test_pumps_need_a_target():
    item = _props()["pumps"]["items"]
    assert {"device", "target"} <= set(item["required"])


def test_extended_permissions_present():
    perms = _props()["dv_proc_extended_permissions"]
    assert "devices" in perms["properties"]


def test_full_width_by_default():
    assert _props()["interpreter_full_width"]["default"] is True
