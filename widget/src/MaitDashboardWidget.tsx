import "./styles.css";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useQueries, useQuery } from "@tanstack/react-query";
import RemoteComponentWrapper from "customer_site/RemoteComponentWrapper";
import { useRemoteParams } from "customer_site/useRemoteParams";
import { useAgentChannel, useDeviceMap, useDooverClient, useMultiAgentAggregates } from "doover-js/react";

import {
  COLOURS,
  FlowRow,
  PivotRow,
  PumpRow,
  TankRow,
  flowColumns,
  pivotColumns,
  pumpColumns,
  tankColumns,
  type SendState,
} from "./components/rows";
import { Dot, GridSection, Message } from "./components/ui";
import { fmtClock } from "./lib/format";
import {
  buttonRpc,
  deployedInstallIds,
  discoverSite,
  flowView,
  isStale,
  linkView,
  parseConfig,
  pivotView,
  pumpView,
  readPath,
  rpcMarker,
  runTime,
  runTimeValue,
  slug,
  tankView,
  uiAppPath,
  uiElementPath,
  type Dict,
  type ItemConfig,
} from "./lib/model";

interface WidgetProps {
  uiElement?: { app_key?: string };
}

interface DeploymentConfig {
  applications?: Record<string, Dict>;
}

type TagValues = Record<string, Dict>;

interface MapEntry {
  [extra: string]: unknown;
  id: string;
  name?: string | null;
  display_name?: string | null;
  app_installs?: Array<{ id?: string | number | null }>;
}

interface InstallList {
  results?: Array<{ id?: string | number; archived?: boolean }>;
}

/** The host's control-API client. The web site provides it; the native app's offline wrapper does not. */
interface ControlRest {
  config: { controlApiUrl?: string };
  get<T>(path: string, query?: Record<string, string | number>, baseUrl?: string): Promise<T>;
}
const controlRest = (client: unknown): ControlRest | undefined => {
  const rest = (client as { rest?: ControlRest } | null)?.rest;
  return rest && typeof rest.get === "function" && rest.config?.controlApiUrl ? rest : undefined;
};

