import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buttonRpc,
  flowView,
  levelBand,
  linkView,
  parseConfig,
  pivotView,
  pumpView,
  rpcMarker,
  runTime,
  slug,
  tankView,
} from "../src/lib/model.ts";

test("config lists keep order, fill default app keys and drop incomplete items", () => {
  const c = parseConfig({
    tanks: [{ device: "2", label: "B" }, { device: "1", app_key: "analog_level_sensor_processor_2" }, { label: "no device" }],
    pumps: [{ device: "5", target: "pump_start" }, { device: "6" }],
    stale_after_min: 5,
  });
  assert.deepEqual(c.tanks.map((t) => [t.device, t.appKey, t.label]), [
    ["2", "analog_level_sensor_processor_1", "B"],
    ["1", "analog_level_sensor_processor_2", undefined],
  ]);
  assert.deepEqual(c.pumps, [{ device: "5", appKey: "pump_control_1", target: "pump_start", label: undefined }]);
  assert.equal(c.linkHealthAppKey, "link_health_1");
  assert.equal(c.staleAfterMs, 300_000);
  assert.equal(parseConfig({ link_health_app_key: "" }).linkHealthAppKey, null);
});

test("slug matches Pump Control", () => {
  assert.equal(slug("pump_start"), "pump_start");
  assert.equal(slug(" Pump 1 "), "Pump_1");
  assert.equal(slug(""), "pump");
});

test("pump shows reported state, pending over running, fault over all", () => {
  assert.equal(pumpView(undefined, "pump_start").status, "nodata");
  const running = pumpView({ p_pump_start_running: true, p_pump_start_start_hidden: true, p_pump_start_stop_hidden: false }, "pump_start");
  assert.equal(running.status, "running");
  assert.equal(running.showStart, false);
  assert.equal(running.showStop, true);
  const pending = pumpView({ p_pump_start_running: true, p_pump_start_pending: { command: "stop", sent_at: 10 } }, "pump_start");
  assert.equal(pending.status, "pending");
  assert.equal(pending.pendingVerb, "stop");
  assert.equal(pumpView({ p_pump_start_running: true, p_pump_start_fault: true }, "pump_start").status, "fault");
  assert.equal(pumpView({ p_pump_start_state: "Unknown" }, "pump_start").status, "unknown");
  // Another pump's tags in the same install don't count.
  assert.equal(pumpView({ p_pump_2_running: true }, "pump_1").status, "nodata");
  const warned = pumpView({ p_pump_1_running: false, p_pump_1_cmd_warning: "No confirmation", p_pump_1_cmd_warning_hidden: false }, "pump_1");
  assert.equal(warned.warning, "No confirmation");
});

test("run time: operator's last entry, else the input's default; none when latched", () => {
  const el = { default: 60, max: 720 };
  assert.deepEqual(runTime(el, undefined, "pump_start"), { minutes: 60, max: 720 });
  assert.deepEqual(runTime(el, { p_pump_start_minutes: 15 }, "pump_start"), { minutes: 15, max: 720 });
  assert.equal(runTime(undefined, { p_pump_start_minutes: 15 }, "pump_start"), undefined);
});

test("Start/Stop post exactly the pump page's button RPC", () => {
  const actor = { id: "1", name: "A B", email: "a@b" };
  assert.deepEqual(buttonRpc("pump_control_1", "pump_start", "stop", 123, actor), {
    type: "rpc",
    app_key: "pump_control_1",
    method: "p_pump_start_stop",
    request: 123,
    actor,
    label: "Stop",
  });
  assert.deepEqual(rpcMarker("pump_control_1", "p_pump_start_start", "99"), {
    pump_control_1: { v2: { p_pump_start_start: { message_id: "99" } } },
  });
});

test("tank bands and fault", () => {
  assert.equal(levelBand(null, 30, 10), "nodata");
  assert.equal(levelBand(5, 30, 10), "critical");
  assert.equal(levelBand(30, 30, 10), "low");
  assert.equal(levelBand(31, 30, 10), "ok");
  const ui = { children: { level_reading: { currentValue: "$tag.app().level_reading_display:number:null", units: "ft", decPrecision: 1 } } };
  const v = tankView({ level_filled_percentage: 120, level_reading_display: 3.2 }, ui, 30, 10);
  assert.equal(v.pct, 100);
  assert.equal(v.level, 3.2);
  assert.equal(v.levelUnits, "ft");
  const f = tankView({ sensor_fault: "under_range", sensor_fault_message: "check wiring", level_filled_percentage: 0 }, undefined, 30, 10);
  assert.equal(f.band, "fault");
  assert.equal(f.pct, null);
  assert.equal(f.faultText, "check wiring");
  // Zero is a reading, not missing data.
  assert.equal(tankView({ level_filled_percentage: 0 }, undefined, 30, 10).band, "critical");
});

test("flow uses the flow app's display tags, units and range", () => {
  const ui = {
    children: {
      flow_rate: { currentValue: "$tag.app().flow_rate_display:number:null", units: "kL/min", decPrecision: 3, ranges: [{ min: 0, max: 4 }] },
      total_volume: { currentValue: "$tag.app().total_volume_display:number:null", units: "kL", decPrecision: 2 },
    },
  };
  const v = flowView({ flow_rate_display: 1.5, total_volume_display: 0, flowing: true }, ui);
  assert.equal(v.rate, 1.5);
  assert.equal(v.rateUnits, "kL/min");
  assert.equal(v.rateMax, 4);
  assert.equal(v.total, 0);
  assert.equal(flowView(undefined, undefined).rate, null);
});

test("pivot and link", () => {
  assert.equal(pivotView(undefined).state, "nodata");
  assert.equal(pivotView({ state: "running", angle_deg: 10 }).angle, 10);
  assert.equal(pivotView({ status: "No reading yet" }).state, "unknown");
  assert.equal(linkView({ status: "offline", status_label: "Offline" })?.status, "offline");
  assert.equal(linkView(undefined), undefined);
});
