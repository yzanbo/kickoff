// チャットの作業場所を移す。利用者・AI が移すときも、Kickoff が自動で変えるとき
// （ワークツリーを片付けた・別のプロジェクトへ移した・プロジェクトのフォルダを変えた）も同じここを通す:
// 会話を新しいセッションに写し、古い会話記録をゴミ箱へ入れ、作業場所とブランチを書き替え、区切り workplace_moved を置く
import { errorMessage } from "@shared/foundation/errors";
import type { ChatEventDataOf, WorkplaceMoveReason, WorkplaceRef } from "@shared/chat/chatEvent";
import { UNTITLED_CHAT_TITLE, type Chat } from "@shared/chat/types";
import type { ProviderId } from "@shared/settings/types";
import { workplaceMoveNote } from "@shared/workplaceMove/workplaceMoves";
import type { Store } from "@/foundation/core/db/store";
import { currentBranch } from "@/features/git/core/index";
import { Invalid, NotFound } from "@/foundation/core/errors";
import type { AgentProvider } from "@/features/ai/core/providers/types";
import { resumePointBefore } from "@/features/chat/core/sessionPoints";
import type { SessionTrash } from "@/features/chat/core/sessionSwitch";
import { workdirOf } from "@/features/chat/core/workdir";

export interface WorkplaceMoveDeps {
  store: Store;
  providers: Record<ProviderId, AgentProvider>;
  /** 写したあとの古い会話記録をゴミ箱へ入れる口（ほかのチャット・ほかの Kickoff が使っていれば入れない） */
  sessionTrash?: SessionTrash;
}

export interface WorkplaceMoveInput {
  /** 移す先のワークツリーのフォルダ（本体なら null） */
  worktreePath: string | null;
  /** 別のプロジェクトへ移すときの、移す先のプロジェクト（省けばいまのプロジェクト） */
  projectId?: number;
  reason: WorkplaceMoveReason;
  /** 移す前の作業フォルダ（プロジェクトのフォルダを変えたあとなど、いまの店の値から決まる場所が違うとき） */
  fromDir?: string;
  /** コミットしていない変更を持っていった */
  carried?: boolean;
  /** ワークツリーを片付けたとき、コミットしていない変更を控えに入れた */
  backedUp?: boolean;
  /** ワークツリーを片付けたとき、消す直前に確かめたそのワークツリーのブランチ（ブランチから外れていれば null で、チャットが最後に作業したブランチを使う） */
  finishedBranch?: string | null;
  /** 元の作業場所で動いている内蔵ターミナル（AI が移したとき、区切りと知らせに書く） */
  running?: string[];
  /** 移した先で作業中のほかのチャットの数（AI が移したとき） */
  busy?: number;
  /** 先にこのチャットのワークツリーを片付けてから移した */
  afterFinish?: boolean;
}

/**
 * 移す前後の段（利用者・AI が新しいワークツリーへ移すとき）: before = ワークツリーを作る・変更を持っていく（決まった作業場所などを返す）、
 * after = 移せたあとの片付け（持っていった変更の stash を消す）、undo = 移せなかったときに元へ戻す
 */
export interface WorkplaceMoveSteps {
  before?: () => Promise<Partial<WorkplaceMoveInput>>;
  after?: () => Promise<void>;
  undo?: () => Promise<void>;
}

/** 利用者・AI が移すとき（写せなければ移さない）か、Kickoff が自動で変えるとき（作業場所はもうないので、写せなくても移す） */
const isManual = (reason: WorkplaceMoveReason) => reason === "user" || reason === "ai";

/** 作業フォルダのいまのブランチ（読めなければ控えのブランチ・null） */
async function branchAt(dir: string, fallback: string | null): Promise<string | null> {
  return (await currentBranch(dir)) || fallback;
}

/**
 * 作業場所を移す。移す先がいまと同じなら何もしない（区切りも置かない）。作業中かは呼ぶ側（Runner.moveWorkplace）が確かめる。
 * 利用者・AI が移すときは、会話を新しいセッションに写せなければ移さずに 400。写せないプロバイダー・まだ会話がないチャットは写さずに移す
 */
