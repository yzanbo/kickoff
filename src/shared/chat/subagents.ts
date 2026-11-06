import { isBackgroundLaunch } from "./backgroundTasks";
import { isNetworkError } from "./networkErrors";
import { markSuperseded } from "./subagentSupersede";
import type { ChatEvent, SubagentInfo } from "@shared/types";

// サブエージェントの一覧の組み立て（画面の一覧・タブと、コアの作業の終わりのお知らせ・通信が戻ったときの再開で共有する。Node 依存なし）

/** 一覧の 1 行（Task / Agent ツールの呼び出しと、SDK のサブエージェントの通知をまとめたもの） */
export interface SubagentEntry {
  key: string;
  description: string;
  subagentType?: string;
  /** Task ツールで指定されたモデル（なければ親と同じ） */
  model?: string;
  status: SubagentInfo["status"];
  tokens?: number;
  toolUses?: number;
  durationMs?: number;
  lastTool?: string;
  /** タイムラインで、この呼び出しを含むツールのまとまりへ移るための ID */
  toolUseEventId?: number;
  /** Claude Code のサブエージェントの ID（作業 ID と同じ。SendMessage で続きを頼むときの宛先） */
  agentId?: string;
  /** いちばん新しい親への報告（終わりの知らせの要約。再開したら、その回の報告に置き換わる） */
  summary?: string;
  /** 起動したエージェントからの依頼（やり直すときに同じ依頼を渡す） */
  prompt?: string;
  /** 通信の切断で止まった（失敗・中断のときだけ。API のエラーで終わった・通信で親ごと終わったときに動いていた） */
  network?: boolean;
  /** いちばん新しい回が始まった記録の ID（起動の呼び出し・再開の知らせ） */
  startEventId?: number;
  /** 止まった記録の ID（終わりの知らせ・ツールの結果・通信で親が失敗した結果。分からなければ undefined） */
  endEventId?: number;
  /** 最後に動いた時刻（サブエージェントの発言・ツール・知らせ。画面に届く途中経過は画面の側で足す） */
  lastActivityAt?: string;
  /** 結果を待っているツール（呼んで、まだ結果が届いていない。長いコマンドを実行中など） */
  pendingTool?: string;
  /**
   * 報告が親に届いたか（完了したものだけ）: received = 親が受け取った（待つ形ならツールの結果が返った、裏で動かしたなら
   * 報告のあとに親が動いた）/ pending = 報告を送ったが、親はまだ動いていない / lost = 親が動かないまま作業が終わった
   */
  delivery?: "received" | "pending" | "lost";
  /** 親に届かなかった報告の本文（親に渡し直すときに使う） */
  undeliveredReport?: string;
  /** 1 回の返答で書ける量（出力のトークン数）の上限で止まった（失敗のときだけ） */
  outputLimit?: boolean;
  /** 止まったあとに、親が同じ仕事をやり直した新しいサブエージェント（subagentSupersede.ts） */
  supersededBy?: { key: string; description: string };
  /** 入れ子のとき、このサブエージェントを起動したサブエージェント（行のキー）。メインエージェントが起動したものは undefined */
  parentKey?: string;
  /** 行のキーのほかに、このサブエージェントの記録の parent に入る呼び出し ID（SendMessage で再開した回は、その SendMessage の ID） */
  aliases?: string[];
  /** 初めに起動した時刻 */
  startedAt?: string;
  /** いちばん新しい回が止まった時刻（終わりの知らせ・ツールの結果・通信で親が失敗した結果。作業中・分からなければ undefined） */
  endedAt?: string;
}

/** 失敗の文が、出力の上限（max_output_tokens）で止まったものか（通信の切断とは別。同じやり方では、再開しても同じところで止まる） */
export function isOutputLimitError(message: string | null | undefined): boolean {
  return Boolean(message) && /max_output_tokens|output token maximum/i.test(message!);
}

