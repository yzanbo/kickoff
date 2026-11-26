// チャットの AI が自分のチャットの作業場所を移す（kickoff_chat の move_workplace・cancel_workplace_move の中身。プロバイダーに依らない）。
// 確かめてから予約するだけで、移すのは作業が最後まで終わってから（reserve.ts）。移せるのは自分のチャットだけ。
// project でほかのプロジェクト（共通を含む）へも移せる（画面の「プロジェクトを変更」と同じ。子チャットも一緒に、移った先の本体へ）。
// 承認は、コミットしていない変更を持っていくときだけファイルの一覧を見せて聞く（覚えない・Auto mode でも聞く）。共通のチャットが自分を利用者のプロジェクトへ移すのは
// ほかのプロジェクトへの書き込みなので、設定「共通のチャットがほかのプロジェクトに書くとき」に従って聞く。プロジェクトのチャットが自分を共通・ほかのプロジェクトへ移すのは聞かない
// （作業場所の移動と同じく、自分のチャットの置き場所を変えるだけで、移った先の中身は書き換えないため）
import fs from "node:fs";
import path from "node:path";
import { AI_MOVE_WORKPLACE_TOOL, type AiWorkplaceTarget } from "@shared/workplaceMove/aiWorkplace";
import type { Chat } from "@shared/chat/types";
import { COMMON_PROJECT_LABEL, COMMON_WORKDIR_LABEL, isCommonProject } from "@shared/projects/kinds";
import type { AiApprovalCard, AiApprovalDecision } from "@/foundation/core/aiTools/tool";
import { approveAiWrite, isOtherProjectWrite, moveTargetProject, workdirOf, type ChatStoreDeps } from "@/features/chat/core/index";
import { carryFiles } from "@/foundation/core/workplace/carry";
import { listWorktrees, newWorktreeProblem } from "@/foundation/core/workplace/worktrees";
import type { WorkplaceMovePlan } from "./reserve";
import { busyChatsIn, terminalLabel } from "./target";
import { runningTerminals, workplaceMoveBlocked, type WorkplaceUserMoveDeps } from "./userMove";

interface AiWorkplaceMoveInput {
  to: AiWorkplaceTarget;
  /** いまあるワークツリー（ブランチの名前かフォルダ。to が worktree のとき） */
  worktree?: string;
  /** 新しいワークツリーのブランチの名前（to が new_worktree のとき） */
  branch?: string;
  /** コミットしていない変更も持っていく（新しいワークツリーのときだけ） */
  carry?: boolean;
  /** 移したあとに送る続きの指示 */
  continuation?: string;
  /** ほかのプロジェクト（共通を含む）へ移すときの、移す先（名前か ID） */
  project?: string | number;
}

/** 持っていく変更の承認を聞く（許したら true） */
type AskCarry = (request: { label: string; files: string[] }) => Promise<boolean>;

/** 作業場所を移す予約のツールの中身（できたら AI に返す文。できなければ理由の文で throw） */
export interface AiWorkplaceTools {
  move(input: AiWorkplaceMoveInput, askCarry: AskCarry, ask: (card: AiApprovalCard) => Promise<AiApprovalDecision>): Promise<string>;
  cancel(): string;
}

export interface AiWorkplaceDeps {
  store: Pick<ChatStoreDeps, "chats" | "events" | "projects" | "settings">;
  /** 移す予約と、片付けの予約（このチャットの片付けを予約しているか・片付けるフォルダ） */
  reservations: { reserve(chatId: number, plan: WorkplaceMovePlan): void; cancel(chatId: number): boolean; finishing(chatId: number): boolean; reservedFolders(): Set<string> };
  isBusy: (chatId: number) => boolean;
  terminals: WorkplaceUserMoveDeps["terminals"];
}

/** 承認の一覧に並べるファイルの数の上限（残りは数だけ） */
const CARRY_LIST_MAX = 50;

/** ワークツリーの名前の一覧（見つからないときに返す） */
const worktreeNames = (list: Awaited<ReturnType<typeof listWorktrees>>) =>
  list
    .filter((w) => !w.main)
    .map((w) => w.branch ?? path.basename(w.root))
    .join("、") || "（ワークツリーはありません）";

/**
 * ほかのプロジェクト（共通を含む）へ移す予約（移せるのは自分のいちばん上の親チャットで、子チャットも一緒に。移った先の本体・共通なら作業フォルダへ。
 * 変更は持っていかない）。共通のチャットから利用者のプロジェクトへは、設定に従って ask で聞く
 */
