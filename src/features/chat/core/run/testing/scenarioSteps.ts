// 筋書きの利用者の出来事（送る・送信待ちの操作・止める・答えるなど）を、いまの HTTP の口に当て、偽のプロバイダーの出来事を実行に起こす。テストからだけ使う
import type { Driver } from "./scenarioDriver";
import { SESSIONS, T0, type ChatAlias, type ScenarioQueueCommand, type ScenarioStep } from "./types";

/** 利用者の出来事を HTTP の口に当てる */
export async function userStep(d: Driver, st: Extract<ScenarioStep, { do: string }>, alias: ChatAlias) {
  const call = d.core.call;
  if (st.do === "start") {
    const res = await call("POST", `/api/projects/${d.projectId}/chats`, {
      text: st.text,
    });
    d.status(res, undefined);
    d.chats.set(alias, (res.body as { id: number }).id);
    return;
  }
  if (st.do === "settings") return d.settings(st.patch);
  if (st.do === "answer_restart") {
    const decisions = st.decisions.map(([a, action]) => ({
      chat_id: d.id(a),
      action,
    }));
    return d.status(await call("POST", "/api/restart-resumes", { decisions }), st.status);
  }
  const base = `/api/chats/${d.id(alias)}`;
  switch (st.do) {
    case "send": {
      const body = {
        text: st.text,
        ...st.marks,
        ...(st.pauseAfter ? { pause_after: true } : {}),
        ...(st.hold ? { hold: true } : {}),
      };
      const res = await call("POST", `${base}/${st.when === "idle" ? "messages" : st.when === "now" ? "tell" : "queue"}`, body);
      d.status(res, st.status);
      if (st.result && (res.body as { result?: string }).result !== st.result) throw new Error(`伝えた結果 ${JSON.stringify(res.body)}（${st.result} のはず）`);
      return;
    }
    case "queue":
      return d.status(await queueCommand(d, alias, st.command), st.status);
    case "queue_send": {
      const url = st.mode === "now" ? `${base}/queue/${(await d.row(alias, st.rows![0])).id}/send` : st.mode === "all" ? `${base}/queue/send-all` : `${base}/queue/send-in-order`;
      const body =
        st.mode === "all" && st.rows
          ? {
              ids: await Promise.all(st.rows.map(async (r) => (await d.row(alias, r)).id)),
            }
          : {};
      return d.status(await call("POST", url, body), st.status);
    }
    case "editing": {
      const ids = await Promise.all(st.rows.map(async (r) => (await d.row(alias, r)).id));
      d.editing[st.lane][ids.length > 0 ? "add" : "delete"](alias);
      return d.status(await call("PUT", st.lane === "later" ? `${base}/queue/editing` : `${base}/after-compact/editing`, { ids }), undefined);
    }
    case "archive":
      return d.status(await call("PATCH", base, { archived: st.archived }), undefined);
    case "answer_recovery":
    case "answer_approval": {
      const kinds = st.do === "answer_recovery" ? ["reconnect", "usage_limit"] : [st.kind];
      const found = (await d.detail(alias)).approvals.find((a) => kinds.includes(a.kind));
      const id = found?.id ?? kinds.map((k) => d.approvals.get(`${alias}:${k}`)).find(Boolean);
      if (!id) throw new Error(`筋書きの誤り: ${kinds.join("・")} のカードがない`);
      const decision = !st.allow ? { action: "deny" } : st.do === "answer_approval" && st.kind === "question" ? { action: "answer", answers: { 問い: "答え" } } : { action: "allow" };
      return d.status(await call("POST", `/api/approvals/${id}`, decision), "status" in st ? st.status : undefined);
    }
    case "seen": {
      const last = (await d.detail(alias)).events.at(-1)?.id;
      return d.status(await call("POST", `${base}/seen`, last === undefined ? {} : { event_id: last }), st.status);
    }
    case "stop_reconnect":
      return d.status(await call("DELETE", `${base}/reconnect`), st.status);
    default:
      return d.status(await call("POST", `${base}/${st.do}`), st.status);
  }
}

