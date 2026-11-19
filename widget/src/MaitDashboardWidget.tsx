import "./styles.css";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import RemoteComponentWrapper from "customer_site/RemoteComponentWrapper";
import { useRemoteParams } from "customer_site/useRemoteParams";
import { useAgentChannel, useDooverClient, useMultiAgentAggregates } from "doover-js/react";

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
  applications?: Record<
    string,
    Dict & {
      DEVICE_MAP?: Record<
        string,
        { name?: string; display_name?: string; app_installs?: Array<{ name?: string | null; display_name?: string | null }> }
      >;
    }
  >;
}

type TagValues = Record<string, Dict>;

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
  const deviceMap = appConfig?.DEVICE_MAP ?? {};

  const all: ItemConfig[] = useMemo(() => [...cfg.pumps, ...cfg.tanks, ...cfg.flowMeters, ...cfg.pivots], [cfg]);
  const deviceIds = useMemo(() => uniq(all.map((i) => i.device)), [all]);
  const tagFields = useMemo(
    () => uniq([...all.map((i) => i.appKey), ...(cfg.linkHealthAppKey ? [cfg.linkHealthAppKey] : [])]),
    [all, cfg.linkHealthAppKey],
  );
  // Only the display details each card needs: units, gauge ranges and a
  // pump's run-time input. A whole ui_state is tens of kB per device.
  const uiFields = useMemo(
    () =>
      uniq([
        ...[...cfg.tanks, ...cfg.flowMeters].map((i) => uiAppPath(i.appKey)),
        ...cfg.pumps.map((p) => uiElementPath(p.appKey, `p_${slug(p.target)}`, `p_${slug(p.target)}_minutes`)),
      ]),
    [cfg],
  );
  const pumpDevices = useMemo(() => uniq(cfg.pumps.map((p) => p.device)), [cfg]);
  const pumpKeys = useMemo(() => uniq(cfg.pumps.map((p) => p.appKey)), [cfg]);

  const tags = useMultiAgentAggregates<TagValues>("tag_values", deviceIds, { fields: tagFields });
  const ui = useMultiAgentAggregates<Dict>("ui_state", deviceIds, { fields: uiFields });
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
  if (isLoading) return <Message>Loading site…</Message>;
  if (all.length === 0) return <Message>Nothing to show yet. Add tanks, pumps, flow meters or pivots in this app's settings.</Message>;

  const tagsOf = (i: ItemConfig): Dict | undefined => tags.aggregatesByAgent[i.device]?.data?.[i.appKey] as Dict | undefined;
  const uiOf = (i: ItemConfig) => readPath(ui.aggregatesByAgent[i.device]?.data, uiAppPath(i.appKey));
  const linkOf = (i: ItemConfig) =>
    cfg.linkHealthAppKey ? linkView(tags.aggregatesByAgent[i.device]?.data?.[cfg.linkHealthAppKey] as Dict | undefined) : undefined;
  const deviceName = (id: string) => deviceMap[id]?.display_name || deviceMap[id]?.name || `Device ${id}`;
  const freshness = (i: ItemConfig) => {
    const link = linkOf(i);
    return { link, lastHeard: link?.lastHeard, stale: isStale(link?.lastHeard, now, cfg.staleAfterMs) };
  };
  // An install's display name only adds something when the label doesn't already name the item.
  const installName = (i: ItemConfig) => deviceMap[i.device]?.app_installs?.find((a) => a?.name === i.appKey)?.display_name ?? undefined;
  const titles = (i: ItemConfig, fallbackSub?: string) => ({
    title: i.label ?? deviceName(i.device),
    subtitle: i.label && i.label !== deviceName(i.device) ? deviceName(i.device) : (fallbackSub ?? installName(i)),
  });

  const showLink = !!cfg.linkHealthAppKey;
  const pumpViews = cfg.pumps.map((p) => pumpView(tagsOf(p), p.target));
  const running = pumpViews.filter((v) => v.running === true).length;
  const tankViews = cfg.tanks.map((t) => tankView(tagsOf(t), uiOf(t), cfg.lowLevelPct, cfg.criticalLevelPct));
  const lowTanks = tankViews.filter((v) => v.band === "low" || v.band === "critical").length;
  const offline = deviceIds.filter((d) => {
    const l = cfg.linkHealthAppKey ? linkView(tags.aggregatesByAgent[d]?.data?.[cfg.linkHealthAppKey] as Dict | undefined) : undefined;
    return l?.status === "offline";
  }).length;

  return (
    <div className="flex flex-col gap-6 py-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-lg font-semibold">{cfg.title}</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {cfg.pumps.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Dot colour={running ? COLOURS.run : COLOURS.idle} pulse={running > 0} /> {running} of {cfg.pumps.length} pumps running
            </span>
          )}
          {cfg.tanks.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Dot colour={lowTanks ? COLOURS.low : COLOURS.water} /> {lowTanks ? `${lowTanks} tank${lowTanks === 1 ? "" : "s"} low` : "Tanks OK"}
            </span>
          )}
          {cfg.linkHealthAppKey && (
            <span className="inline-flex items-center gap-1.5">
              <Dot colour={offline ? COLOURS.halt : COLOURS.run} /> {offline ? `${offline} offline` : "All sites reporting"}
            </span>
          )}
          <span>Updated {fmtClock(now, now)}</span>
        </div>
      </div>

      {cfg.pumps.length > 0 && (
        <GridSection title="Pumps" columns={pumpColumns(showLink)}>
          {cfg.pumps.map((p, idx) => {
            const key = `${p.device}:${p.appKey}:${p.target}`;
            const view = pumpViews[idx];
            const s = slug(p.target);
            const minutesEl = readPath(ui.aggregatesByAgent[p.device]?.data, uiElementPath(p.appKey, `p_${s}`, `p_${s}_minutes`));
            const rt = runTime(minutesEl, cmds.aggregatesByAgent[p.device]?.data?.[p.appKey], p.target);
            const name = view.name ?? p.target;
            const { title, subtitle } = titles(p, name);
            return (
              <PumpRow
                key={key}
                to={devicePage(p.device)}
                title={title}
                subtitle={p.label && p.label !== deviceName(p.device) ? `${deviceName(p.device)} · ${name}` : subtitle}
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

      {cfg.tanks.length > 0 && (
        <GridSection title="Tanks" aside={`Low ≤ ${cfg.lowLevelPct} % · Critical ≤ ${cfg.criticalLevelPct} %`} columns={tankColumns(showLink)}>
          {cfg.tanks.map((t, idx) => (
            <TankRow
              key={`${t.device}:${t.appKey}`}
              to={devicePage(t.device)}
              {...titles(t)}
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

      {cfg.flowMeters.length > 0 && (
        <GridSection title="Flow" columns={flowColumns(showLink)}>
          {cfg.flowMeters.map((f) => (
            <FlowRow key={`${f.device}:${f.appKey}`} to={devicePage(f.device)} {...titles(f)} view={flowView(tagsOf(f), uiOf(f))} {...freshness(f)} showLink={showLink} now={now} />
          ))}
        </GridSection>
      )}

      {cfg.pivots.length > 0 && (
        <GridSection title="Pivots" columns={pivotColumns(showLink)}>
          {cfg.pivots.map((p) => (
            <PivotRow key={`${p.device}:${p.appKey}`} to={devicePage(p.device)} {...titles(p)} view={pivotView(tagsOf(p))} {...freshness(p)} showLink={showLink} now={now} />
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
