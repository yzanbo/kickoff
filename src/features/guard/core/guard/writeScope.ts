// AI の書き込み先の守り（プロバイダー非依存）: ファイルを書き換えるツール（Write・Edit・MultiEdit・NotebookEdit）の書く先を、
// 作業場所・ノートのフォルダ・決まりの例外だけにする。同じリポジトリのほかの作業場所（本体・ほかのワークツリー）は断り、それ以外の外は承認カードで聞く
// （聞くのはプロバイダーのフック。権限モードに関係なく、Auto mode でも聞く）。読むことは絞らない。Bash は見ない（Bash の砂場 sandbox/bashSandbox.ts で止める）
import os from "node:os";
import path from "node:path";
import { workplaceText } from "@shared/foundation/workplace";
import { deepestWorkplace, type Workplace } from "@/foundation/core/workplace/worktrees";
import { isInside } from "@/foundation/core/system/paths";
import type { GuardCall, GuardRule, GuardVerdict } from "@/features/guard/core/rules";
import { writeTargetOf } from "./scope";

/** 判定に使う様子（パスはどれも実体のパス = realpath） */
export interface WriteScopeFacts {
  /** チャットの作業場所 */
  workdir: string;
  /** チャット自身の書ける場所（ノートのフォルダ）。断るフォルダの中にあっても書ける */
  writableDirs: string[];
  /** 決まりの例外で書けるフォルダ（OS の一時フォルダ・プロバイダーの決まり。Claude Code の計画 ~/.claude/plans など）。断るフォルダの中は書けない */
  exceptionDirs: string[];
  /** この下の「<名前>/memory」の中を書けるフォルダ（Claude Code のメモリ ~/.claude/projects/<プロジェクト>/memory。決まりの例外） */
  memoryParents: string[];
  /** プロジェクトの本体とワークツリー */
  workplaces(): Promise<Workplace[]>;
  /** 聞かずに断るフォルダ（実体のパス）と断る文（共通のチャットから見た利用者のプロジェクトのフォルダ・ノートのフォルダ。なければ null） */
  denied?: { dirs: string[]; reason: string } | null;
}

/** 利用者がカードで断ったとき AI に返す文 */
export const WRITE_SCOPE_DENIED = "利用者が拒否しました（作業場所の外への書き込み）。そのファイルは書き込まずに進めるか、利用者に代わりの方法を聞いてください";

const PASS: GuardVerdict = { kind: "pass" };

/** Claude Code のサブエージェントのワークツリー（isolation: "worktree"。<リポジトリ>/.claude/worktrees/<名前>）か */
const isSubagentWorktree = (dir: string) => dir.includes(`${path.sep}.claude${path.sep}worktrees${path.sep}`);

/** parent/<名前>/memory の中か */
function isMemoryOf(parent: string, target: string): boolean {
  if (!isInside(parent, target)) return false;
  const parts = path.relative(parent, target).split(path.sep);
  return parts.length >= 3 && parts[1] === "memory";
}

/** 画面・AI に見せるパス（ホームフォルダの下は ~/…） */
function shown(p: string): string {
  const home = os.homedir();
  return isInside(home, p) ? path.join("~", path.relative(home, p)) : p;
}

/** 同じリポジトリのほかの作業場所に書こうとしたときの断る文（AI が自分でチャットを作らず、利用者に提案するよう案内する） */
function otherWorkplaceReason(target: string, owner: Workplace, mine: string): string {
  const where = owner.worktree_path === null ? "本体" : `そのワークツリー（${owner.branch ?? path.basename(owner.path)}）`;
  return (
    `${shown(target)} は同じリポジトリの別の作業場所（${workplaceText(owner.worktree_path === null ? null : owner.path, owner.branch)}）のファイルなので、このチャットからは書き換えられません（このチャットの作業場所は ${shown(mine)}）。読むのはかまいません。` +
    `その作業場所での書き換えが要るなら、自分でチャットを作らずに、利用者に「${where}のチャットで行うか、${where}で子チャットを作るか」を提案してください`
  );
}

/**
 * 書く先（実体のパス）を判定する。書ける = 作業場所・ノートのフォルダ・決まりの例外（一時フォルダ・Claude Code のメモリと計画・サブエージェントのワークツリー）。
 * 同じリポジトリのほかの作業場所と、断るフォルダ（denied）は断り、それ以外の外は聞く。断るフォルダは決まりの例外より強い（一時フォルダに置いた利用者のプロジェクトも断る）が、
 * チャット自身の場所（作業場所・ノートのフォルダ）より弱い。どの作業場所のものかは、いちばん深く入る作業場所で決める
 * （本体の中に置いたワークツリーは、本体ではなくそのワークツリーのもの）。作業場所の一覧が取れなければ、作業場所の中かだけで見る。
 * 聞くときは、断られたら AI に返す文と「このチャットでは許可」で覚える書く先（target）を添える
 */
export async function judgeFileWrite(target: string, facts: WriteScopeFacts): Promise<GuardVerdict> {
  if (facts.writableDirs.some((dir) => isInside(dir, target))) return PASS;
  const denied = facts.denied?.dirs.some((dir) => isInside(dir, target)) ?? false;
  const exception = facts.exceptionDirs.some((dir) => isInside(dir, target)) || facts.memoryParents.some((dir) => isMemoryOf(dir, target));
  // 断るフォルダの中の決まりの例外は通さず、作業場所かを見てから断る（断るフォルダがなければ、これまでどおり作業場所より先に通す）
  if (exception && !denied) return PASS;
  const workplaces = await facts.workplaces();
  const mine = deepestWorkplace(facts.workdir, workplaces)?.path ?? facts.workdir;
  const owner = deepestWorkplace(target, workplaces);
  if (owner) {
    if (owner.path === mine || isSubagentWorktree(owner.path)) return PASS;
    return { kind: "deny", reason: otherWorkplaceReason(target, owner, mine) };
  }
  if (isInside(facts.workdir, target)) return PASS;
  // 書ける場所・作業場所より後に見る（断るフォルダが作業フォルダ・書けるフォルダを含んでいても、そこは書ける）
  if (denied && facts.denied) return { kind: "deny", reason: `${shown(target)} には書き込めません。${facts.denied.reason}` };
  return {
    kind: "ask",
    title: `作業場所の外のファイルに書き込もうとしています: ${shown(target)}`,
    description: `このチャットの作業場所（${shown(mine)}）とノートのフォルダの外です。Kickoff の AI の守りが、作業場所の外への書き込みを流す前に確かめています。`,
    deniedReason: WRITE_SCOPE_DENIED,
    rememberTarget: target,
  };
}

/**
 * 書き込み先の守り（ファイルを書き換えるツール）。allowed: 「このチャットでは許可」で許した書く先（実体のパス。聞かずに通す）。
 * 断る守り（参照資料・自分の保存先・見せない DB）が断るものには、judgeCall が先に断るのでカードを出さない
 */
export function writeScopeRule(facts: WriteScopeFacts, allowed: ReadonlySet<string>): GuardRule {
  const targetOf = (call: GuardCall) => writeTargetOf(call.cwd, call.name, call.input);
  return {
    name: "writeScope",
    kind: "ask",
    sees: (call) => targetOf(call) !== null,
    check: (call) => {
      const target = targetOf(call);
      return target === null || allowed.has(target) ? PASS : judgeFileWrite(target, facts);
    },
  };
}