/** 送信待ちの操作を、いまの送信待ちの API に当てる（行は文から ID に引き直す） */
async function queueCommand(d: Driver, alias: ChatAlias, c: ScenarioQueueCommand): Promise<{ status: number; body?: unknown }> {
  const base = `/api/chats/${d.id(alias)}`;
  const ids = async (rows: string[]) => Promise.all(rows.map(async (r) => (await d.row(alias, r)).id));
  const call = d.core.call;
  switch (c.op) {
    case "add_action":
      return call("POST", `${base}/queue/${c.action}`, {
        after: c.after === null ? null : (await d.row(alias, c.after)).id,
      });
    case "remove": {
      if (c.rows.length > 1)
        return call("POST", `${base}/queue/remove-many`, {
          ids: await ids(c.rows),
        });
      const { id, lane } = await d.row(alias, c.rows[0]);
      return call("DELETE", lane === "later" ? `${base}/queue/${id}` : `${base}/after-compact/${id}`);
    }
    case "edit": {
      const { id, lane } = await d.row(alias, c.row);
      return lane === "later"
        ? call("PATCH", `${base}/queue/${id}`, { text: c.text })
        : call("PATCH", `${base}/after-compact/${id}`, {
            text: c.text,
            attachments: [],
          });
    }
    case "move": {
      if (typeof c.to === "object" && "index" in c.to) return call("POST", `${base}/queue/${(await d.row(alias, c.rows[0])).id}/move`, { index: c.to.index });
      const to =
        typeof c.to === "string"
          ? { to: c.to }
          : {
              before: c.to.before === null ? null : (await d.row(alias, c.to.before)).id,
            };
      return call("POST", `${base}/queue/move-many`, {
        ids: await ids(c.rows),
        ...to,
      });
    }
    case "merge":
      return call("POST", `${base}/queue/merge`, { ids: await ids(c.rows) });
    case "set_stops":
      return call("PUT", `${base}/queue/stops`, { stops: c.stops });
    case "stop_after":
      return call("PUT", `${base}/queue/stop-after`, {
        id: c.row === null ? null : (await d.row(alias, c.row)).id,
        stop: c.stop,
      });
    case "set_paused":
      return call("PUT", `${base}/queue/paused`, { paused: c.paused });
    case "clear":
      return call("DELETE", `${base}/queue`);
  }
}

/** 偽のプロバイダーの出来事を、そのチャットのいま動いている実行に起こす */
export async function providerStep(d: Driver, st: Extract<ScenarioStep, { provider: string }>) {
  const p = d.provider;
  if (st.provider === "tell") return void (p.tellOk = st.ok);
  if (st.provider === "tellLate") return void (p.tellLate = true);
  if (st.provider === "trim") return p.holdTrim(st.hold);
  const alias = st.chat ?? "a";
  const run = await d.current(alias);
  if (st.provider === "tellReady") return p.openTell(run);
  if (st.provider === "compacting") return run.cb.compacting?.(st.active);
  if (st.provider === "compacted") {
    run.cb.emit({ type: "compact", trigger: "auto", pre_tokens: 1000 });
    return run.cb.compacting?.(false);
  }
  if (st.provider === "compactFailed") return run.cb.compactFailed?.(st.reason);
  if (st.provider === "emit") return st.events.forEach((e) => run.cb.emit(e));
  if (st.provider === "preCompactInjected") {
    if (!run.params.preCompact) throw new Error("筋書きの誤り: この実行には圧縮前指示を渡していない");
    return run.cb.preCompactSent?.(`pc-${p.runs.indexOf(run) + 1}`);
  }
  if (st.provider === "ask") return p.askCard(run, st.kind);
  if (st.provider === "tool") return void (await d.watch.call(st.name, st.args));
  const before = (await d.runsOf(alias)).length;
  p.end(run, st.outcome, {
    session: st.session === null ? null : SESSIONS[alias],
    context: st.context,
    at: (ms) => new Date(T0 + ms).toISOString(),
  });
  await d.after(st.then, alias, before);
}
