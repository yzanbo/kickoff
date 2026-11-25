// 守りの門: 実行ごとに守りの決まりを並べ、呼び出しに当てて「断る・聞く（承認カード）・権限モードに任せる」を答える（どの AI も同じ答え）
import type { PermissionMode } from "@shared/settings/types";
import { askApproval, declinedNote, isAllowed, modeVerdict, wordsOf, type GateAsk, type GateCall, type GateOutcome, type GuardMaterials, type ProviderCallbacks, type SandboxPlan, type ToolGate, type ToolGateFactory } from "@/features/ai/core/index";
import { realPathOrSelf } from "@/foundation/core/system/paths";
import { ALLOWED_COMMANDS } from "./allowedCommands";
import { compileCacheRule } from "./guard/compileCacheGuard";
import { deleteRule } from "./guard/deleteGuard";
import { gitHookRule } from "./guard/gitHookGuard";
import { referenceRule, resolveCallPaths, untrackedRule, writeTargetOf } from "./guard/scope";
import { selfRule, type SelfInfo } from "./guard/selfProtection";
import { judgeFileWrite, writeScopeRule, type WriteScopeFacts } from "./guard/writeScope";
import { sandboxDeniedNote } from "./sandbox/sandboxDenied";
import { judgeCall } from "./judge";
import type { GuardRule, GuardRuleSource, GuardVerdict } from "./rules";

export interface ToolGateInput {
  rules: readonly GuardRule[];
  cwd: string;
  permissionMode: PermissionMode;
  requestApproval: ProviderCallbacks["requestApproval"];
  signal: AbortSignal;
  /** 「このチャットでは許可」で許した書く先（実体のパス。チャットごとに作業をまたいで持つ。なければ覚えない） */
  allowedWrites: Set<string> | null;
  /** Bash の砂場（砂場で止まったときの文に使う。なければ文を添えない） */
  sandbox: SandboxPlan | null;
  /** 書き込み先の守りの様子（砂場で止まったときの文が、ほかの作業場所かを見分ける。なければ外として案内する） */
  writeFacts: WriteScopeFacts | null;
}

/** 断られたときに AI に返す文（利用者の言葉があれば添える） */
const withWords = (reason: string, words: string | undefined) => (words ? `${reason}（利用者の言葉: ${words}）` : reason);

export function createToolGate(input: ToolGateInput): ToolGate {
  const ctx = { cb: { requestApproval: input.requestApproval }, signal: input.signal, permissionMode: input.permissionMode };
  const { sandbox, writeFacts } = input;
  const judge = (call: GateCall, rules: readonly GuardRule[] = input.rules) => judgeCall(rules, resolveCallPaths({ ...call, cwd: input.cwd }));

  /** 守りが聞くと言ったときのカード（権限モードによらず聞く）。「このチャットでは許可」なら書く先を覚える */
  async function askCard(verdict: Extract<GuardVerdict, { kind: "ask" }>, call: GateCall, ask: GateAsk): Promise<GateOutcome> {
    const remember = verdict.rememberTarget !== undefined;
    const decision = await askApproval(ask.signal ? { ...ctx, signal: ask.signal } : ctx, {
      kind: "permission",
      toolName: call.name,
      input: call.input,
      title: verdict.title,
      description: verdict.description,
      canRemember: remember,
      ...(remember ? { rememberScope: "chat" as const } : {}),
      ...(ask.toolUseId ? { toolUseId: ask.toolUseId } : {}),
      ...(ask.agentId ? { agentId: ask.agentId } : {}),
    });
    if (decision.action === "allow_always" && verdict.rememberTarget) input.allowedWrites?.add(verdict.rememberTarget);
    if (isAllowed(decision)) return remember ? { allow: true, approved: true } : { allow: true };
    return { allow: false, reason: withWords(verdict.deniedReason, wordsOf(decision)) };
  }

  const guard = async (call: GateCall, ask: GateAsk = {}): Promise<GateOutcome | null> => {
    const verdict = await judge(call);
    if (verdict.kind === "deny") return { allow: false, reason: verdict.reason };
    if (verdict.kind === "ask") return askCard(verdict, call, ask);
    return null;
  };

  return {
    guard,
    deny: async (call) => {
      const verdict = await judge(call, input.rules.filter((r) => r.kind === "deny"));
      return verdict.kind === "deny" ? { allow: false, reason: verdict.reason } : null;
    },
    guardWrites: async (paths, ask) => {
      let asked: GateOutcome | null = null;
      for (const target of paths) {
        const outcome = await guard({ name: "Write", input: { file_path: target } }, ask);
        if (outcome && !outcome.allow) return outcome;
        asked ??= outcome;
      }
      return asked;
    },
    guardRead: (path, ask) => guard({ name: "Read", input: { file_path: path } }, ask),
    byMode: (kind, call, ask) => modeVerdict(ctx, kind, call, ask),
    remembered: (call) => {
      const target = writeTargetOf(input.cwd, call.name, resolveCallPaths({ ...call, cwd: input.cwd }).input);
      return target !== null && (input.allowedWrites?.has(target) ?? false);
    },
    allowedCommands: ALLOWED_COMMANDS,
    sandboxDeniedNote: (output) => (sandbox ? sandboxDeniedNote(output, sandbox, writeFacts ? (target) => judgeFileWrite(target, writeFacts) : null) : Promise.resolve(null)),
    note: declinedNote,
  };
}

/** 書き込み先の守りの様子: チャットが渡したもの（作業場所・ノートのフォルダ・作業場所の一覧）に、その AI の CLI の決まりの例外（Claude Code の計画とメモリ）を足す */
function writeFactsOf(m: GuardMaterials): WriteScopeFacts | null {
  const scope = m.writeScope;
  if (!scope) return null;
  const extra = m.writeExceptions;
  return { workdir: realPathOrSelf(m.cwd), writableDirs: [...scope.writableDirs, ...(extra?.writableDirs ?? [])], memoryParents: extra?.memoryParents ?? [], workplaces: scope.workplaces, denied: scope.denied ?? null };
}

/** 実行の材料から守りの決まりを並べる（材料のない守りは付けない。git のフック・NODE_COMPILE_CACHE はいつも。見せない DB・Docker は登録された口から） */
export function gateRules(m: GuardMaterials, self: SelfInfo | undefined, sources: readonly GuardRuleSource[]): GuardRule[] {
  const facts = writeFactsOf(m);
  return [
    ...(self ? [selfRule(self)] : []),
    ...(m.readOnlyPaths?.length ? [referenceRule(m.readOnlyPaths)] : []),
    ...(m.untrackedOnly ? [untrackedRule()] : []),
    ...(m.deleteGuard ? [deleteRule()] : []),
    gitHookRule(),
    compileCacheRule(),
    ...(facts && m.writeScope ? [writeScopeRule(facts, m.writeScope.allowed)] : []),
    ...sources.flatMap((source) => source.rulesFor(m)),
  ];
}

/** 実行ごとに門を作る口（self: エージェントを動かしている Kickoff 自身。なければ自分を守る守りを付けない = テスト。sources: 上の機能が登録した口） */
export function toolGateFactory(self: SelfInfo | undefined, sources: readonly GuardRuleSource[]): ToolGateFactory {
  return (m, cb, signal) =>
    createToolGate({
      rules: gateRules(m, self, sources),
      cwd: m.cwd,
      permissionMode: m.permissionMode,
      requestApproval: cb.requestApproval,
      signal,
      allowedWrites: m.writeScope?.allowed ?? null,
      sandbox: m.sandbox ?? null,
      writeFacts: writeFactsOf(m),
    });
}
