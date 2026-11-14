import type { DatabaseSync } from "node:sqlite";
import type { Chat, ChatStatus, GitHubLink } from "@shared/types";
import { bit, updateRow, type Notify, type Row } from "./common.js";
import type { NewChat } from "./types.js";
import { rememberChatSession } from "./agentSessions.js";

/** チャットの一覧の絞り込み（並びは最後に動いた順） */
export interface ChatFilter {
  projectId?: number;
  statuses?: ChatStatus[];
  limit?: number;
  includeArchived?: boolean;
  onlyArchived?: boolean;
}

/** update で変えられる列（型と UPDATE の対象をここ 1 つで決める。固定・グループ・プロジェクト・アーカイブは専用の操作で変える） */
const CHAT_COLUMNS = [
  "title",
  "status",
  "error",
  "session_id",
  "turn_started_at",
  "model",
  "effort",
  "permission_mode",
  "fast_mode",
  "cost_usd",
  "num_turns",
  "context_tokens",
  "context_window",
  "branch",
  "unread",
] as const satisfies readonly (keyof Chat)[];

/** チャットの変えられる項目 */
export type ChatPatch = Partial<Pick<Chat, (typeof CHAT_COLUMNS)[number]>>;

/** DB の行（真偽値は 0 / 1。archived_with_parent・trashed_at・trashed_with・ai_generation は店の中だけで使い、Chat には出さない） */
type ChatRow = Omit<Chat, "fast_mode" | "unread" | "pinned" | "untracked_only"> & {
  fast_mode: number;
  unread: number;
  pinned: number;
  untracked_only: number;
  archived_with_parent: number;
  trashed_at: string | null;
  trashed_with: string | null;
  ai_generation: number;
};

/** DB の行をアプリの型にする（真偽値の列を boolean に） */
function toChat(row: unknown): Chat {
  const { archived_with_parent: _withParent, trashed_at: _trashedAt, trashed_with: _trashedWith, ai_generation: _generation, ...r } = row as ChatRow;
  return { ...r, fast_mode: r.fast_mode === 1, unread: r.unread === 1, pinned: r.pinned === 1, untracked_only: r.untracked_only === 1 };
}

/** 変える項目を DB の列の値にする（真偽値は 0 / 1） */
function toChatRow({ fast_mode, unread, ...rest }: ChatPatch): Row {
  return { ...rest, fast_mode: bit(fast_mode), unread: bit(unread) } as Row;
}

/**
 * チャット（chats の表。エージェントとの会話。記録は events.ts）。Kickoff のゴミ箱に入れたチャット（trashed_at がある）は、
 * get・一覧・子孫などのふだんの読み取りから外す（消したのと同じに見せる）。ゴミ箱から扱うのは trashedWith / untrash / purgeTrashed だけ
 */
