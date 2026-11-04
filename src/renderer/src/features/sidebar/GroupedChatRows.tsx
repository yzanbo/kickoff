import { GitBranch } from "lucide-react";
import type { ReactNode } from "react";
import type { Chat } from "@shared/types";
import type { ChatBucket } from "@/features/chatList/buckets";
import { COLUMN_TONE } from "@/features/chat/tones";
import { useSetting } from "@/hooks/useSetting";
import { cx } from "@/lib/cx";
import { WORKPLACE_KIND_LABELS } from "@/features/worktree/workplace";
import { Collapse } from "@/ui/Collapse";
import { GroupToggle } from "@/ui/GroupToggle";
import { sidebarSectionClosed } from "@/lib/storageKeys";
import { useFoldAll } from "@/features/chatList/chatListFlags";

/** まとまりの見出しの印（状態 = 列の色の点 / 作業場所 = ブランチ。ワークツリーは色付き、フォルダなし・以前のブランチは薄く） */
function BucketMark({ bucket }: { bucket: ChatBucket }) {
  if (bucket.column) return <span className="status-group-dot" style={{ background: COLUMN_TONE[bucket.column] }} aria-hidden />;
  const kind = bucket.place?.kind;
  if (!kind) return null;
  return <GitBranch size={13} className={cx(kind === "worktree" && "status-group-worktree", (kind === "missing" || kind === "past") && "status-group-gone")} />;
}

/**
 * 見出しつきのまとまり 1 つ（見出しは 開閉・印・名前・件数。ボードの列の見出しと同じ形）。見出しを押すと開閉する。
 * 中の段があれば（作業場所の中を状態別に分けるとき）、その見出しのまとまりを並べる。開閉はまとまりのキーで覚え、forceOpen（検索中）は開いて見せる
 */
function Section({ bucket, renderRow, forceOpen }: { bucket: ChatBucket; renderRow: (chat: Chat) => ReactNode; forceOpen: boolean }) {
  const [closed, setClosed] = useSetting(sidebarSectionClosed(bucket.key));
  const open = forceOpen || !closed;
  const toggle = () => setClosed(!closed);
  // 見出しの行の「すべて閉じる / 開く」
  useFoldAll(setClosed);
  return (
    <div className="status-group">
      <div className="status-group-head" title={bucket.title}>
        <GroupToggle open={open} onToggle={toggle} />
        <button className="status-group-name" aria-expanded={open} onClick={toggle}>
          <BucketMark bucket={bucket} />
          <span className="status-group-label">{bucket.label}</span>
          {bucket.place && <span className="status-group-extra">{WORKPLACE_KIND_LABELS[bucket.place.kind]}</span>}
          <span className="status-group-count">{bucket.chats.length}</span>
        </button>
      </div>
      <Collapse open={open} indent>
        {bucket.children ? (
          <div className="custom-group-grouped">
            <GroupedChatRows buckets={bucket.children} renderRow={renderRow} forceOpen={forceOpen} />
          </div>
        ) : (
          <ul className="chat-rows">{bucket.chats.map(renderRow)}</ul>
        )}
      </Collapse>
    </div>
  );
}

/**
 * サイドバーのチャットを、見出しのまとまり（bucketChats の作業場所・状態のまとまり）に分けて出す（まとめない × 新しい順は分けないので使わない）。
 * 作業場所の中を状態別に分けるときは、その中も見出しのまとまりにする。まとまりはそれぞれ開閉でき、まとまりのキー（プロジェクト・グループ・
 * アーカイブ済みの中のどこかが入る）で覚える。forceOpen（検索中）のときはすべて開く。グループなしだけでなく、自分で作ったグループの中・
 * アーカイブ済みの中でも同じように使う
 */
export function GroupedChatRows({ buckets, renderRow, forceOpen = false }: { buckets: readonly ChatBucket[]; renderRow: (chat: Chat) => ReactNode; forceOpen?: boolean }) {
  return buckets.map((bucket) => <Section key={bucket.key} bucket={bucket} renderRow={renderRow} forceOpen={forceOpen} />);
}