async function reserveProjectMove(deps: AiWorkplaceDeps, chat: Chat, input: AiWorkplaceMoveInput & { project: string | number }, ask: (card: AiApprovalCard) => Promise<AiApprovalDecision>): Promise<string> {
  const { store } = deps;
  const target = moveTargetProject(store.projects, input.project);
  if (target.id === chat.project_id) throw new Error(`このチャットはもうプロジェクト「${target.name}」にあります（作業場所を変えるなら project を省いてください）`);
  if (input.to !== "main" || input.worktree || input.branch || input.carry) throw new Error("ほかのプロジェクトへ移すときは to: main だけです（移った先の本体、共通なら共通の作業フォルダへ移ります。変更は持っていけず、作業したファイルは元のフォルダに残ります）");
  if (chat.note_path !== null) throw new Error("ノートのチャットは、ノートごと動かすと一緒に移ります（move_note）");
  if (chat.parent_chat_id !== null) throw new Error("子チャットはほかのプロジェクトへ移せません（いちばん上の親チャットを移すと、子チャットも一緒に移ります）");
  if (chat.untracked_only) throw new Error("実行環境を整えるチャットは、そのワークツリーのためのものなので移せません");
  if (deps.reservations.finishing(chat.id)) throw new Error("このワークツリーは片付けを予約しているので、ほかのプロジェクトへは移せません（片付けが済んでから移してください）");
  const label = isCommonProject(target) ? COMMON_PROJECT_LABEL : `プロジェクト「${target.name}」`;
  const continuation = input.continuation?.trim() || null;
  if (isOtherProjectWrite(store.projects, chat, target)) {
    await approveAiWrite(store.settings, "other_project_write", ask, {
      toolName: AI_MOVE_WORKPLACE_TOOL,
      input: { ...input, project: target.name },
      title: `このチャットを${label}へ移そうとしています`,
      description: `共通のチャットの AI が、この作業が終わったら、このチャット（と子チャット）を${label}へ移そうとしています。移った先ではそのプロジェクトの本体で動きます。`,
    });
  }
  const replaced = deps.reservations.cancel(chat.id);
  deps.reservations.reserve(chat.id, { body: { worktree_path: null }, projectId: target.id, label, continuation });
  return [
    `${replaced ? "前の予約を置き換えて、" : ""}予約しました。この作業が最後まで終わったら、Kickoff がこのチャット（子チャットも）を${label}へ移し${continuation ? "、続きの指示を送ります" : "ます（続きの指示はないので、移すだけです）"}。止めた・失敗したときは移しません。`,
    `移った先の作業フォルダは${isCommonProject(target) ? COMMON_WORKDIR_LABEL : "そのプロジェクトの本体"}です。作業したファイルは元のフォルダに残り、グループ・ワークツリーは外れます。`,
    "利用者は作業中の様子で予約を見て取り消せます。予約したら、結果を返答で伝えて作業を終えてください。",
  ].join("\n");
}

