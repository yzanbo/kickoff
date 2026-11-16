// チャットの作業場所を移す（メモの仕様書「0025_チャットの作業場所を変える」）。利用者・AI が移すときも、Kickoff が自動で変えるとき
// （ワークツリーを片付けた・別のプロジェクトへ移した・プロジェクトのフォルダを変えた。G1）も同じここを通す:
// 会話を新しいセッションに写し（H1・J1）、古い会話記録をゴミ箱へ入れ（J2）、作業場所とブランチを書き替え（H3）、区切り workplace_moved を置く
import { errorMessage } from "@shared/errors";
import { UNTITLED_CHAT_TITLE, type Chat, type ChatEventDataOf, type ProviderId, type WorkplaceMoveReason, type WorkplaceRef } from "@shared/types";
import { workplaceMoveNote } from "@shared/chat/workplaceMoves";
import type { Store } from "../db/store.js";
import { currentBranch } from "../git/index.js";
import { Invalid, NotFound } from "../http/errors.js";
import type { AgentProvider } from "../providers/types.js";
import { resumePointBefore } from "./sessionPoints.js";
import type { SessionTrash } from "./sessionSwitch.js";
import { workdirOf } from "./workdir.js";

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
  /** コミットしていない変更を持っていった（Q2） */
  carried?: boolean;
  /** ワークツリーを片付けたとき、コミットしていない変更を控えに入れた（J6） */
  backedUp?: boolean;
}

/**
 * 移す前後の段（利用者・AI が新しいワークツリーへ移すとき）: before = ワークツリーを作る・変更を持っていく（決まった作業場所などを返す）、
 * after = 移せたあとの片付け（持っていった変更の stash を消す）、undo = 移せなかったときに元へ戻す（G6）
 */
export interface WorkplaceMoveSteps {
  before?: () => Promise<Partial<WorkplaceMoveInput>>;
  after?: () => Promise<void>;
  undo?: () => Promise<void>;
}

/** 利用者・AI が移すとき（写せなければ移さない。G6）か、Kickoff が自動で変えるとき（作業場所はもうないので、写せなくても移す） */
const isManual = (reason: WorkplaceMoveReason) => reason === "user" || reason === "ai";

/** 作業フォルダのいまのブランチ（読めなければ控えのブランチ・null） */
async function branchAt(dir: string, fallback: string | null): Promise<string | null> {
  return (await currentBranch(dir)) || fallback;
}

/**
 * 作業場所を移す。移す先がいまと同じなら何もしない（区切りも置かない）。作業中かは呼ぶ側（Runner.moveWorkplace）が確かめる。
 * 利用者・AI が移すときは、会話を新しいセッションに写せなければ移さずに 400（G6）。写せないプロバイダー（G7）・まだ会話がないチャットは写さずに移す
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

  // 会話を新しいセッションに写す（ファイルの控えが新しいセッションで始まり、移したあとの発言を正しく戻せるように。H1・J1）
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
      // 分岐したチャットなど、ほかのチャットがまだ元の記録を指していれば残す（J2）
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
    // 利用者・AI が移したら、移した先のいまのブランチを書く（H3）。片付け・フォルダの付け替えは、最後に作業したブランチを残す
    store.chats.setWorkplace(chatId, input.worktreePath, isManual(input.reason) ? toBranch : undefined);
  }
  store.events.add(chatId, {
    type: "workplace_moved",
    from,
    to,
    reason: input.reason,
    ...(input.carried ? { carried: true as const } : {}),
    ...(input.backedUp ? { backed_up: true as const } : {}),
    ...(point?.session_id && point.message_id ? { session_id: point.session_id, message_id: point.message_id } : {}),
  });
  return store.chats.get(chatId)!;
}

/** 移したあと最初の実行の指示に添える、移動の知らせ（Q7。まだ知らせていない区切りがなければ null） */
export function workplaceMoveContext(pending: ChatEventDataOf<"workplace_moved"> | null): string | null {
  return pending ? `Kickoff からの知らせ（利用者の発言ではありません）:\n${workplaceMoveNote(pending)}` : null;
}

/** 指示に添える文脈をつなぐ（どれもなければ null） */
export function joinContexts(...parts: (string | null)[]): string | null {
  const present = parts.filter((p): p is string => Boolean(p));
  return present.length ? present.join("\n\n") : null;
}