/** Agent / Task ツールの結果の文から、サブエージェントの ID を取り出す（以前の記録で、作業 ID の知らせが残っていないとき） */
const agentIdIn = (content: unknown): string | undefined =>
  typeof content === "string" ? /agentId:\s*([a-z0-9]+)/.exec(content)?.[1] : undefined;

const SUBAGENT_TOOLS = new Set(["Task", "Agent"]);

/** サブエージェントを起動するツール（Task / Agent）か */
export function isSubagentTool(name: string): boolean {
  return SUBAGENT_TOOLS.has(name);
}

/**
 * チャットのサブエージェントの一覧を組み立てる。保存されたイベント（Task / Agent の呼び出しと結果、開始・終了の通知）と、
 * 画面にだけ届く途中経過（progress: トークン数・直近のツール）を合わせる。busy でなければ、終わっていないものは中断とみなす
 */
export function collectSubagents(events: ChatEvent[], progress: Record<string, SubagentInfo>, busy: boolean, live?: Set<string>): SubagentEntry[] {
  const map = new Map<string, SubagentEntry>();
  // 裏で動かした（起動の知らせ・再開）サブエージェントと、いちばん新しく始まったあとに報告（SubagentHandback）を渡したか
  const backgrounded = new Set<string>();
  const handedBack = new Set<string>();
  // サブエージェントでないツール（Bash など）の呼び出し。以前の記録には、裏で動かしたコマンドのタスクも subagent として残っているので除く
  const otherTools = new Set<string>();
  // 作業 ID → 行のキー（起動した Agent / Task の呼び出し ID）。SendMessage で再開すると、作業 ID はそのままで、
  // 知らせの呼び出し ID は再開を頼んだ SendMessage のものになるので、作業 ID で元の行にまとめる
  const taskToKey = new Map<string, string>();
  // 再開した回の呼び出し ID → 行のキー（その回の中の記録の parent は、再開を頼んだ SendMessage の ID になりうる）
  const aliasToKey = new Map<string, string>();
  const keyOf = (id: string) => aliasToKey.get(id) ?? id;
  // 通信の切断で止まったもの（行のキー）
  const network = new Set<string>();
  const markNetwork = (key: string, yes: boolean) => (yes ? network.add(key) : network.delete(key));
  // 報告の受け渡し: 報告を送ってから親がまだ動いていないもの（行のキー → 送った記録）と、受け渡しの様子
  const awaitingParent = new Set<string>();
  const delivery = new Map<string, NonNullable<SubagentEntry["delivery"]>>();
  const reported = (key: string) => {
    if (delivery.get(key) === "received" || awaitingParent.has(key)) return;
    awaitingParent.add(key);
    delivery.set(key, "pending");
  };
  const settleAwaiting = (state: "received" | "lost") => {
    for (const key of awaitingParent) delivery.set(key, state);
    awaitingParent.clear();
  };
  // 親（メインエージェント）が動いた記録か（サブエージェントの中の発言・ツールは除く）
  const isParentActivity = (e: ChatEvent) => (e.type === "text" || e.type === "thinking" || e.type === "tool_use") && !e.data.parent;
  // 入れ子の子孫の動きは、祖先のサブエージェントも動いているとみなす（子の結果を待っている間に「動きがない」としない）
  const bubble = (entry: SubagentEntry, at: string) => {
    let up = entry.parentKey;
    for (let depth = 0; up !== undefined && depth < 32; depth++) {
      const ancestor = map.get(up);
      if (!ancestor) break;
      if (ancestor.lastActivityAt === undefined || Date.parse(at) > Date.parse(ancestor.lastActivityAt)) ancestor.lastActivityAt = at;
      up = ancestor.parentKey;
    }
  };
  // サブエージェントの中の動き（parent = 起動した呼び出し ID）: 最後に動いた時刻と、結果を待っているツール
  const touch = (e: Extract<ChatEvent, { type: "text" | "thinking" | "tool_use" | "tool_result" }>) => {
    const entry = e.data.parent ? map.get(keyOf(e.data.parent)) : undefined;
    if (!entry) return;
    entry.lastActivityAt = e.created_at;
    entry.pendingTool = e.type === "tool_use" ? e.data.name : undefined;
    bubble(entry, e.created_at);
  };
  for (const e of events) {
    // 届かなかった報告を、利用者の次の指示に添えて渡した（reportHandover.ts）: 受け取ったとみなす
    for (const key of e.type === "user" ? (e.data.handover ?? []) : []) {
      awaitingParent.delete(key);
      delivery.set(key, "received");
    }
    if (e.type === "text" || e.type === "thinking" || e.type === "tool_result") touch(e);
    // 報告を送ったあとに親が動いた: 親は報告を受け取っている（Claude Code は報告を親の次の手順の入力として渡す）
    if (awaitingParent.size > 0 && isParentActivity(e)) settleAwaiting("received");
    if (e.type === "tool_use") {
      const d = e.data;
      const input = d.input as { description?: string; subagent_type?: string; model?: string; prompt?: string } | undefined;
      if (!isSubagentTool(d.name)) {
        touch(e);
        // サブエージェントが報告を渡した（終わりの知らせを取りこぼしても、終わったと分かる）
        const parent = d.parent === undefined ? undefined : keyOf(d.parent);
        if (d.name === "SubagentHandback" && parent) {
          handedBack.add(parent);
          if (map.has(parent)) reported(parent);
        }
        otherTools.add(d.id);
        continue;
      }
      // 入れ子: サブエージェントが起動したサブエージェント（起動したほうは、子の結果を待っている）
      touch(e);
      map.set(d.id, {
        key: d.id,
        description: input?.description ?? "サブエージェント",
        subagentType: input?.subagent_type,
        model: input?.model,
        prompt: input?.prompt,
        status: "running",
        toolUseEventId: e.id,
        startEventId: e.id,
        lastActivityAt: e.created_at,
        startedAt: e.created_at,
        ...(d.parent === undefined ? {} : { parentKey: keyOf(d.parent) }),
      });
    } else if (e.type === "tool_result") {
      const d = e.data;
      const entry = map.get(d.tool_use_id);
      if (!entry) continue;
      entry.agentId ??= agentIdIn(d.content);
      // 裏で動かしたサブエージェントは、結果が「起動した」という知らせなので、まだ終わっていない（終わりは通知で届く）
      if (isBackgroundLaunch(d.content)) backgrounded.add(entry.key);
      else {
        entry.status = d.is_error ? "failed" : "completed";
        entry.endEventId = e.id;
        entry.endedAt = e.created_at;
        markNetwork(entry.key, d.is_error && typeof d.content === "string" && isNetworkError(d.content));
        entry.outputLimit = d.is_error && typeof d.content === "string" && isOutputLimitError(d.content);
        // 待つ形: ツールの結果として親に返った（報告を受け取っている）
        if (!d.is_error) {
          awaitingParent.delete(entry.key);
          delivery.set(entry.key, "received");
        }
      }
    } else if (e.type === "subagent") {
      const d = e.data;
      const own = d.tool_use_id ?? d.task_id;
      const key = taskToKey.get(d.task_id) ?? own;
      if (!map.has(key) && otherTools.has(key)) continue;
      if (map.has(key) || !otherTools.has(own)) taskToKey.set(d.task_id, key);
      // 再開した回の呼び出し ID（SendMessage）を、元の行のものとして覚える
      if (d.tool_use_id !== undefined && d.tool_use_id !== key && map.has(key) && !aliasToKey.has(d.tool_use_id)) {
        aliasToKey.set(d.tool_use_id, key);
        const entry = map.get(key)!;
        entry.aliases = [...(entry.aliases ?? []), d.tool_use_id];
      }
      // 再開した回の知らせ（呼び出し ID が元の行と違う）は、完了のあとでも作業中に戻す
      const resumed = d.tool_use_id !== undefined && d.tool_use_id !== key;
      if (d.status === "running") {
        // 再開は必ず裏で動く。始まり直したので、前の回の報告と止まった理由は数えない
        if (resumed) {
          backgrounded.add(key);
          network.delete(key);
          // 始まり直したので、前の回の受け渡しは数えない
          awaitingParent.delete(key);
          delivery.delete(key);
        }
        handedBack.delete(key);
      } else {
        // API のエラー（通信の切断）で終わった: Claude Code の知らせの要約に、そのエラーの文が入る
        markNetwork(key, d.status === "failed" && isNetworkError(d.summary));
        // 完了の知らせ: 報告を送った（親が受け取ったかは、このあと親が動いたかで決める）
        if (d.status === "completed" && (map.has(key) || !otherTools.has(own))) reported(key);
      }
      const entry = map.get(key) ?? { key, description: d.description || "サブエージェント", status: d.status };
      // 再開した回は、ここから始まり直す
      const restarted = d.status === "running" && resumed;
      const next: SubagentEntry = {
        ...entry,
        startEventId: restarted ? e.id : (entry.startEventId ?? e.id),
        endEventId: d.status === "running" ? (restarted ? undefined : entry.endEventId) : e.id,
        startedAt: entry.startedAt ?? e.created_at,
        endedAt: d.status === "running" ? (restarted ? undefined : entry.endedAt) : e.created_at,
        lastActivityAt: e.created_at,
        pendingTool: restarted ? undefined : entry.pendingTool,
        description: entry.description || d.description,
        subagentType: entry.subagentType ?? d.subagent_type,
        status: resumed || !(d.status === "running" && entry.status !== "running") ? d.status : entry.status,
        tokens: d.tokens ?? entry.tokens,
        toolUses: d.tool_uses ?? entry.toolUses,
        durationMs: d.duration_ms ?? entry.durationMs,
        agentId: d.task_id || entry.agentId,
        summary: d.summary ?? entry.summary,
        outputLimit: d.status === "failed" ? isOutputLimitError(d.summary) : undefined,
      };
      map.set(key, next);
      bubble(next, e.created_at);
    } else if (e.type === "result") {
      // 報告を送ったのに、親が動かないまま作業が終わった: 報告は親に届いていない
      settleAwaiting("lost");
      // 実行の終わり。通信の切断で失敗したら、そのとき動いていたものは通信で止まった。
      // それ以外の終わり方（自分で止めた・最後まで終わった）なら、動いていたものの通信の印は外す
      const d = e.data;
      const byNetwork = d.status === "failed" && (d.network === true || isNetworkError(d.text));
      for (const entry of map.values()) {
        if (entry.status !== "running") continue;
        markNetwork(entry.key, byNetwork);
        if (byNetwork) {
          entry.endEventId = e.id;
          entry.endedAt = e.created_at;
        }
      }
    }
  }
  for (const p of Object.values(progress)) {
    const entry = map.get(taskToKey.get(p.task_id) ?? p.tool_use_id ?? p.task_id);
    if (!entry || entry.status !== "running") continue;
    map.set(entry.key, { ...entry, tokens: p.tokens ?? entry.tokens, toolUses: p.tool_uses ?? entry.toolUses, lastTool: p.last_tool });
  }
  // 動いていないのに終わっていないもの: Claude Code が終わった、または裏で動いているものの一覧から消えた（終わりの知らせを取りこぼした）。
  // 報告を渡していれば完了、なければ中断とみなす（一覧は裏で動かしたものだけなので、待つ形のものには使わない）
  return markSuperseded([...map.values()].map((s) => {
    const settled: SubagentEntry =
      s.status === "running" &&
      (!busy || (live !== undefined && backgrounded.has(s.key) && s.agentId !== undefined && !live.has(s.agentId)))
        ? { ...s, status: handedBack.has(s.key) ? "completed" : "stopped" }
        : s;
    if (settled.status === "failed" || settled.status === "stopped") return { ...settled, network: network.has(s.key) };
    if (settled.status !== "completed") return settled;
    // 受け渡し: 作業が終わっていて、まだ親が動いていなければ届いていない（作業中なら受け取り待ち）
    const state = delivery.get(s.key) ?? "received";
    const final = state === "pending" && !busy ? "lost" : state;
    return final === "lost" ? { ...settled, delivery: final, undeliveredReport: subagentReport(settled, events) } : { ...settled, delivery: final };
  }));
}

