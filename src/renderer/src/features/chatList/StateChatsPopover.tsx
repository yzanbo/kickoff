import { SquarePen } from "lucide-react";
import type { RefObject } from "react";
import { boardColumnOf, busyWithUnread } from "@shared/chat/state";
import { BOARD_COLUMN_LABELS, BOARD_COLUMNS, type AgentState, type BoardColumn, type Chat } from "@shared/types";
import { chatTitle } from "@/features/chat/chatTitle";
import { cx } from "@/lib/cx";
import { useChatStates } from "@/app/chatStatesContext";
import { useProjects } from "@/stores/projects";
import { COUNTED_COLUMNS } from "@/features/chat/chatState";
import { shortRelativeTime } from "@/lib/time";
import { COLUMN_TONE } from "@/features/chat/tones";
import { Popover } from "@/ui/Popover";
import { StatusDot } from "@/ui/StatusDot";
import { StatusSlot } from "@/features/chat/StatusSlot";

/** 一覧のまとまり（カンバンの列と、すべての状態を出すときのいちばん下の「アーカイブ済み」） */
type SectionKey = BoardColumn | "archived";

/** 状態ごとのチャットのまとまり（作業中 → 回答待ち → 未読（→ 既読 → アーカイブ済み）の順。中は最近動いた順） */
export interface StateChatsSection {
  column: SectionKey;
  chats: Chat[];
}

/** まとまりの名前と色（画面の見出しの状態ごとの数 StateStats でも使う） */
export const SECTION_LABELS: Record<SectionKey, string> = { ...BOARD_COLUMN_LABELS, archived: "アーカイブ済み" };
export const SECTION_TONES: Record<SectionKey, string> = { ...COLUMN_TONE, archived: "var(--extra-muted)" };

/**
 * チャットを状態ごとに分ける（チャットのないまとまりは出さない）。数え方はカンバンの列と同じ（boardColumnOf）で、状態ごとの数（stateCounts）とそろう。
 * 初めは作業中・回答待ち・未読だけ（アーカイブしたものと既読は入れない。画面の見出しの状態ごとの数）。
 * all なら既読と、いちばん下にアーカイブ済みも並べ、渡したチャットをすべて出す（右のパネルのタブのまとまりの札。そのまとまりのチャットの一覧）
 */
export function chatsByState(chats: readonly Chat[], stateOf: (chat: Chat) => AgentState, { all = false }: { all?: boolean } = {}): StateChatsSection[] {
  const keys: readonly SectionKey[] = all ? [...BOARD_COLUMNS, "archived"] : COUNTED_COLUMNS;
  const bySection = new Map<SectionKey, Chat[]>(keys.map((c) => [c, []]));
  for (const chat of chats) {
    const key: SectionKey = chat.archived_at ? "archived" : boardColumnOf(stateOf(chat));
    bySection.get(key)?.push(chat);
  }
  return keys.map((column) => ({ column, chats: bySection.get(column)!.sort((a, b) => b.active_at.localeCompare(a.active_at)) })).filter((s) => s.chats.length > 0);
}

/**
 * 状態ごとにまとめたチャットの一覧（見出しの下に「作業中」「回答待ち」「未読」と、それぞれのチャット）。
 * 画面の見出しの状態ごとの数（StateStats）と、右のパネルのタブのまとまりの名前の札で共通。行を押すと onOpen。
 * 行の左には、サイドバーの行と同じ状態の印（StatusSlot。作業中は回るリング、作業中のまま未読があれば緑の点を重ねる）を出す。
 * showProject なら行にプロジェクト名も出す（いくつかのプロジェクトのチャットが混ざるとき）。
 * newChat を渡すと、いちばん下に新しいチャットを始めるボタンを置く（タブのまとまりの札から開いたとき。そのグループに new チャットを足す）。
 * 開いた要素（anchor）の下に、左端をそろえて出す
 */
export function StateChatsPopover({
  title,
  anchor,
  sections,
  showProject = false,
  emptyText = "作業中・回答待ち・未読のチャットはありません",
  newChat,
  onOpen,
  onClose,
  className,
}: {
  title: string;
  /** 開いた要素（画面の見出しの状態ごとの数・タブのまとまりの札） */
  anchor: RefObject<HTMLElement | null>;
  sections: StateChatsSection[];
  showProject?: boolean;
  /** チャットがないときの文 */
  emptyText?: string;
  /** いちばん下の新しいチャットのボタン（文と、押したとき。一覧は閉じてから呼ぶ） */
  newChat?: { label: string; onSelect: () => void };
  onOpen: (chat: Chat) => void;
  onClose: () => void;
  className?: string;
}) {
  const { projectName } = useProjects();
  const { stateOf } = useChatStates();
  return (
    <Popover anchor={anchor} gap={6} title={title} label={title} className={cx("state-chats-popover", className)} onClose={onClose}>
      {sections.length === 0 && <p className="state-chats-empty muted">{emptyText}</p>}
      {sections.map(({ column, chats }) => (
        <section key={column} className="state-chats-section">
          <h3 className="state-chats-head">
            <StatusDot color={SECTION_TONES[column]} />
            {SECTION_LABELS[column]}
            <span className="muted">{chats.length}</span>
          </h3>
          {chats.map((chat) => (
            <button
              key={chat.id}
              type="button"
              className="state-chats-row"
              onClick={() => {
                onClose();
                onOpen(chat);
              }}
            >
              {/* サイドバーの行と同じ状態の印（見出しの状態と同じでも、行ごとにひと目で分かるように） */}
              <StatusSlot state={stateOf(chat)} unread={busyWithUnread(chat, stateOf(chat))} />
              <span className="state-chats-title">{chatTitle(chat.title)}</span>
              {showProject && <span className="state-chats-project muted">{projectName(chat.project_id)}</span>}
              <span className="state-chats-time muted">{shortRelativeTime(chat.active_at)}</span>
            </button>
          ))}
        </section>
      ))}
      {newChat && (
        <button
          type="button"
          className="state-chats-new"
          onClick={() => {
            onClose();
            newChat.onSelect();
          }}
        >
          <SquarePen size={14} aria-hidden />
          {newChat.label}
        </button>
      )}
    </Popover>
  );
}
