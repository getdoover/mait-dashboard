import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buttonRpc,
  deployedInstallIds,
  discoverSite,
  flowView,
  levelBand,
  linkView,
  parseConfig,
  pivotView,
  pumpView,
  rpcMarker,
  runTime,
  runTimeValue,
  slug,
  tankView,
} from "../src/lib/model.ts";

test("config keeps only the display settings", () => {
  const c = parseConfig({ title: "Barmount", stale_after_min: 5 });
  assert.equal(c.title, "Barmount");
  assert.equal(c.staleAfterMs, 300_000);
  assert.equal(parseConfig(undefined).lowLevelPct, 30);
});

const app = (name: string, display: string, extra: Record<string, unknown> = {}) => ({ APPLICATION_NAME: name, APP_DISPLAY_NAME: display, ...extra });

test("discovery finds every shown app on each device, named after the device", () => {
  const site = discoverSite(
    [
      { id: "1", name: "Fert Pump East" },
      { id: "2", name: "Turkeys Nest" },
      { id: "3", name: "Eastern Diesel Pump" },
      { id: "4", name: "Dashboard" },
    ],
    {
      "1": {
        applications: {
          pump_control_1: app("pump_control", "Fert Pumps", {
            role: "Pump",
            pumps: [{ target: "pump_2", name: "Pump 2" }, { target: "pump_1", name: "Pump 1" }, { name: "no target" }],
          }),
          flow_meter_processor_1: app("flow_meter_processor", "Flow"),
          link_health_1: app("link_health", "Link Health"),
        },
      },
      "2": {
        applications: {
          pump_control_1: app("pump_control", "Auto-Fill", { role: "Auto-fill (storage)", pumps: [] }),
          flow_meter_processor_2: app("flow_meter_processor", "Flow Meter 2"),
          flow_meter_processor_1: app("flow_meter_processor", "Inflow"),
          analog_level_sensor_processor_1: app("analog_level_sensor_processor", "Turkeys Nest Level"),
          link_health_2: app("link_health", "Second Link"),
          link_health_1: app("link_health", "Link Health"),
        },
      },
      "3": { applications: { pump_control_1: app("pump_control", "Diesel Pump", { role: "Pump", pumps: [{ target: "pump_start", name: "Diesel Pump" }] }) } },
      "4": { applications: { mait_dashboard_1: app("mait_dashboard", "Site Dashboard") } },
    },
  );
  assert.deepEqual(
    site.pumps.map((p) => [p.title, p.device, p.appKey, p.target]),
    [
      ["Eastern Diesel Pump", "3", "pump_control_1", "pump_start"],
      ["Fert Pump East · Pump 1", "1", "pump_control_1", "pump_1"],
      ["Fert Pump East · Pump 2", "1", "pump_control_1", "pump_2"],
    ],
  );
  assert.deepEqual(site.tanks.map((t) => t.title), ["Turkeys Nest"]);
  assert.deepEqual(
    site.flowMeters.map((f) => [f.title, f.appKey]),
    [
      ["Fert Pump East", "flow_meter_processor_1"],
      ["Turkeys Nest · Flow Meter 2", "flow_meter_processor_2"],
      ["Turkeys Nest · Inflow", "flow_meter_processor_1"],
    ],
  );
  assert.deepEqual(site.pivots, []);
  assert.deepEqual(site.linkKey, { "1": "link_health_1", "2": "link_health_1" });
});

test("discovery tolerates devices whose deployment_config has not loaded", () => {
  const site = discoverSite([{ id: "1", name: "A" }], {});
  assert.deepEqual([site.pumps, site.tanks, site.flowMeters, site.pivots, site.linkKey], [[], [], [], [], {}]);
});

test("a removed install's leftover block is not shown, and is what makes a device worth checking", () => {
  const dc = {
    applications: {
      analog_level_sensor_processor_1: app("analog_level_sensor_processor", "Channel Level", { APP_INSTALL_ID: "10" }),
      pump_control_1: app("pump_control", "Diesel Pumps", { APP_INSTALL_ID: "11", role: "Pump", pumps: [{ target: "eastern_pump", name: "Eastern Pump" }] }),
      mait_bridge_1: app("mait_bridge", "Bridge", { APP_INSTALL_ID: "12" }),
    },
  };
  assert.deepEqual(deployedInstallIds(dc).sort(), ["10", "11"]);
  const site = discoverSite([{ id: "1", name: "Pump Channel", installs: new Set(["10"]) }], { "1": dc });
  assert.deepEqual(site.pumps, []);
  assert.deepEqual(site.tanks.map((t) => t.title), ["Pump Channel"]);
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

test("a chosen run time lands where the pump page's input keeps it, and runTime reads it back", () => {
  const value = runTimeValue("pump_control_2", "Pump 1", 45);
  assert.deepEqual(value, { pump_control_2: { p_Pump_1_minutes: 45 } });
  assert.deepEqual(runTime({ default: 30, max: 120 }, value.pump_control_2 as Record<string, unknown>, "Pump 1"), { minutes: 45, max: 120 });
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
