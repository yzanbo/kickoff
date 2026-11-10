import type { RefObject } from "react";
import { busyWithUnread } from "@shared/chat/state";
import { BOARD_COLUMNS, type Chat } from "@shared/types";
import { chatTitle } from "@/features/chat/chatTitle";
import { cx } from "@/lib/cx";
import { useChatStates } from "@/app/chatStatesContext";
import { useProjects } from "@/stores/projects";
import { COUNTED_COLUMNS, type ApprovalIndex } from "@/features/chat/chatState";
import { shortRelativeTime } from "@/lib/time";
import { COLUMN_TONE } from "@/features/chat/tones";
import { Popover } from "@/ui/Popover";
import { StatusSlot } from "@/features/chat/StatusSlot";
import { bucketChats, type BucketHead, type ChatBucket } from "./buckets";
import { BucketChip } from "./StateChip";

/** 状態のまとまりの色（カンバンの列と同じ。いちばん下の「アーカイブ済み」は控えめな灰。画面の見出しの状態ごとの数 StateStats でも使う） */
export const bucketTone = (bucket: Pick<BucketHead, "column">) => (bucket.column ? COLUMN_TONE[bucket.column] : "var(--extra-muted)");

/**
 * チャットを状態ごとに分ける（bucketChats。チャットのないまとまりは出さない。中は最後に動いた順）。数え方はカンバンの列と同じで、状態ごとの数（stateCounts）とそろう。
 * 初めは作業中・回答待ち・未読だけ（アーカイブしたものと既読は入れない。画面の見出しの状態ごとの数・⌘⇧A）。
 * all なら既読と、いちばん下にアーカイブ済みも並べ、渡したチャットをすべて出す（右のパネルのタブのまとまりの札。そのまとまりのチャットの一覧）
 */
export function chatsByState(chats: readonly Chat[], pending: ApprovalIndex, { all = false }: { all?: boolean } = {}): ChatBucket[] {
  return bucketChats(chats, { pending, by: "status", columns: all ? BOARD_COLUMNS : COUNTED_COLUMNS, archived: all ? "bucket" : "drop" });
}

/**
 * 状態ごとにまとめたチャットの一覧（見出しの下に「作業中」「回答待ち」「未読」と、それぞれのチャット）。
 * 画面の見出しの状態ごとの数（StateStats）と、右のパネルのタブのまとまりの名前の札で共通。行を押すと onOpen。
 * 行の左には、サイドバーの行と同じ状態の印（StatusSlot。作業中は回るリング、作業中のまま未読があれば緑の点を重ねる）を出す。
 * showProject なら行にプロジェクト名も出す（いくつかのプロジェクトのチャットが混ざるとき）。
 * 開いた要素（anchor）の下に、左端をそろえて出す
 */
export function StateChatsPopover({
  title,
  anchor,
  sections,
  showProject = false,
  emptyText = "作業中・回答待ち・未読のチャットはありません",
  onOpen,
  onClose,
  className,
}: {
  title: string;
  /** 開いた要素（画面の見出しの状態ごとの数・タブのまとまりの札） */
  anchor: RefObject<HTMLElement | null>;
  sections: ChatBucket[];
  showProject?: boolean;
  /** チャットがないときの文 */
  emptyText?: string;
  /** いちばん下の新しいチャットのボタン（文と、押したとき。一覧は閉じてから呼ぶ） */
  onOpen: (chat: Chat) => void;
  onClose: () => void;
  className?: string;
}) {
  const { projectName } = useProjects();
  const { stateOf } = useChatStates();
  return (
    <Popover anchor={anchor} gap={6} title={title} label={title} className={cx("state-chats-popover", className)} onClose={onClose}>
      {sections.length === 0 && <p className="state-chats-empty muted">{emptyText}</p>}
      {sections.map((section) => (
        <section key={section.key} className="state-chats-section">
          <h3 className="state-chats-head">
            <BucketChip bucket={section} tone={bucketTone(section)} count={section.chats.length} chats={section.chats} />
          </h3>
          {section.chats.map((chat) => (
            <button
              key={chat.id}
              type="button"
              className="state-chats-row"
              onClick={() => {
                onClose();
                onOpen(chat);
              }}
            >
              {/* サイドバーの行と同じ状態の印（見出しの札の印の真下。見出しの状態と同じでも、行ごとにひと目で分かるように） */}
              <StatusSlot state={stateOf(chat)} unread={busyWithUnread(chat, stateOf(chat))} />
              <span className="state-chats-title">{chatTitle(chat.title)}</span>
              {showProject && <span className="state-chats-project muted">{projectName(chat.project_id)}</span>}
              <span className="state-chats-time muted">{shortRelativeTime(chat.active_at)}</span>
            </button>
          ))}
        </section>
      ))}
    </Popover>
  );
}