/** chatId のチャットの AI に渡す、作業場所を移す予約のツールの中身 */
export function createAiWorkplaceTools(deps: AiWorkplaceDeps, chatId: number): AiWorkplaceTools {
  return {
    async move(input, askCarry, ask) {
      const { store } = deps;
      const chat = store.chats.get(chatId);
      if (!chat) throw new Error("このチャットが見つかりません（消された可能性があります）");
      const project = store.projects.get(chat.project_id);
      if (!project) throw new Error("このチャットのプロジェクトが見つかりません");
      // ほかのプロジェクトへ（共通のチャットからも。作業場所の移動の守りは当てない）
      if (input.project !== undefined) return reserveProjectMove(deps, chat, { ...input, project: input.project }, ask);
      const blocked = await workplaceMoveBlocked(chat, project);
      if (blocked) throw new Error(blocked);
      const finishing = deps.reservations.finishing(chatId);
      const reservedFolders = deps.reservations.reservedFolders();
      const dir = workdirOf(chat, project);

      let plan: WorkplaceMovePlan;
      const continuation = input.continuation?.trim() || null;
      if (input.to === "new_worktree") {
        const branch = input.branch?.trim();
        if (!branch) throw new Error("新しいワークツリーのブランチの名前（branch）を渡してください");
        const problem = await newWorktreeProblem(project.repo_path, branch);
        if (problem) throw new Error(problem);
        let carry = false;
        if (input.carry) {
          if (finishing) throw new Error("このワークツリーは片付けを予約しているので、変更は持っていけません（片付けるときに控えに入ります。片付けの予約は取り消せません）。持っていかずに移してください");
          if (!fs.existsSync(dir)) throw new Error("いまの作業場所のフォルダがないので、変更は持っていけません");
          const files = await carryFiles(dir);
          if (files.length > 0) {
            if (!(await askCarry({ label: `新しいワークツリー（${branch}）`, files }))) throw new Error("利用者が変更を持っていくのを断ったので、予約しませんでした。持っていかずに移すか、利用者に聞いてください");
            carry = true;
          }
        }
        plan = { body: { worktree_path: null, new_worktree_branch: branch, ...(carry ? { carry: true } : {}) }, label: `新しいワークツリー（${branch}）`, continuation };
      } else {
        if (input.carry) throw new Error("コミットしていない変更を持っていけるのは、新しいワークツリーへ移すときだけです（いまある作業場所の変更とぶつかりうるため）");
        let worktreePath: string | null = null;
        let label = "本体";
        if (input.to === "worktree") {
          const name = input.worktree?.trim();
          const list = await listWorktrees(project.repo_path);
          if (!name) throw new Error(`移す先のワークツリー（worktree: ブランチの名前かフォルダ）を渡してください。いまあるワークツリー: ${worktreeNames(list)}`);
          const found = list.find((w) => [w.path, w.root, w.branch, path.basename(w.root)].includes(name));
          if (!found) throw new Error(`ワークツリー「${name}」が見つかりません。いまあるワークツリー: ${worktreeNames(list)}`);
          if (!found.main) {
            if (found.prunable || !fs.existsSync(found.path)) throw new Error("移す先のワークツリーのフォルダが見つかりません");
            if (reservedFolders.has(found.path)) throw new Error("このワークツリーは片付けを予約しているので、移す先にできません");
            worktreePath = found.path;
            label = `ワークツリー（${found.branch ?? path.basename(found.root)}）`;
          }
        }
        // 片付けの予約があれば、片付けで本体に戻ってから移す（本体へなら片付けで済む）
        if (!finishing && worktreePath === chat.worktree_path) throw new Error("いまと同じ作業場所です");
        plan = { body: { worktree_path: worktreePath }, label, continuation };
      }

      const replaced = deps.reservations.cancel(chatId);
      deps.reservations.reserve(chatId, plan);
      const running = runningTerminals(deps, dir, project.id);
      const target = plan.body.new_worktree_branch ? undefined : plan.body.worktree_path;
      const busy = busyChatsIn(store, deps.isBusy, project.id, chatId, target);
      return [
        `${replaced ? "前の予約を置き換えて、" : ""}予約しました。この作業が最後まで終わったら、Kickoff がこのチャットを${plan.label}へ移し${continuation ? "、続きの指示を送ります" : "ます（続きの指示はないので、移すだけです）"}。止めた・失敗したときは移しません。`,
        finishing ? (plan.body.worktree_path === null && !plan.body.new_worktree_branch ? "片付けの予約があるので、先に片付けます（片付けると本体に戻るので、移すのはそれで済みます）。" : "片付けの予約があるので、先に片付けてから移します。") : null,
        plan.body.carry ? "コミットしていない変更は、新しいワークツリーへ持っていきます。" : input.to === "new_worktree" ? "コミットしていない変更は、元の作業場所に残ります。" : null,
        running.length > 0 ? `元の作業場所で動いているターミナル（${running.map(terminalLabel).join("、")}）は止めずに残ります。` : null,
        busy > 0 ? `移す先では、ほかのチャット ${busy} 件が作業中です（同じファイルを書き換えるとぶつかることがあります）。` : null,
        "利用者は作業中の様子で予約を見て取り消せます。予約したら、結果を返答で伝えて作業を終えてください。",
      ]
        .filter((line): line is string => line !== null)
        .join("\n");
    },
    cancel() {
      return deps.reservations.cancel(chatId) ? "作業場所を移す予約を取り消しました。" : "取り消す予約はありません（もう取り消したか、予約していません）。";
    },
  };
}

/** 承認カードの説明（持っていくファイルの一覧。多ければ先頭だけ） */
export function carryApprovalText(request: { label: string; files: string[] }): { title: string; description: string } {
  const shown = request.files.slice(0, CARRY_LIST_MAX);
  const rest = request.files.length - shown.length;
  return {
    title: `コミットしていない変更を${request.label}へ持っていこうとしています`,
    description: [
      `この作業が終わったら、このチャットを${request.label}へ移し、いまの作業場所のコミットしていない変更（${request.files.length} 件）を持っていきます（元の場所からはなくなります）。ほかのチャットの変更が混ざっていないか確かめてください。`,
      ...shown.map((f) => `- ${f}`),
      ...(rest > 0 ? [`ほか ${rest} 件`] : []),
    ].join("\n"),
  };
}
