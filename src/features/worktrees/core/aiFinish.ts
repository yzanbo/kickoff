// AI の finish_worktree: 本体のチャットからは指したワークツリーをその場で消し、ワークツリー自身のチャットからは作業の終わりに消す予約をする（ほかのワークツリーのチャットからは断る）
import type { GitWorktree } from "@shared/foundation/workplace";
import { errorMessage } from "@shared/foundation/errors";
import type { ChatRunPort, ChatStoreDeps } from "@/features/chat/core/index";
import { Conflict } from "@/foundation/core/errors";
import { isGitWorkTree } from "@/foundation/core/workplace/reads";
import { listWorktrees } from "@/foundation/core/workplace/worktrees";
import { findNamedWorktree, worktreeNames } from "./inspect";
import type { FinishOptions, WorktreeRemover } from "./remove";
import { plannedText } from "./report";

/** AI の後始末の消し方（消し方は 1 つ。失うものは控えに入れて消す。Docker のデータも・取り込み済みならリモートのブランチも） */
const AI_FINISH: Omit<FinishOptions, "byChatId"> = { force: true, deleteBranch: true, downVolumes: true, dropDbConnections: false, deleteMergedRemote: true };

export interface AiWorktreeFinishDeps {
  store: Pick<ChatStoreDeps, "projects" | "chats" | "events">;
  runner: ChatRunPort;
  remover: WorktreeRemover;
}

export class AiWorktreeFinish {
  constructor(private readonly deps: AiWorktreeFinishDeps) {}

  /**
   * AI の finish_worktree（利用者が頼んだときだけ。カードなし）。頼んだチャットが本体のチャットなら、指したワークツリー（同じプロジェクトのどれでも）をその場で消す
   * （作業中のチャットがあれば断る）。ワークツリー自身のチャットなら、確かめだけをして予約し、このチャットの作業が終わってから消す。ほかのワークツリーのチャットからは消せない。
   * AI に返す文を返す（できなければ理由の文で throw）
   */
  async finishFromChat(chatId: number, worktree: string | undefined): Promise<string> {
    const { store, remover } = this.deps;
    const chat = store.chats.get(chatId);
    if (!chat) throw new Error("このチャットが見つかりません（消された可能性があります）");
    const project = store.projects.get(chat.project_id);
    if (!project) throw new Error("このチャットのプロジェクトが見つかりません");
    if (!(await isGitWorkTree(project.repo_path).catch(() => false))) throw new Error("このプロジェクトは Git で管理していないので、ワークツリーはありません");
    const list = await listWorktrees(project.repo_path);
    const named = findNamedWorktree(list, worktree);
    if (worktree?.trim() && !named) throw new Error(`ワークツリー「${worktree}」が見つかりません。いまあるワークツリー: ${worktreeNames(list)}`);
    if (chat.worktree_path !== null) {
      const own = list.find((w) => w.path === chat.worktree_path);
      if (!own) throw new Error("このチャットのワークツリーが見つかりません（もう消えたかもしれません）");
      if (named && named.path !== own.path) throw new Error("ほかのワークツリーのチャットからは消せません。消せるのは、このチャットのワークツリーだけです（本体のチャットからなら、どのワークツリーでも消せます）");
      const facts = await remover.inspect(project, own, list);
      // 作業の終わりの予約（chat の入れ物。止めた・失敗した作業でも行い、行う前に送信待ちを止める = ワークツリーで動くつもりの指示が本体で勝手に動かないように）
      this.deps.runner.reserveAtTurnEnd(chatId, { kind: "finish_worktree", order: 10, label: "ワークツリーの片付け", when: "any", pauseQueue: true, folder: own.path, run: () => this.runReserved(chatId, project.id, own.path) });
      const others = remover.usersOf(own, list).flatMap((u) => store.chats.inWorktree(u.projectId, u.path)).some((c) => c.id !== chatId && this.deps.runner.isBusy(c.id));
      return [
        `予約しました。このチャットの作業が終わったら${others ? "（同じワークツリーで作業中のほかのチャットも終わるのを待ってから）" : ""}、Kickoff がこのワークツリーを片付けます。`,
        plannedText(facts),
        "片付けたあと、このチャットは本体で動きます。送信待ちが残っていれば止めておきます（ワークツリーで動くつもりの指示が本体で勝手に動かないように）。結果はこのチャットのお知らせに出ます。",
      ].join("\n");
    }
    if (!named) throw new Error(`消すワークツリー（worktree: ブランチの名前かフォルダ）を指してください。いまあるワークツリー: ${worktreeNames(list)}`);
    if (named.main) throw new Error("本体のフォルダは消せません");
    try {
      const result = await remover.remove(project, named.path, { ...AI_FINISH, byChatId: chatId });
      store.events.add(chatId, { type: "notice", message: result.text });
      return result.text;
    } catch (e) {
      if (e instanceof Conflict) throw new Error("このワークツリーで作業中のチャットがあるので消せません（待たずに断りました）。作業が終わってから、もう一度頼んでください");
      throw e;
    }
  }

  /**
   * 予約した後始末: 頼んだチャットとそのワークツリーで作業中のチャットがなくなったら消し、結果を頼んだチャットのお知らせに残す
   * （作業の終わりにすること settling の間は待たない = 予約した移動がこの片付けのあとに続く。作業中なら wait）
   */
  private async runReserved(chatId: number, projectId: number, folder: string): Promise<"done" | "wait"> {
    const { store, runner, remover } = this.deps;
    const chat = store.chats.get(chatId);
    const project = store.projects.get(projectId);
    if (!chat || !project) return "done";
    const phase = runner.live(chatId).phase;
    if (phase !== "idle" && phase !== "settling") return "wait";
    const list = await listWorktrees(project.repo_path).catch((): GitWorktree[] => []);
    const target = list.find((w) => w.path === folder);
    if (target && remover.busyIn(remover.usersOf(target, list), chatId)) return "wait";
    try {
      const result = await remover.remove(project, folder, { ...AI_FINISH, byChatId: chatId });
      // 予約したチャットが、待つ間によそへ作業場所を移していても予約は残す。そのことを結果に添える
      const movedAway = chat.worktree_path !== folder;
      store.events.add(chatId, { type: "notice", message: movedAway ? `${result.text}\n（このチャットは予約のあとで作業場所を移していたので、移した先のまま続きます）` : result.text });
    } catch (e) {
      store.events.add(chatId, { type: "notice", message: `ワークツリーを片付けられませんでした（${errorMessage(e)}）` });
    }
    return "done";
  }
}