export async function moveChatWorkplace(deps: WorkplaceMoveDeps, chatId: number, input: WorkplaceMoveInput): Promise<Chat> {
  const { store } = deps;
  const chat = store.chats.get(chatId);
  if (!chat) throw new NotFound("チャットが見つかりません");
  const project = store.projects.get(chat.project_id);
  if (!project) throw new NotFound("プロジェクトが見つかりません");
  const target = input.projectId === undefined ? project : store.projects.get(input.projectId);
  if (!target) throw new NotFound("移す先のプロジェクトが見つかりません");
  const fromDir = input.fromDir ?? workdirOf(chat, project);
  const toDir = input.worktreePath ?? target.repo_path;
  if (target.id === chat.project_id && input.worktreePath === chat.worktree_path && fromDir === toDir) return chat;

  const from: WorkplaceRef = { project_id: chat.project_id, worktree_path: chat.worktree_path, branch: await branchAt(fromDir, chat.branch), dir: fromDir };
  const toBranch = await branchAt(toDir, null);
  const to: WorkplaceRef = { project_id: target.id, worktree_path: input.worktreePath, branch: toBranch, dir: toDir };

  // 会話を新しいセッションに写す（ファイルの控えが新しいセッションで始まり、移したあとの発言を正しく戻せるように）
  const old = chat.session_id;
  const provider = deps.providers[chat.provider];
  if (old && provider.copySessionForMove) {
    let copied: { sessionId: string; previousFile: string } | null = null;
    let failure: string | null = null;
    try {
      copied = await provider.copySessionForMove(old, fromDir);
      if (!copied) failure = "会話記録が見つかりません";
    } catch (e) {
      failure = errorMessage(e);
    }
    if (copied) {
      store.events.remapSession(chatId, old, copied.sessionId);
      store.chats.update(chatId, { session_id: copied.sessionId });
      // 分岐したチャットなど、ほかのチャットがまだ元の記録を指していれば残す
      if (!store.events.sessionInUse(old)) {
        await deps.sessionTrash?.(old, copied.previousFile, { projectId: chat.project_id, label: `会話記録（「${chat.title || UNTITLED_CHAT_TITLE}」の作業場所を移す前）` }).catch(() => {});
      }
    } else if (isManual(input.reason)) {
      throw new Invalid(`会話を新しいセッションに写せなかったので、作業場所を移しませんでした（${failure}）`);
    }
  }

  // 移したあとの起点: 区切りの直前の、最後まで終わった作業の終わり（写したなら新しいセッションの同じ発言 ID）
  const point = resumePointBefore(store.events.list(chatId));
  if (target.id !== chat.project_id) {
    // 別のプロジェクトへ: グループ・作業場所・ブランチは元のプロジェクトのものなので外す（作業場所は移った先の本体）
    store.chats.move(chatId, target.id);
    if (input.worktreePath !== null) store.chats.setWorkplace(chatId, input.worktreePath, toBranch);
  } else {
    // 利用者・AI が移したら、移した先のいまのブランチを書く。片付け・フォルダの付け替えは、最後に作業したブランチを残す。
    // 片付けたときは片付けたワークツリーのブランチを印に残す（札は本体のまま、説明に添える。次に送るまで）。ほかの移し方では印を外す
    const finished = input.reason === "worktree_finished" ? (input.finishedBranch ?? from.branch) : null;
    store.chats.setWorkplace(chatId, input.worktreePath, isManual(input.reason) ? toBranch : undefined, finished);
  }
  store.events.add(chatId, {
    type: "workplace_moved",
    from,
    to,
    reason: input.reason,
    ...(input.carried ? { carried: true as const } : {}),
    ...(input.backedUp ? { backed_up: true as const } : {}),
    ...(input.running?.length ? { running: input.running } : {}),
    ...(input.busy ? { busy: input.busy } : {}),
    ...(input.afterFinish ? { after_finish: true as const } : {}),
    ...(point?.session_id && point.message_id ? { session_id: point.session_id, message_id: point.message_id } : {}),
  });
  return store.chats.get(chatId)!;
}

/** 移したあと最初の実行の指示に添える、移動の知らせ（まだ知らせていない区切りがなければ null） */
export function workplaceMoveContext(pending: ChatEventDataOf<"workplace_moved"> | null): string | null {
  return pending ? `Kickoff からの知らせ（利用者の発言ではありません）:\n${workplaceMoveNote(pending)}` : null;
}

/** 指示に添える文脈をつなぐ（どれもなければ null） */
export function joinContexts(...parts: (string | null)[]): string | null {
  const present = parts.filter((p): p is string => Boolean(p));
  return present.length ? present.join("\n\n") : null;
}