/**
 * 1 回の実行（記録の ID が sinceEventId より後）で始めたのに、終わりの知らせがないまま実行が終わったサブエージェント。
 * Kickoff では実行の終わりで Claude Code のプロセスも終わるので、これらはそこで止まる（作業の終わりにお知らせを残す）
 */
export function unfinishedSubagents(events: ChatEvent[], sinceEventId: number): SubagentEntry[] {
  // 実行が終わったとして数え、終わりの記録がないまま中断になったもの（報告を渡したものは完了になる）
  return collectSubagents(events, {}, false).filter(
    (s) => s.status === "stopped" && s.endEventId === undefined && (s.startEventId ?? 0) > sinceEventId,
  );
}

/**
 * 1 回の実行（記録の ID が sinceEventId より後）で、通信の切断で止まったサブエージェント（作業 ID が分かるものだけ）。
 * 通信が戻って自動で再開するときに、SendMessage で続きから再開するよう頼む。自分で止めたもの・ほかの理由の失敗は含めない
 */
export function networkStoppedSubagents(events: ChatEvent[], sinceEventId: number): SubagentEntry[] {
  return collectSubagents(events, {}, false).filter(
    (s) => s.network && !s.supersededBy && s.agentId !== undefined && (s.endEventId ?? Number.POSITIVE_INFINITY) > sinceEventId,
  );
}

