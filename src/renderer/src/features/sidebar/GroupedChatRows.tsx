import { GitBranch } from "lucide-react";
import type { ReactNode } from "react";
import type { Chat } from "@shared/types";
import { newChatPlaceOf, type ChatBucket } from "@/features/chatList/buckets";
import { openNewChat } from "@/app/router";
import { NewChatItem } from "@/features/chat/NewChatItem";
import { COLUMN_TONE } from "@/features/chat/tones";
import { useFold } from "@/hooks/useFold";
import { cx } from "@/lib/cx";
import { WORKPLACE_KIND_LABELS } from "@/features/worktree/workplace";
import { FoldSection } from "@/ui/FoldHead";
import type { MouseEvent } from "react";
import { huedHeadProps } from "./bucketColor";

/** まとまりの見出しの印（状態 = 列の色の点 / 作業場所 = ブランチ。ワークツリーは色付き、フォルダなし・以前のブランチは薄く） */
function BucketMark({ bucket }: { bucket: ChatBucket }) {
  if (bucket.column) return <span className="status-group-dot" style={{ background: COLUMN_TONE[bucket.column] }} aria-hidden />;
  const kind = bucket.place?.kind;
  if (!kind) return null;
  return <GitBranch size={13} className={cx(kind === "worktree" && "status-group-worktree", (kind === "missing" || kind === "past") && "status-group-gone")} />;
}

/**
 * 見出しつきのまとまり 1 つ（見出しは 開閉・印・名前・件数。ボードの列の見出しと同じ形）。見出しを押すと開閉する。
 * 中の段があれば（作業場所の中を状態順に分けるとき）、その見出しのまとまりを並べる。開閉はまとまりのキーで覚え、forceOpen（検索中）は開いて見せる
 */
function Section({ bucket, renderRow, forceOpen, hue, onContextMenu, renderArchived }: SectionProps & { bucket: ChatBucket; hue: number | null }) {
  // 開閉はまとまりのキーで覚える（見出しの行の「すべて閉じる / 開く」にも従う）
  const fold = useFold("sidebar", bucket.key, { forceOpen });
  const label = (
    <>
      <BucketMark bucket={bucket} />
      <span className="status-group-label">{bucket.label}</span>
      {bucket.place && <span className="status-group-extra">{WORKPLACE_KIND_LABELS[bucket.place.kind]}</span>}
    </>
  );
  return (
    <FoldSection
      look="section"
      title={bucket.title}
      open={fold.open}
      onToggle={fold.toggle}
      label={label}
      count={bucket.chats.length}
      {...huedHeadProps(hue)}
      onContextMenu={
        onContextMenu &&
        ((e) => {
          // 作業場所の見出しは、いちばん上にその作業場所で始める「新しいチャット」（どこで始めるかの札を添える。チャットの右クリックと同じ NewChatItem）
          const place = newChatPlaceOf(bucket);
          onContextMenu(
            e,
            place && <NewChatItem place={place} branch={bucket.place?.name ?? null} sameAs="" onSelect={() => openNewChat(place.projectId, { group: place.group, worktree: place.worktree })} />,
          );
        })
      }
    >
      {bucket.children ? (
        <div className="custom-group-grouped">
          <GroupedChatRows buckets={bucket.children} renderRow={renderRow} forceOpen={forceOpen} />
        </div>
      ) : bucket.chats.length === 0 ? null : (
        <ul className="chat-rows">{bucket.chats.map(renderRow)}</ul>
      )}
      {bucket.archived && renderArchived?.(bucket.archived)}
    </FoldSection>
  );
}

/**
 * サイドバーのチャットを、見出しのまとまり（bucketChats の作業場所・状態のまとまり）に分けて出す（まとめない × 最近動いた順は分けないので使わない）。
 * 作業場所の中を状態順に分けるときは、その中も見出しのまとまりにする。まとまりはそれぞれ開閉でき、まとまりのキー（プロジェクト・グループ・
 * アーカイブ済みの中のどこかが入る）で覚える。forceOpen（検索中）のときはすべて開く。グループなしだけでなく、自分で作ったグループの中・
 * アーカイブ済みの中でも同じように使う。作業場所別では、まとまりのいちばん下にそのまとまりのアーカイブ済み（renderArchived）
 */
export function GroupedChatRows({
  buckets,
  renderRow,
  forceOpen = false,
  hueOf,
  onContextMenu,
  renderArchived,
}: Omit<SectionProps, "forceOpen"> & {
  buckets: readonly ChatBucket[];
  forceOpen?: boolean;
  /** 見出しの色（作業場所別で「まとまりを色付きで表示」のとき。タブの列のまとまりと同じ色）。中の段（状態）には付けない */
  hueOf?: (bucket: ChatBucket) => number | null;
}) {
  return buckets.map((bucket) => (
    <Section
      key={bucket.key}
      bucket={bucket}
      renderRow={renderRow}
      forceOpen={forceOpen}
      hue={hueOf?.(bucket) ?? null}
      onContextMenu={onContextMenu}
      renderArchived={renderArchived}
    />
  ));
}

interface SectionProps {
  renderRow: (chat: Chat) => ReactNode;
  forceOpen: boolean;
  /** 見出しの右クリック（「まとまりを色付きで表示」のメニュー。lead はその上に置く項目（作業場所の「新しいチャット」）。まとめないときは undefined） */
  onContextMenu?: (e: MouseEvent, lead?: ReactNode) => void;
  /** まとまりのアーカイブ済み（bucket.archived。作業場所別）を、中身のいちばん下に描く */
  renderArchived?: (archived: ChatBucket) => ReactNode;
}
