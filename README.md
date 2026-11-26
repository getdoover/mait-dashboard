# MAIT Dashboard

One page for a whole MAIT iNTELLiNet water site: every pump with Start and Stop, every tank level, every flow meter and every pivot, each with its radio link status. It reads the devices the MAIT bridge feeds, through the apps that already run on them: **Pump Control**, **Analog Level Sensor Processor**, **Flow Meter Processor**, **Pivot Control** and **Link Health**.

Install it on any device (a site's Doovit, or a dashboard device of its own). It never needs to run on the devices it shows.

There is nothing to list by hand. The dashboard looks at every device in its own group (or the devices chosen under **Devices** in its settings) and shows whatever runs there: every pump of each Pump Control in the Pump role, and every Analog Level Sensor Processor, Flow Meter Processor and Pivot Control. Each device's apps are read live from what is deployed on it, so a new device, or a new app on one, appears once it is deployed. Within each section, rows are in alphabetical order.

## What it shows

Each kind of item is its own section: a table with one row per item and the same columns down the section, so values can be compared at a glance. On a narrow screen a section scrolls sideways with the names pinned.

- **Pumps**: the state each pump reports (Running, Stopped, Fault, Unknown), how long it has been running or when it stopped, its run hours and starts today, and Start / Stop. While Pump Control is waiting for the pump to confirm a command, the pump shows *Starting…* or *Stopping…*. If the pump doesn't confirm in time, Pump Control's warning appears under the pump's row.
- **Tanks**: the level as a percentage and a bar marked at the low and critical levels, coloured blue when the level is fine, amber when low and red when critical. The row also shows the level in the sensor's own units, and the volume when the sensor app shows one. A sensor fault is shown as a fault, never as an empty tank.
- **Flow**: the flow rate in the meter's display units, on a bar scaled to the meter's own gauge range. The bar animates while water is flowing. The row also shows today's, yesterday's and the total volume.
- **Pivots**: running state and direction, arm angle on a dial, speed and safety.
- **Radio link**: a *Last heard* column on every section, from the device's Link Health install (the first, by app key, if it has several): green when online, amber when degraded, red when offline. Hover over it to see the route and link success. A row whose device hasn't been heard from for longer than *Stale After* says *Stale*, with its last values still shown.

Each row is named after its device. When a device has more than one item in a section, such as two pumps on one Pump Control, the item's own name is added: *Fert Pump East · Pump 1*. Click a name to open the device's page.

Nothing is hidden because its value is zero, missing or old. An item with no data yet shows "No reading yet".

## Start and Stop

The dashboard presses the pump's own Pump Control button. Start or Stop posts the same `ui_cmds` RPC message on the pump's device that the button on that device's page sends (method `p_<target>_start` / `p_<target>_stop` for the install's app key). Pump Control then publishes the command on its command channel, tracks it as pending, and times it out exactly as it does for a press on the pump's own page. For a timed pump, Start opens a popup asking how many minutes to run, filled in with the time in the pump page's *Start For (min)* input and limited to the pump's maximum run time. The chosen time is saved to that input, exactly where the pump page keeps it, before the Start is sent, so Pump Control runs the pump for that long and the pump page shows the same time. A latched pump's Start, and every Stop, asks for confirmation in the row.

The row always shows the state the pump reports, never the state that was asked for.

## Configuration

| Setting | What it does |
|---|---|
| **Title** | Heading at the top of the dashboard. |
| **Low Level (%)** / **Critical Level (%)** | Tank colour bands (default 30 % and 10 %). |
| **Stale After (min)** | How long since a device was last heard before its row is marked stale (default 30). |
| **Devices** | Which devices the dashboard looks at. Set to the dashboard device's own group when it is installed; groups include their sub-groups. |

## Tags and channels read

| App | Tags |
|---|---|
| Pump Control | `p_<target>_running`, `_state`, `_pending`, `_fault`, `_start_hidden`, `_stop_hidden`, `_cmd_text`, `_cmd_warning`, `_ends_at`, `_last_started`, `_last_stopped`, `_hours_today`, `_starts_today`, `_name` |
| Analog Level Sensor Processor | `level_filled_percentage`, the level tag its page shows, `level_volume`, `sensor_fault`, `sensor_fault_message` |
| Flow Meter Processor | the rate and volume tags its page shows, `flowing`, `last_flow_ts`, `sensor_fault` |
| Pivot Control | `state`, `status`, `direction`, `angle_deg`, `heading`, `speed_percent`, `safety_ok`, `pending_command` |
| Link Health | `status`, `status_label`, `status_colour`, `last_heard_ts`, `route`, `link_success_pct` |

Each device's `deployment_config` says which of these apps it runs (and, for Pump Control, its role and pumps). That channel keeps the settings of an app that has been removed, so an install is shown only while control lists it on the device: from the dashboard's device map, or, for a device whose apps have changed since the map was built, from control's install list for that device. Units, precision and gauge ranges come from each app's own page (`ui_state`), so the dashboard shows the same units as the device page. Writes go only to a pump device's `ui_cmds`, and only when someone confirms Start or Stop (Start on a timed pump also writes its `p_<target>_minutes` run time).
