# MAIT Dashboard

One page for a whole MAIT iNTELLiNet water site: every pump with Start and Stop, every tank level, every flow meter and every pivot, each with its radio link status. It reads the devices the MAIT bridge feeds, through the apps that already run on them: **Pump Control**, **Analog Level Sensor Processor**, **Flow Meter Processor**, **Pivot Control** and **Link Health**.

Install it on any device (a site's Doovit, or a dashboard device of its own). It never needs to run on the devices it shows.

## What it shows

- **Pumps**: the state each pump reports (Running, Stopped, Fault, Unknown), how long it has been running or when it stopped, its run hours and starts today, and Start / Stop. While Pump Control is waiting for the pump to confirm a command, the pump shows *Starting…* or *Stopping…*. If the pump doesn't confirm in time, Pump Control's warning appears on the card.
- **Tanks**: a tank graphic filled to the reported level, coloured blue when the level is fine, amber when low and red when critical. The card also shows the level in the sensor's own units, and the volume when the sensor app shows one. A sensor fault is shown as a fault, never as an empty tank.
- **Flow**: the flow rate in the meter's display units, on a bar scaled to the meter's own gauge range. The bar animates while water is flowing. The card also shows today's, yesterday's and the total volume.
- **Pivots**: running state and direction, arm angle on a dial, speed and safety.
- **Radio link**: a dot on every card from the device's Link Health install: green when online, amber when degraded, red when offline. Hover over it to see the route, link success and when the device was last heard. A card whose device hasn't been heard from for longer than *Stale After* says so, with its last values still shown.

Nothing is hidden because its value is zero, missing or old. An item with no data yet shows "No reading yet".

## Start and Stop

The dashboard presses the pump's own Pump Control button. Start or Stop posts the same `ui_cmds` RPC message on the pump's device that the button on that device's page sends (method `p_<target>_start` / `p_<target>_stop` for the install's app key). Pump Control then publishes the command on its command channel, tracks it as pending, and times it out exactly as it does for a press on the pump's own page. Every press asks for confirmation on the card first. For a timed pump, Start runs for the time in the pump page's *Start For (min)* input, which is the pump's default run time unless an operator has changed it there.

The card always shows the state the pump reports, never the state that was asked for.

## Configuration

| Setting | What it does |
|---|---|
| **Title** | Heading at the top of the dashboard. |
| **Tanks** | Ordered list: the device, the Analog Level Sensor Processor app key on it (default `analog_level_sensor_processor_1`) and an optional label. |
| **Pumps** | Ordered list: the device, the Pump Control app key (default `pump_control_1`), the pump's **Target** in that install (e.g. `pump_start`, `pump_1`) and an optional label. List each pump of a multi-pump install separately. |
| **Flow Meters** | Ordered list: the device, the Flow Meter Processor app key (default `flow_meter_processor_1`) and an optional label. |
| **Pivots** | Ordered list: the device, the Pivot Control app key (default `pivot_control_1`) and an optional label. |
| **Link Health App Key** | The Link Health install on each device (default `link_health_1`). Leave empty to hide link status. |
| **Low Level (%)** / **Critical Level (%)** | Tank colour bands (default 30 % and 10 %). |
| **Stale After (min)** | How long since a device was last heard before its card is marked stale (default 30). |
| **Devices** | Grant every device listed above here (`dv_proc_extended_permissions`). |

Labels default to the device name, with the install's own name underneath.

## Tags and channels read

| App | Tags |
|---|---|
| Pump Control | `p_<target>_running`, `_state`, `_pending`, `_fault`, `_start_hidden`, `_stop_hidden`, `_cmd_text`, `_cmd_warning`, `_ends_at`, `_last_started`, `_last_stopped`, `_hours_today`, `_starts_today`, `_name` |
| Analog Level Sensor Processor | `level_filled_percentage`, the level tag its page shows, `level_volume`, `sensor_fault`, `sensor_fault_message` |
| Flow Meter Processor | the rate and volume tags its page shows, `flowing`, `last_flow_ts`, `sensor_fault` |
| Pivot Control | `state`, `status`, `direction`, `angle_deg`, `heading`, `speed_percent`, `safety_ok`, `pending_command` |
| Link Health | `status`, `status_label`, `status_colour`, `last_heard_ts`, `route`, `link_success_pct` |

Units, precision and gauge ranges come from each app's own page (`ui_state`), so the dashboard shows the same units as the device page. Writes go only to a pump device's `ui_cmds`, and only when someone confirms Start or Stop.