function useNow(intervalMs = 5_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/** The host site's page for a device. */
const devicePage = (deviceId: string) => `/agent/${deviceId}`;

function DashboardInner({ uiElement }: WidgetProps) {
  const params = useRemoteParams();
  const agentId = params?.agentId == null ? undefined : String(params.agentId);
  const appKey = uiElement?.app_key;
  const now = useNow();
  const client = useDooverClient();

  const { data: deployment, isLoading } = useAgentChannel<DeploymentConfig>(agentId, "deployment_config");
  const appConfig = appKey ? deployment?.applications?.[appKey] : undefined;
  const cfg = useMemo(() => parseConfig(appConfig), [appConfig]);

  // The devices this install was granted (its own group by default), the
  // dashboard's own device included. What each one runs is read live from
  // its deployment_config, so new installs appear without redeploying this.
  const deviceMap = useDeviceMap<MapEntry>(agentId, appKey, { excludeSelf: false });
  const deviceIds = deviceMap.deviceIds;
  const configs = useMultiAgentAggregates<DeploymentConfig>("deployment_config", deviceIds);

  // The device map's install list is control's, but only as fresh as this
  // install's last deploy or permission sync. A device's deployment_config is
  // live but keeps removed installs. Where they disagree (a new install, or a
  // removed one), ask control for that device's installs now.
  const mapInstalls = useMemo(
    () => Object.fromEntries(deviceMap.devices.map((d) => [d.id, new Set((d.app_installs ?? []).map((a) => String(a.id)))])),
    [deviceMap.devices],
  );
  const unsure = useMemo(
    () => deviceIds.filter((id) => deployedInstallIds(configs.aggregatesByAgent[id]?.data).some((i) => !mapInstalls[id]?.has(i))),
    [deviceIds, configs.aggregatesByAgent, mapInstalls],
  );
  const rest = controlRest(client);
  const checked = useQueries({
    queries: (rest ? unsure : []).map((id) => ({
      queryKey: ["mait_dashboard", "installs", id],
      queryFn: () => rest!.get<InstallList>(`/devices/${id}/app_installs/`, { archived: "false", per_page: 100 }, rest!.config.controlApiUrl),
      staleTime: 60_000,
      retry: 1,
    })),
  });
  const site = useMemo(() => {
    const live: Record<string, Set<string>> = {};
    (rest ? unsure : []).forEach((id, n) => {
      const rows = checked[n]?.data?.results;
      if (rows) live[id] = new Set(rows.filter((r) => r.archived !== true).map((r) => String(r.id)));
    });
    const devices = deviceMap.devices.map((d) => ({
      id: d.id,
      name: d.display_name || d.name || `Device ${d.id}`,
      installs: live[d.id] ?? mapInstalls[d.id],
    }));
    const dcs = Object.fromEntries(deviceIds.map((id) => [id, configs.aggregatesByAgent[id]?.data]));
    return discoverSite(devices, dcs);
    // `checked` is a new array each render; its data is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceMap.devices, deviceIds, configs.aggregatesByAgent, mapInstalls, unsure, checked.map((q) => q.dataUpdatedAt).join()]);

  const all: ItemConfig[] = useMemo(() => [...site.pumps, ...site.tanks, ...site.flowMeters, ...site.pivots], [site]);
  const tagDevices = useMemo(() => uniq([...all.map((i) => i.device), ...Object.keys(site.linkKey)]), [all, site.linkKey]);
  const tagFields = useMemo(() => uniq([...all.map((i) => i.appKey), ...Object.values(site.linkKey)]), [all, site.linkKey]);
  // Only the display details each card needs: units, gauge ranges and a
  // pump's run-time input. A whole ui_state is tens of kB per device.
  const uiFields = useMemo(
    () =>
      uniq([
        ...[...site.tanks, ...site.flowMeters].map((i) => uiAppPath(i.appKey)),
        ...site.pumps.map((p) => uiElementPath(p.appKey, `p_${slug(p.target)}`, `p_${slug(p.target)}_minutes`)),
      ]),
    [site],
  );
  const uiDevices = useMemo(() => uniq([...site.tanks, ...site.flowMeters, ...site.pumps].map((i) => i.device)), [site]);
  const pumpDevices = useMemo(() => uniq(site.pumps.map((p) => p.device)), [site]);
  const pumpKeys = useMemo(() => uniq(site.pumps.map((p) => p.appKey)), [site]);

  const tags = useMultiAgentAggregates<TagValues>("tag_values", tagDevices, { fields: tagFields });
  const ui = useMultiAgentAggregates<Dict>("ui_state", uiDevices, { fields: uiFields });
  const cmds = useMultiAgentAggregates<Record<string, Dict>>("ui_cmds", pumpDevices, { fields: pumpKeys });

  const me = useQuery({ queryKey: ["mait_dashboard", "me"], queryFn: () => client.users.getMe(), staleTime: Infinity, retry: 1 });
  const actor = useMemo(() => {
    const u = me.data;
    if (!u) return undefined;
    const full = [u.first_name, u.last_name].filter((x) => typeof x === "string" && x).join(" ");
    return { id: String(u.id), name: full || String(u.username ?? u.name ?? u.email ?? u.id), email: String(u.email ?? "") };
  }, [me.data]);

  const [sending, setSending] = useState<Record<string, SendState>>({});
  const command = useCallback(
    async (key: string, device: string, pumpAppKey: string, target: string, verb: "start" | "stop", minutes?: number) => {
      setSending((s) => ({ ...s, [key]: { verb, at: Date.now() } }));
      // Exactly what the pump page's own button does (customer-site
      // sendUiCommandRpc): an RPC message on the device's ui_cmds, then its
      // id under the install's key in the ui_cmds aggregate. Pump Control
      // handles it, publishes the command and tracks it as pending.
      const data = buttonRpc(pumpAppKey, target, verb, Date.now(), actor);
      try {
        // The chosen run time goes where the pump page's "Start For (min)" input
        // keeps its value. Pump Control reads it from the ui_cmds aggregate when
        // it handles the Start, so it is written (and awaited) first.
        if (verb === "start" && minutes != null) {
          await client.aggregates.patchAggregate(device, "ui_cmds", runTimeValue(pumpAppKey, target, minutes) as never);
        }
        const message = await client.messages.postMessage(device, "ui_cmds", { data: data as never });
        await client.aggregates.patchAggregate(device, "ui_cmds", rpcMarker(pumpAppKey, String(data.method), message.id) as never);
      } catch (e) {
        setSending((s) => ({ ...s, [key]: { verb, at: Date.now(), error: e instanceof Error ? e.message : String(e) } }));
      }
    },
    [client, actor],
  );

  if (!agentId || !appKey) return <Message>The dashboard host did not provide an agent ID and app key.</Message>;
  if (isLoading || deviceMap.isLoading || (deviceIds.length > 0 && configs.query.isLoading)) return <Message>Loading site…</Message>;
  if (all.length === 0)
    return (
      <Message>
        Nothing to show yet. No pumps, tanks, flow meters or pivots were found on the devices this dashboard can see. It sees the devices in its own
        group, or those chosen under Devices in its settings.
      </Message>
    );

  const tagsOf = (i: ItemConfig): Dict | undefined => tags.aggregatesByAgent[i.device]?.data?.[i.appKey] as Dict | undefined;
  const uiOf = (i: ItemConfig) => readPath(ui.aggregatesByAgent[i.device]?.data, uiAppPath(i.appKey));
  const linkOf = (device: string) => {
    const key = site.linkKey[device];
    return key ? linkView(tags.aggregatesByAgent[device]?.data?.[key] as Dict | undefined) : undefined;
  };
  const freshness = (i: ItemConfig) => {
    const link = linkOf(i.device);
    return { link, lastHeard: link?.lastHeard, stale: isStale(link?.lastHeard, now, cfg.staleAfterMs) };
  };

  const showLink = Object.keys(site.linkKey).length > 0;
  const pumpViews = site.pumps.map((p) => pumpView(tagsOf(p), p.target));
  const running = pumpViews.filter((v) => v.running === true).length;
  const tankViews = site.tanks.map((t) => tankView(tagsOf(t), uiOf(t), cfg.lowLevelPct, cfg.criticalLevelPct));
  const lowTanks = tankViews.filter((v) => v.band === "low" || v.band === "critical").length;
  const offline = Object.keys(site.linkKey).filter((d) => linkOf(d)?.status === "offline").length;

  return (
    <div className="flex flex-col gap-6 py-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-lg font-semibold">{cfg.title}</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {site.pumps.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Dot colour={running ? COLOURS.run : COLOURS.idle} pulse={running > 0} /> {running} of {site.pumps.length} pumps running
            </span>
          )}
          {site.tanks.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Dot colour={lowTanks ? COLOURS.low : COLOURS.water} /> {lowTanks ? `${lowTanks} tank${lowTanks === 1 ? "" : "s"} low` : "Tanks OK"}
            </span>
          )}
          {showLink && (
            <span className="inline-flex items-center gap-1.5">
              <Dot colour={offline ? COLOURS.halt : COLOURS.run} /> {offline ? `${offline} offline` : "All sites reporting"}
            </span>
          )}
          <span>Updated {fmtClock(now, now)}</span>
        </div>
      </div>

      {site.pumps.length > 0 && (
        <GridSection title="Pumps" columns={pumpColumns(showLink)}>
          {site.pumps.map((p, idx) => {
            const key = `${p.device}:${p.appKey}:${p.target}`;
            const view = pumpViews[idx];
            const s = slug(p.target);
            const minutesEl = readPath(ui.aggregatesByAgent[p.device]?.data, uiElementPath(p.appKey, `p_${s}`, `p_${s}_minutes`));
            const rt = runTime(minutesEl, cmds.aggregatesByAgent[p.device]?.data?.[p.appKey], p.target);
            return (
              <PumpRow
                key={key}
                to={devicePage(p.device)}
                title={p.title}
                view={view}
                runTime={rt}
                {...freshness(p)}
                showLink={showLink}
                now={now}
                sending={sending[key]}
                onCommand={(verb, minutes) => command(key, p.device, p.appKey, p.target, verb, minutes)}
              />
            );
          })}
        </GridSection>
      )}

      {site.tanks.length > 0 && (
        <GridSection title="Tanks" aside={`Low ≤ ${cfg.lowLevelPct} % · Critical ≤ ${cfg.criticalLevelPct} %`} columns={tankColumns(showLink)}>
          {site.tanks.map((t, idx) => (
            <TankRow
              key={`${t.device}:${t.appKey}`}
              to={devicePage(t.device)}
              title={t.title}
              view={tankViews[idx]}
              lowPct={cfg.lowLevelPct}
              criticalPct={cfg.criticalLevelPct}
              {...freshness(t)}
              showLink={showLink}
              now={now}
            />
          ))}
        </GridSection>
      )}

      {site.flowMeters.length > 0 && (
        <GridSection title="Flow" columns={flowColumns(showLink)}>
          {site.flowMeters.map((f) => (
            <FlowRow key={`${f.device}:${f.appKey}`} to={devicePage(f.device)} title={f.title} view={flowView(tagsOf(f), uiOf(f))} {...freshness(f)} showLink={showLink} now={now} />
          ))}
        </GridSection>
      )}

      {site.pivots.length > 0 && (
        <GridSection title="Pivots" columns={pivotColumns(showLink)}>
          {site.pivots.map((p) => (
            <PivotRow key={`${p.device}:${p.appKey}`} to={devicePage(p.device)} title={p.title} view={pivotView(tagsOf(p))} {...freshness(p)} showLink={showLink} now={now} />
          ))}
        </GridSection>
      )}
    </div>
  );
}

const MaitDashboardWidget = (props: WidgetProps) => (
  <RemoteComponentWrapper>
    <DashboardInner {...props} />
  </RemoteComponentWrapper>
);

export default MaitDashboardWidget;
