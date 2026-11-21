import type { ProviderTurnParams } from "@/features/ai/core/providers/types";
import { realPathOrSelf } from "@/foundation/core/system/paths";
import { compileCacheRule } from "./compileCacheGuard";
import { deleteRule } from "./deleteGuard";
import { dockerRule } from "@/features/docker/core/guard/dockerGuard";
import { gitHookRule } from "./gitHookGuard";
import { hiddenDbRule } from "@/features/database/core/guard/hiddenDb";
import { referenceRule, resolveCallPaths, untrackedRule } from "./scope";
import { selfRule, type SelfInfo } from "./selfProtection";
import { writeScopeRule } from "./writeScope";
import { judgeCall } from "@/features/guard/core/judge";
import type { GuardRule, GuardVerdict } from "@/features/guard/core/rules";

/*
 * Kickoff の守りを、ツールの呼び出しの形によらずまとめて当てる（プロバイダー非依存）。
 * Claude Code は PreToolUse のフックで 1 つずつ当てる（providers/claude/policy.ts）。フックを持たず、承認の頼みで聞いてくる CLI
 * （Copilot・ACP など）と、Codex の PreToolUse のフック（providers/codex/preToolUse.ts）は、聞かれたコマンド・書く先をここで判定する
 * （守りの決まりの並びは rules.ts の GUARD_ORDER、当て方は judge.ts の judgeCall）
 */

/** 判定に使うもの（実行に渡されたもの） */
export interface GuardContext {
  params: Pick<ProviderTurnParams, "cwd" | "readOnlyPaths" | "untrackedOnly" | "hiddenDb" | "deleteGuard" | "dockerGuard" | "writeScope">;
  self?: SelfInfo;
}

/** 実行に渡された材料から作る守りの決まり（材料のない守りは付けない。git のフック・NODE_COMPILE_CACHE はいつも） */
function rulesOf({ params, self }: GuardContext): GuardRule[] {
  const scope = params.writeScope;
  return [
    ...(self ? [selfRule(self)] : []),
    ...(params.readOnlyPaths?.length ? [referenceRule(params.readOnlyPaths)] : []),
    ...(params.untrackedOnly ? [untrackedRule()] : []),
    ...(params.hiddenDb?.length ? [hiddenDbRule(params.hiddenDb)] : []),
    ...(params.deleteGuard ? [deleteRule()] : []),
    gitHookRule(),
    compileCacheRule(),
    ...(params.dockerGuard ? [dockerRule(params.dockerGuard)] : []),
    ...(scope ? [writeScopeRule({ workdir: realPathOrSelf(params.cwd), writableDirs: scope.writableDirs, memoryParents: [], workplaces: scope.workplaces }, scope.allowed)] : []),
  ];
}

/** シェルのコマンドを流す前の判定（自分を守る・［AI で整える］・見せない DB・消すコマンド・git のフックを飛ばすコマンド・NODE_COMPILE_CACHE を設定するコマンドは断り、ほかの作業場所の Docker は聞く） */
export function judgeCommand(ctx: GuardContext, command: string): Promise<GuardVerdict> {
  return judgeCall(rulesOf(ctx), { name: "Bash", input: { command }, cwd: ctx.params.cwd });
}

/** ファイルを書く前の判定（自分を守る・参照資料・［AI で整える］・見せない DB は断り、書き込み先の守りはほかの作業場所を断り外を聞く） */
export function judgeWritePath(ctx: GuardContext, filePath: string): Promise<GuardVerdict> {
  return judgeCall(rulesOf(ctx), resolveCallPaths({ name: "Write", input: { file_path: filePath }, cwd: ctx.params.cwd }));
}

/** ファイルを読む前の判定（自分の保存先・見せない DB の SQLite のファイルは断る。読むことはほかに絞らない）。聞いてくる CLI（Copilot・ACP の読む承認）だけが使う */
export function judgeReadPath(ctx: GuardContext, filePath: string): Promise<GuardVerdict> {
  return judgeCall(rulesOf(ctx), resolveCallPaths({ name: "Read", input: { file_path: filePath }, cwd: ctx.params.cwd }));
}

/** 断られたときに AI に返す文（利用者の言葉があれば添える） */
export function deniedWithWords(reason: string, words: string | undefined): string {
  return words ? `${reason}（利用者の言葉: ${words}）` : reason;
}
