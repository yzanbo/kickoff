import { MessageSquare } from "lucide-react";
import { useMemo, useState } from "react";
import type { Chat } from "@shared/types";
import { chatTitle } from "@/features/chat/chatTitle";
import { useChats } from "@/stores/chats";
import { cx } from "@/lib/cx";
import { useListNavigation } from "@/hooks/useListNavigation";
import { useProjects } from "@/stores/projects";
import { relativeTime } from "@/lib/time";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton } from "@/ui/IconButton";
import { Popover, usePopover } from "@/ui/Popover";
import { SearchField } from "@/ui/SearchField";

/** 一覧に出すチャットの数（名前で絞り込めば、それより前のものも出る） */
const MAX_ROWS = 50;

/**
 * チャット欄の「ほかのチャットを参照」: ほかのチャットを選ぶと、そのやり取りの記録（チャット履歴）をファイルにして添え、AI に読ませる（前の話の続きや参考にする）。
 * 「添付」「取り込む」だと何が付くのか・このチャットに混ぜるのかが分かりにくいので、読ませるだけだと分かる「参照」と呼ぶ。
 * いまのチャット（exclude）は出さない。同じプロジェクトのものを先に、最近動いた順に並べ、名前で絞り込める（↑↓・Enter で選ぶ）
 */
export function ChatContextButton({ projectId, exclude, onPick }: { projectId?: number; exclude?: number; onPick: (chat: Chat) => void }) {
  const popover = usePopover();
  const { open, setOpen } = popover;
  const [query, setQuery] = useState("");
  const { projectName } = useProjects();
  // アーカイブしたチャットも出す（前の話を読み込ませたいのは、片付けたチャットのことも多い）。開いたときに初めて読む
  const { chats, loaded, error } = useChats({ archived: true, enabled: open });

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return chats
      .filter((r) => r.id !== exclude && (!q || chatTitle(r.title).toLowerCase().includes(q)))
      .sort((a, b) => Number(b.project_id === projectId) - Number(a.project_id === projectId) || b.active_at.localeCompare(a.active_at))
      .slice(0, MAX_ROWS);
  }, [chats, query, exclude, projectId]);
  const pick = (chat: Chat | undefined) => {
    if (!chat) return;
    onPick(chat);
    setOpen(false);
    setQuery("");
  };
  const nav = useListNavigation(items, pick);

  return (
    <span className="chip-wrap">
      <IconButton
        ref={popover.anchor}
        icon={MessageSquare}
        label="ほかのチャットを参照"
        title="ほかのチャットを参照（そのやり取りを AI に読ませて、前の話の続きや参考にします）"
        aria-expanded={open}
        type="button"
        onClick={popover.toggle}
      />
      {open && (
        <Popover anchor={popover.anchor} side="above" gap={8} title="参照するチャット" label="参照するチャット" className="chip-popover chat-context-popover" onClose={popover.close}>
          <SearchField autoFocus value={query} onChange={setQuery} onKeyDown={nav.onKeyDown} placeholder="チャット名で探す" label="参照するチャットを探す" />
          {!loaded ? (
            error ? <ErrorText message={error} /> : <p className="muted small">読み込み中…</p>
          ) : items.length === 0 ? (
            <p className="muted small">合うチャットはありません</p>
          ) : (
            <ul className="chat-context-list">
              {items.map((r, i) => (
                <li key={r.id}>
                  <button type="button" className={cx("chat-context-row", i === nav.index && "active")} onMouseEnter={() => nav.setIndex(i)} onClick={() => pick(r)}>
                    <span className="chat-context-title">{chatTitle(r.title)}</span>
                    <span className="muted small">
                      {projectName(r.project_id)} · {relativeTime(r.active_at)}
                      {r.archived_at && " · アーカイブ済み"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Popover>
      )}
    </span>
  );
}
