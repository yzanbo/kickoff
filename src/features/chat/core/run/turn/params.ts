// 1 回の実行の指定を組み立てる: 登録した contributor（TurnContributor。チャット自身と上の機能）が出したものを order の順に集め（collectTurnParts）、
// プロバイダーに渡す形にする（toProviderParams）。実行の組み立ては機能の名前を知らない
import { joinSections } from "@/features/chat/core/prompt/sections";
import { appendSections } from "@/features/chat/core/prompt/compose";
import { permissionOnlyGate, type PreCompactRequest, type ProviderCallbacks, type ProviderTurnResult, type SandboxPlan, type ToolGate } from "@/features/ai/core/index";
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { Chat } from "@shared/chat/types";
import type { ProviderTurnParams } from "@/features/ai/core/index";
import type { TurnContext, TurnContributor, TurnParts, TurnRun, TurnRunPatch } from "./contributor";

/** contributor が出したものを集めた答え */
export interface CollectedParts {
  env: Record<string, string>;
  readableDirs: string[];
  readOnlyDirs: string[];
  writableDirs: string[];
  systemPrompt: string;
  turnContext: string | null;
  gate: ToolGate | null;
  sandbox: SandboxPlan | null;
  sandboxOff: boolean;
  onAgentSpawned: ((pid: number) => void) | undefined;
  preCompact: PreCompactRequest | null;
  /** プロバイダーを動かすところを包む（先の order が外側。なければそのまま動かす） */
  around(run: TurnRun): Promise<ProviderTurnResult>;
  onRecord: ((event: ChatEvent) => void)[];
}

/** 1 つだけが出せる欄（2 つ出たら実行を失敗で止める） */
const SINGLE = ["gate", "sandbox", "sandboxOff", "onAgentSpawned", "preCompact"] as const satisfies readonly (keyof TurnParts)[];

/** order の順（同じ order は登録の順） */
export const byOrder = (contributors: readonly TurnContributor[]): TurnContributor[] => [...contributors].sort((a, b) => a.order - b.order);

/** 2 つの直しを続けて当てる（外の包みの直しのあとに内の包みの直し） */
const chainPatch = (outer?: TurnRunPatch, inner?: TurnRunPatch): TurnRunPatch | undefined => (!outer ? inner : !inner ? outer : (p) => inner(outer(p)));

/**
 * contributor を order の順（同じ order は登録の順）に呼んで集める: env は後が上書き、フォルダは重なりを除いてつなぐ、節は order で並べて 1 つの文に、
 * 文脈はつなぐ、門・砂場・圧縮前指示は 1 つだけ、包みは外側から順に、記録の口は全部。フォルダを読んで足すもの（contributeWithDirs）は、全部の contribute のあとに呼ぶ
 */
export async function collectTurnParts(contributors: readonly TurnContributor[], ctx: TurnContext): Promise<CollectedParts> {
  const sorted = byOrder(contributors);
  const given: { name: string; parts: TurnParts }[] = [];
  for (const c of sorted) {
    const parts = await c.contribute(ctx);
    if (parts) given.push({ name: c.name, parts });
  }
  const dirs = (key: "readableDirs" | "readOnlyDirs" | "writableDirs") => [...new Set(given.flatMap((g) => g.parts[key] ?? []))];
  const collected = { readableDirs: dirs("readableDirs"), readOnlyDirs: dirs("readOnlyDirs"), writableDirs: dirs("writableDirs") };
  for (const c of sorted) {
    const parts = c.contributeWithDirs ? await c.contributeWithDirs(ctx, collected) : null;
    if (parts) given.push({ name: c.name, parts });
  }
  const single = <K extends (typeof SINGLE)[number]>(key: K): TurnParts[K] | undefined => {
    const from = given.filter((g) => g.parts[key] !== undefined);
    if (from.length > 1) throw new Error(`実行の ${key} を ${from.map((g) => g.name).join(" と ")} が出しました（1 つの機能だけが出せます）`);
    return from[0]?.parts[key];
  };
  const arounds = given.flatMap((g) => (g.parts.around ? [g.parts.around] : []));
  return {
    env: Object.assign({}, ...given.map((g) => g.parts.env ?? {})) as Record<string, string>,
    ...collected,
    systemPrompt: joinSections(given.flatMap((g) => g.parts.promptSections ?? [])),
    turnContext: appendSections(null, ...given.map((g) => g.parts.turnContext ?? null)),
    gate: single("gate") ?? null,
    sandbox: single("sandbox") ?? null,
    sandboxOff: single("sandboxOff") ?? false,
    onAgentSpawned: single("onAgentSpawned"),
    preCompact: single("preCompact") ?? null,
    around: (run) => arounds.reduceRight<TurnRun>((inner, wrap) => (outer) => wrap((own) => inner(chainPatch(outer, own))), run)(),
    onRecord: given.flatMap((g) => (g.parts.onRecord ? [g.parts.onRecord] : [])),
  };
}

/** プロバイダーに渡す指定（集めたものと、チャットの選択・送る指示から。門がなければ権限モードだけで答える門） */
export function toProviderParams(
  chat: Chat,
  parts: CollectedParts,
  run: { cwd: string; prompt: string; promptId?: string; model: string | null; compact: boolean; autoCompactPct: number | null; auth: NonNullable<ProviderTurnParams["auth"]>; cb: Pick<ProviderCallbacks, "requestApproval">; signal: AbortSignal },
): ProviderTurnParams {
  return {
    cwd: run.cwd,
    prompt: run.prompt,
    ...(run.promptId ? { promptId: run.promptId } : {}),
    systemPrompt: parts.systemPrompt,
    turnContext: parts.turnContext,
    resumeSessionId: chat.session_id,
    model: run.model,
    effort: chat.effort,
    permissionMode: chat.permission_mode,
    fastMode: chat.fast_mode,
    autoCompactPct: run.autoCompactPct,
    additionalDirectories: parts.readableDirs,
    sandbox: parts.sandbox,
    sandboxOff: parts.sandboxOff,
    compact: run.compact,
    preCompact: parts.preCompact,
    env: parts.env,
    auth: run.auth,
    gate: parts.gate ?? permissionOnlyGate({ permissionMode: chat.permission_mode, cb: run.cb, signal: run.signal }),
    onAgentSpawned: parts.onAgentSpawned,
  };
}