export function createChatStore(db: DatabaseSync, onChange: Notify) {
  const get = (id: number): Chat | undefined => {
    const row = db.prepare("SELECT * FROM chats WHERE id = ? AND trashed_at IS NULL").get(id);
    return row ? toChat(row) : undefined;
  };
  /** 1 列だけ変えて、変更を知らせる（最後に動いた時刻は進めない: 並び順を変えない操作に使う） */
  const setColumn = (id: number, column: "unread" | "pinned" | "group_id", value: number | null): Chat => {
    db.prepare(`UPDATE chats SET ${column} = ? WHERE id = ?`).run(value, id);
    const chat = get(id)!;
    onChange({ type: "chat", chat });
    return chat;
  };
  const inWorktree = (projectId: number, worktreePath: string): Chat[] =>
    db.prepare("SELECT * FROM chats WHERE project_id = ? AND worktree_path = ? AND trashed_at IS NULL ORDER BY id").all(projectId, worktreePath).map(toChat);

  const replaceWorktree = (projectId: number, from: string, to: string | null): void => {
    // ゴミ箱にあるチャットも付け替える（戻したときに消えた作業場所を指さないように。知らせるのはふだんのチャットだけ）
    const chats = inWorktree(projectId, from);
    db.prepare("UPDATE chats SET worktree_path = ? WHERE project_id = ? AND worktree_path = ?").run(to, projectId, from);
    for (const chat of chats) onChange({ type: "chat", chat: get(chat.id)! });
  };

  const descendants = (id: number): Chat[] =>
    db
      .prepare(
        `WITH RECURSIVE tree(id, depth) AS (SELECT id, 1 FROM chats WHERE parent_chat_id = ? AND trashed_at IS NULL UNION ALL SELECT c.id, t.depth + 1 FROM chats c JOIN tree t ON c.parent_chat_id = t.id WHERE c.trashed_at IS NULL)
         SELECT chats.* FROM chats JOIN tree ON chats.id = tree.id ORDER BY tree.depth DESC, chats.id`,
      )
      .all(id)
      .map(toChat);

  /** アーカイブの列を書いて、変更を知らせる（最後に動いた時刻は進めない） */
  const setArchived = (id: number, archivedAt: string | null, withParent: boolean) => {
    db.prepare("UPDATE chats SET archived_at = ?, archived_with_parent = ? WHERE id = ?").run(archivedAt, bit(withParent), id);
    onChange({ type: "chat", chat: get(id)! });
  };
  const childRows = (id: number): ChatRow[] => db.prepare("SELECT * FROM chats WHERE parent_chat_id = ? AND trashed_at IS NULL ORDER BY id").all(id) as ChatRow[];

  /**
   * アーカイブする・戻す（子孫も）。しまうときは、まだしまっていない子孫に「親と一緒にしまった」印を付けて一緒にしまう
   * （子チャットだけで先にしまっていたものは、そのまま）。戻すときは、印のある子孫だけを戻し、子チャットだけでしまっていたもの（とその下）はしまったまま。
   * 子チャットだけをしまう・戻すときは、親には触らない。しまったままもう一度しまっても、しまった日時は変えない
   */
  const archive = (id: number, archived: boolean, now = new Date()): Chat => {
    const chat = get(id)!;
    if (archived) {
      const at = chat.archived_at ?? now.toISOString();
      setArchived(id, at, false);
      for (const c of descendants(id)) if (c.archived_at === null) setArchived(c.id, at, true);
    } else {
      setArchived(id, null, false);
      const restore = (parentId: number, depth: number) => {
        for (const c of childRows(parentId)) {
          if (c.archived_at !== null && c.archived_with_parent !== 1) continue;
          if (c.archived_at !== null) setArchived(c.id, null, false);
          if (depth < 50) restore(c.id, depth + 1);
        }
      };
      restore(id, 1);
    }
    return get(id)!;
  };

  const memoChats = (projectId: number, memoPath: string): Chat[] =>
    db
      .prepare("SELECT * FROM chats WHERE project_id = ? AND trashed_at IS NULL AND (memo_path = ? OR substr(memo_path, 1, length(?) + 1) = ? || '/') ORDER BY id DESC")
      .all(projectId, memoPath, memoPath, memoPath)
      .map(toChat);

  return {
    get,
    list(filter: ChatFilter = {}): Chat[] {
      const where: string[] = ["trashed_at IS NULL", ...(filter.onlyArchived ? ["archived_at IS NOT NULL"] : filter.includeArchived ? [] : ["archived_at IS NULL"])];
      const params: Row = {};
      if (filter.projectId !== undefined) {
        where.push("project_id = $project_id");
        params.project_id = filter.projectId;
      }
      if (filter.statuses?.length) where.push(`status IN (${filter.statuses.map((s) => `'${s}'`).join(",")})`);
      const limit = filter.limit === undefined ? "" : ` LIMIT ${Math.trunc(filter.limit)}`;
      return db
        .prepare(`SELECT * FROM chats ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY active_at DESC, id DESC${limit}`)
        .all(params)
        .map(toChat);
    },
    create(input: NewChat): Chat {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO chats (project_id, provider, title, status, model, effort, permission_mode, fast_mode, group_id, worktree_path, parent_chat_id, parent_event_id, memo_path, untracked_only, github_repo, github_number, github_kind, ai_generation)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.project_id,
          input.provider,
          input.title,
          input.status,
          input.model ?? null,
          input.effort ?? null,
          input.permission_mode ?? "default",
          bit(input.fast_mode ?? false),
          input.group_id ?? null,
          input.worktree_path ?? null,
          input.parent_chat_id ?? null,
          input.parent_event_id ?? null,
          input.memo_path ?? null,
          bit(input.untracked_only ?? false),
          // repo・番号・種類はそろって入れる（どれかがなければ結び付けない）
          ...(input.github_repo && input.github_number && input.github_kind ? [input.github_repo, input.github_number, input.github_kind] : [null, null, null]),
          input.ai_generation ?? 0,
        );
      const chat = get(Number(lastInsertRowid))!;
      onChange({ type: "chat", chat });
      return chat;
    },
    /**
     * 項目を変えて知らせる。状態（status）を変える更新は「動いた」なので、最後に動いた時刻（一覧の並び順）も進める
     * （送った・作業が終わった。名前・未読・アーカイブなどの変更では進めない）
     */
    update(id: number, patch: ChatPatch): Chat {
      updateRow(db, "chats", id, toChatRow(patch), CHAT_COLUMNS, patch.status !== undefined);
      // チャットに入れたセッションは Kickoff が使ったものとして覚える（使われなくなったら会話記録をゴミ箱へ。メモの仕様書「ファイル削除」の Q17）
      if (typeof patch.session_id === "string") rememberChatSession(db, id, patch.session_id);
      const chat = get(id)!;
      onChange({ type: "chat", chat });
      return chat;
    },
    /** GitHub の issue・PR を結び付ける・外す（null）。最後に動いた時刻は進めない（並び順を変えない） */
    setGitHub(id: number, link: GitHubLink | null): Chat {
      db.prepare("UPDATE chats SET github_repo = ?, github_number = ?, github_kind = ? WHERE id = ?").run(link?.repo ?? null, link?.number ?? null, link?.kind ?? null, id);
      const chat = get(id)!;
      onChange({ type: "chat", chat });
      return chat;
    },
    /** AI が作った世代（利用者が作ったチャット = 0。AI の create_chat が作るたびに作った側 ＋ 1。ないチャットは 0） */
    aiGeneration(id: number): number {
      const row = db.prepare("SELECT ai_generation FROM chats WHERE id = ?").get(id) as { ai_generation: number } | undefined;
      return row?.ai_generation ?? 0;
    },
    /** 子孫の子チャット（子・孫・ひ孫…。深い方から順に。自分は含まない） */
    descendants,
    archive,
    /** メモのチャット（そのメモ、フォルダならその中のメモのもの。アーカイブ済みも含む。新しい順） */
    memoChats,
    /** メモの名前を変えた・動かしたとき、メモのチャットの memo_path を付け替える（フォルダなら中のメモのものも。並び順は変えない） */
    remapMemoPath(projectId: number, from: string, to: string) {
      for (const chat of memoChats(projectId, from)) {
        const next = chat.memo_path === from ? to : `${to}${chat.memo_path!.slice(from.length)}`;
        db.prepare("UPDATE chats SET memo_path = ? WHERE id = ?").run(next, chat.id);
        onChange({ type: "chat", chat: get(chat.id)! });
      }
    },
    /**
     * Kickoff のゴミ箱に入れる（ids のチャットに入れた時刻と一緒に入れたゴミ箱の行を書く。ふだんの読み取りから外れるので、消したのと同じに知らせる）。
     * 子孫も入れるなら呼ぶ側が ids に入れる
     */
    trash(ids: number[], itemId: string, at = new Date().toISOString()): Chat[] {
      const chats = ids.map(get).filter((c): c is Chat => c !== undefined);
      const stmt = db.prepare("UPDATE chats SET trashed_at = ?, trashed_with = ? WHERE id = ?");
      for (const chat of chats) stmt.run(at, itemId, chat.id);
      for (const chat of chats) onChange({ type: "chat_deleted", id: chat.id, project_id: chat.project_id });
      return chats;
    },
    /** そのゴミ箱の行と一緒に入れたチャット（深い方から） */
    trashedWith(itemId: string): Chat[] {
      return db.prepare("SELECT * FROM chats WHERE trashed_with = ? ORDER BY id DESC").all(itemId).map(toChat);
    },
    /**
     * ゴミ箱から戻す（そのゴミ箱の行と一緒に入れたチャット）。親がもう消えた・ゴミ箱にあるチャットは親のないチャットにする。戻したチャットを知らせて返す
     */
    untrash(itemId: string): Chat[] {
      const rows = db.prepare("SELECT id, parent_chat_id FROM chats WHERE trashed_with = ? ORDER BY id").all(itemId) as { id: number; parent_chat_id: number | null }[];
      const ids = new Set(rows.map((r) => r.id));
      db.prepare("UPDATE chats SET trashed_at = NULL, trashed_with = NULL WHERE trashed_with = ?").run(itemId);
      for (const r of rows) {
        if (r.parent_chat_id === null || ids.has(r.parent_chat_id) || get(r.parent_chat_id)) continue;
        db.prepare("UPDATE chats SET parent_chat_id = NULL, parent_event_id = NULL, archived_with_parent = 0 WHERE id = ?").run(r.id);
      }
      const chats = rows.map((r) => get(r.id)).filter((c): c is Chat => c !== undefined);
      for (const chat of chats) onChange({ type: "chat", chat });
      return chats;
    },
    /** ゴミ箱の行と一緒に入れたチャットを本当に消す（会話の記録・送信待ちも。消したチャットを返す。知らせは出さない = もう画面にない） */
    purgeTrashed(itemId: string): Chat[] {
      const chats = db.prepare("SELECT * FROM chats WHERE trashed_with = ? ORDER BY id DESC").all(itemId).map(toChat);
      db.prepare("DELETE FROM chats WHERE trashed_with = ?").run(itemId);
      return chats;
    },
    /** チャットを完全に削除する（会話の記録・送信待ち・子孫の子チャットも消える。子孫の分も知らせる） */
    delete(id: number) {
      const chat = get(id);
      if (!chat) return;
      const gone = [...descendants(id), chat];
      db.prepare("DELETE FROM chats WHERE id = ?").run(id);
      for (const c of gone) onChange({ type: "chat_deleted", id: c.id, project_id: c.project_id });
    },
    /** 未読の印を付ける・外す */
    setUnread: (id: number, unread: boolean) => setColumn(id, "unread", bit(unread)),
    /** サイドバーの上に固定する・やめる */
    setPinned: (id: number, pinned: boolean) => setColumn(id, "pinned", bit(pinned)),
    /**
     * 手動の並び（サイドバーの並び順「手動順」）を ids の順にする（position = 何番目か。ほかのプロジェクトのチャットは無視し、
     * ids にないチャットはそのまま）。最後に動いた時刻は進めない。変わったチャットだけ知らせ、ids のうちこのプロジェクトのチャットを並びの順に返す
     */
    reorder(projectId: number, ids: number[]): Chat[] {
      const stmt = db.prepare("UPDATE chats SET position = ? WHERE id = ? AND project_id = ? AND position IS NOT ?");
      const changed = ids.filter((id, i) => Number(stmt.run(i, id, projectId, i).changes) > 0);
      for (const id of changed) onChange({ type: "chat", chat: get(id)! });
      return ids.map(get).filter((c): c is Chat => c?.project_id === projectId);
    },
    /**
     * 子チャットを親から外す（parentId が null なら親のないチャットにして groupId のグループへ、先祖の ID ならその子に）。親のどの発言から聞いたか
     * （parent_event_id）と「親と一緒にアーカイブした」印を消す（アーカイブ済みならそのまま。親を戻しても一緒には戻らない）。子孫の親子のつながりはそのまま。
     * 確かめ（先祖か・グループ・作業中）は呼ぶ側（chat/detach.ts）。最後に動いた時刻は進めない
     */
    detach(id: number, parentId: number | null, groupId: number | null): Chat {
      db.prepare("UPDATE chats SET parent_chat_id = ?, parent_event_id = NULL, archived_with_parent = 0, group_id = ? WHERE id = ?").run(parentId, parentId === null ? groupId : null, id);
      const chat = get(id)!;
      onChange({ type: "chat", chat });
      return chat;
    },
    /** チャットをグループへ移す（null でグループから外す。同じプロジェクトのグループだけ: トリガーで守る） */
    setGroup: (id: number, groupId: number | null) => setColumn(id, "group_id", groupId),
    /**
     * チャットを別のプロジェクトへ移す。グループ・作業場所（ワークツリー）・最後に作業したブランチは元のプロジェクトのものなので外す
     * （作業場所は移った先の本体になる）。並び順は変えない
     */
    move(id: number, projectId: number): Chat {
      db.prepare("UPDATE chats SET project_id = ?, group_id = NULL, worktree_path = NULL, branch = NULL WHERE id = ?").run(projectId, id);
      const chat = get(id)!;
      onChange({ type: "chat", chat });
      return chat;
    },
    /**
     * 完了したまま days 日たったチャットをアーカイブする（自動のアーカイブ）。アーカイブした数（子孫は数えない）を返す。
     * 完了 = 終わっていて（完了・中断）、未読の印がなく、固定していないもの（失敗・作業中・固定したものはしない）。
     * 子チャットは親と一緒にしまうので、見るのは親のないチャットだけ。しまっていない子孫も、どれも同じく完了したまま days 日たっていなければしまわない
     */
    archiveStale(days: number, now = new Date()): number {
      const before = new Date(now.getTime() - days * 86_400_000).toISOString();
      const stale = (c: Pick<Chat, "status" | "unread" | "active_at">) => (c.status === "completed" || c.status === "cancelled") && !c.unread && c.active_at < before;
      const rows = db
        .prepare("SELECT id FROM chats WHERE archived_at IS NULL AND trashed_at IS NULL AND parent_chat_id IS NULL AND status IN ('completed', 'cancelled') AND unread = 0 AND pinned = 0 AND active_at < ?")
        .all(before) as { id: number }[];
      let count = 0;
      for (const { id } of rows) {
        if (!descendants(id).every((c) => c.archived_at !== null || stale(c))) continue;
        archive(id, true, now);
        count++;
      }
      return count;
    },
    /** その作業場所（ワークツリー）を使っているチャット */
    inWorktree,
    /** ワークツリーを片付けたあと、そこで作業していたチャットの作業場所を本体に戻す（並び順は変えない） */
    clearWorktree(projectId: number, worktreePath: string): void {
      replaceWorktree(projectId, worktreePath, null);
    },
    /** その作業場所のチャットを、別の作業場所（null なら本体）に付け替える（プロジェクトのフォルダを変えたとき。並び順は変えない） */
    replaceWorktree,
    /** 起動時の復旧: 前回終了時に作業中だったチャットを、未読の失敗にする（最後に動いた時刻は変えない）。直した数を返す */
    /** 前回の終了で作業中のまま残ったチャットを未読の失敗にする（そのチャットの ID を返す） */
    recoverInterrupted(error: string): number[] {
      const rows = db.prepare("UPDATE chats SET status = 'failed', error = ?, unread = 1 WHERE status = 'running' RETURNING id").all(error) as { id: number }[];
      return rows.map((r) => r.id);
    },
  };
}