/**
 * Task / Agent ツールの結果から、サブエージェントの報告の本文だけを取り出す。
 * 結果には Claude Code が付ける前置き（使ったツールの一覧や「The report follows:」までの注意書き）と、行頭の字下げが入っている
 */
export function cleanSubagentReport(text: string): string {
  const marker = "The report follows:";
  const at = text.indexOf(marker);
  const body = at >= 0 ? text.slice(at + marker.length) : text.replace(/<tools-used-before-summary>[\s\S]*?<\/tools-used-before-summary>/g, "");
  return body
    .split("\n")
    .map((line) => line.replace(/^ {2}/, ""))
    .join("\n")
    .trim();
}

/** 終わりの知らせの要約が、報告そのものでなく「報告は別の知らせ（SubagentHandback）で届けた」という案内か */
const isHandbackPointer = (text: string) => /report was delivered to you as a message/i.test(text);

/**
 * サブエージェントの親への報告（いちばん新しいもの）。報告の渡し方は Claude Code の版・モデルで違うので、次の順に探す:
 * 1. サブエージェントが呼んだ SubagentHandback の本文（再開したら、その回のもの）
 * 2. 終わりの知らせの要約（「別の知らせで届けた」という案内は除く）
 * 3. Agent / Task ツールの結果の文（以前の記録。裏で動かしたときの「起動した」という知らせは除く）
 */
export function subagentReport(entry: SubagentEntry, events: ChatEvent[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type !== "tool_use" || e.data.parent !== entry.key || e.data.name !== "SubagentHandback") continue;
    const message = (e.data.input as { message?: string } | undefined)?.message;
    if (message) return message;
  }
  if (entry.summary && !isHandbackPointer(entry.summary)) return entry.summary;
  const result = events.find((e): e is Extract<ChatEvent, { type: "tool_result" }> => e.type === "tool_result" && e.data.tool_use_id === entry.key && !e.data.parent);
  const raw = result?.data.content;
  return raw && !isBackgroundLaunch(raw) && !isHandbackPointer(raw) ? cleanSubagentReport(raw) : undefined;
}

