import { Archive, Folder, GitBranch, Inbox, Pin, SquarePen } from "lucide-react";
import type { HTMLAttributes, MouseEvent, ReactNode } from "react";
import { COLUMN_LOOKS, STATE_LOOKS } from "@shared/chat/stateLooks";
import type { Chat } from "@shared/chat/types";
import { NO_GROUP_LABEL } from "@shared/groups/labels";
import { api } from "@/foundation/ui/api";
import { cx } from "@/foundation/ui/lib/cx";
import { open as openTarget } from "@/foundation/ui/navigation/open";
import { FOLD_ROW } from "@/foundation/ui/kit/FoldHead";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { InlineName } from "@/foundation/ui/kit/InlineName";
import { WORKPLACE_KIND_LABELS } from "@/foundation/ui/workplace/workplace";
import { NewChatItem } from "@/features/chat/ui";
import type { PlacedDraft } from "@/features/chatPanel/ui";
import { newChatPlaceOf, type ChatBucket, type HeadSpec, type HeadTable } from "@/features/chatList/ui";
import { ProjectMark } from "@/features/projects/ui";
import { FOLD_GROUP, FOLD_SECTION } from "./foldLooks";
import { huedHeadProps } from "./bucketColor";
import type { useGroupSections } from "./useGroupSections";
import { useBucketArchiveDrop, type useWorkspaceDrops } from "./useWorkspaceDrops";

type Bucket = ChatBucket<PlacedDraft>;
type Drop = ReturnType<typeof useWorkspaceDrops>["archiveDrop"];
const dropClass = (drop: Drop) => drop.over && (drop.blocked ? "drop-blocked" : "drop-target");
const AFTER_PINNED = "sidebar-after-pinned";

/** まとまりの見出しの印（状態 = 列の色の点 / 作業場所 = ブランチ。ワークツリーは色付き、フォルダなしは薄く） */
function BucketMark({ bucket }: { bucket: Bucket }) {
  if (bucket.column) return <span className="status-group-dot" data-state={COLUMN_LOOKS[bucket.column].tone} aria-hidden />;
  const kind = bucket.place?.kind;
  if (!kind) return null;
  return <GitBranch size={13} className={cx(kind === "worktree" && "status-group-worktree", kind === "missing" && "status-group-gone")} />;
}

/** まとまり（グループ・No Group・作業場所）のいちばん下の「アーカイブ済み」の落とし先（落とすとアーカイブ。中の行をまとまりへ落とすと戻す） */
function ArchiveDropFrame({ projectId, chats, groupId, children }: { projectId: number; chats: readonly Chat[]; groupId: number | null | undefined; children: ReactNode }) {
  const drop = useBucketArchiveDrop(projectId, chats, groupId);
  return (
    <div className={cx("archive-drop nested-archive", dropClass(drop))} {...drop.props}>
      {children}
    </div>
  );
}

/** 固定したチャットと下書きの小見出し（グループ・作業場所の中） */
const PINNED_LIST: HeadSpec = {
  head: null,
  wrap: null,
  bare: true,
  frame: (section) => (
    <section className="sidebar-pinned-list" aria-label="固定したチャット">
      <div className="sidebar-pinned-head">
        <Pin size={12} aria-hidden />
        <span>固定</span>
      </div>
      {section}
    </section>
  ),
};

export interface WorkspaceHeadsInput {
  projectId: number;
  /** プロジェクトのチャット（アーカイブ済みも。落としたチャットを引く） */
  chats: readonly Chat[];
  /** 見出しの下の一覧（グループの見出しを出していないときの一覧・まとめないときの all） */
  mainKey: string;
  showGroups: boolean;
  grouping: "none" | "group" | "worktree";
  /** まとまりのキー → 下書きの数（見出しの数に足す） */
  draftCounts: ReadonlyMap<string, number>;
  /** 「No Group」の見出しを出すか */
  ungroupedHead: boolean;
  /** 見出しの下の一覧の中身の代わり（hidden = 「No Group」を閉じているか。undefined = いつもどおり / null = 何も描かない / start = 最初のチャットを始める） */
  mainEmpty: (hidden: boolean) => "start" | null | undefined;
  colors: { hueOf: (bucket: Pick<Bucket, "key" | "kind" | "group" | "hue">) => number | null; onContextMenu?: (e: MouseEvent, lead?: ReactNode) => void };
  sections: ReturnType<typeof useGroupSections>;
  drops: ReturnType<typeof useWorkspaceDrops>;
}

/** サイドバーの 1 つのプロジェクトのまとまりの見出しの表（BucketTree に渡す） */
export function workspaceHeads(o: WorkspaceHeadsInput): HeadTable<PlacedDraft> {
  const { projectId, colors, sections, drops, draftCounts } = o;
  const count = (bucket: Bucket) => bucket.chats.length + (draftCounts.get(bucket.key) ?? 0);
  const content = (hidden: boolean) => {
    const empty = o.mainEmpty(hidden);
    return empty === "start" ? (
      <button className="chat-row ghost" onClick={() => openTarget({ kind: "newChat", projectId })}>
        <SquarePen size={13} /> 最初のチャットを始める
      </button>
    ) : (
      empty
    );
  };
  // グループの見出しを出していないときの一覧（グループ別ならグループなしのまとまり。アーカイブ済みを落とすと戻す）
  const main = (bucket: Bucket): HeadSpec => ({
    head: null,
    wrap: cx("restore-drop", drops.restoreDrop.over && "drop-target"),
    wrapProps: drops.restoreDrop.props,
    open: true,
    indent: false,
    content: content(false),
    pinnedApart: bucket.kind === "ungrouped" ? AFTER_PINNED : undefined,
  });
  // 作業場所・状態のまとまり（いちばん外の段だけ色と右クリック。作業場所の見出しは、いちばん上にその作業場所で始める「新しいチャット」）
  const section = (bucket: Bucket, parent?: Bucket): HeadSpec => {
    const outer = !parent || parent.kind === "all";
    const onContextMenu = outer ? colors.onContextMenu : undefined;
    return {
      head: {
        look: FOLD_SECTION,
        title: bucket.title,
        label: (
          <>
            <BucketMark bucket={bucket} />
            <span className="status-group-label">{bucket.label}</span>
            {bucket.place && <span className="status-group-extra">{WORKPLACE_KIND_LABELS[bucket.place.kind]}</span>}
          </>
        ),
        count: count(bucket),
        ...huedHeadProps(outer ? colors.hueOf(bucket) : null),
        onContextMenu:
          onContextMenu &&
          ((e) => {
            const place = newChatPlaceOf(bucket);
            onContextMenu(
              e,
              place && <NewChatItem place={place} branch={bucket.place?.name ?? null} sameAs="" onSelect={() => openTarget({ kind: "newChat", projectId: place.projectId, groupId: place.group, worktree: place.worktree })} />,
            );
          }),
      },
      pinnedApart: AFTER_PINNED,
      childrenClass: "custom-group-grouped",
    };
  };
  return {
    waiting: (bucket) => ({ head: { look: FOLD_ROW, icon: Inbox, label: "要対応", count: bucket.chats.length } }),
    // まとめないときの一覧と、いちばん上の下書き
    all: (bucket) => (bucket.key === o.mainKey ? main(bucket) : { head: null, wrap: null, bare: true }),
    pinned: (bucket, { parent }) =>
      parent
        ? PINNED_LIST
        : {
            head: { look: FOLD_ROW, icon: Pin, label: "固定", count: bucket.chats.length + bucket.drafts.length, ...huedHeadProps(colors.hueOf(bucket)), onContextMenu: colors.onContextMenu },
            wrap: cx(FOLD_ROW.wrap, "pinned"),
          },
    group: (bucket, { open, toggle }) => {
      const group = bucket.group!;
      const s = sections.sectionProps(group);
      const hued = huedHeadProps(colors.hueOf(bucket));
      const pressLabel = open ? "閉じる" : "開く";
      return {
        head: {
          look: FOLD_GROUP,
          className: hued.className,
          style: hued.style,
          draggable: !s.renaming,
          title: "ドラッグでグループを並べ替える（右クリックでメニュー・名前をダブルクリックで名前を変更）",
          onContextMenu: (e) => s.menu.openFor(group, e),
          onClick: (e) => {
            // 矢印以外のところを押しても開閉する（矢印・＋・…・名前の入力欄は除く）
            if ((e.target as HTMLElement).closest("button, input")) return;
            toggle();
          },
          ...s.dragProps,
          icon: Folder,
          // 名前の編集中は、ほかの操作を隠す（押し直して編集が始まり直さないように）
          name: s.renaming ? (
            <InlineName
              initial={group.name}
              onSubmit={(name) => {
                s.onRenameEnd();
                void api.renameGroup(group.id, name);
              }}
              onCancel={s.onRenameEnd}
            />
          ) : (
            <button
              type="button"
              className="custom-group-name"
              title={`${pressLabel}（ダブルクリックで名前を変更）`}
              onClick={(e) => {
                // ダブルクリック（名前の変更）の 2 回目は数えない
                if (e.detail > 1) return;
                toggle();
              }}
              onDoubleClick={s.onRenameStart}
            >
              {group.name}
            </button>
          ),
          count: s.renaming ? undefined : count(bucket),
          actions: !s.renaming && (
            <>
              <IconButton
                icon={SquarePen}
                label={`${group.name} に新しいチャット`}
                title={`「${group.name}」に新しいチャット`}
                iconSize={13}
                className="custom-group-add"
                onClick={() => openTarget({ kind: "newChat", projectId, groupId: group.id })}
              />
              {s.menu.button(group)}
            </>
          ),
        },
        wrap: cx("custom-group", s.dropClass),
        wrapProps: s.dropProps as HTMLAttributes<HTMLDivElement>,
        pinnedApart: AFTER_PINNED,
        childrenClass: "custom-group-grouped",
      };
    },
    ungrouped: (bucket, { open }) => {
      if (!o.showGroups) return main(bucket);
      const hued = huedHeadProps(colors.hueOf(bucket));
      const onContextMenu = colors.onContextMenu;
      return {
        // グループと同じく、見出しのドラッグでグループの間へ並べ替える（チャットを落とすとグループから外す落とし先は、包む要素）
        head: o.ungroupedHead
          ? {
              look: FOLD_ROW,
              className: hued.className,
              style: hued.style,
              draggable: true,
              title: "ドラッグでグループの間へ並べ替える",
              onContextMenu:
                onContextMenu &&
                ((e) => onContextMenu(e, <NewChatItem place={{ projectId }} sameAs="" onSelect={() => openTarget({ kind: "newChat", projectId })} />)),
              ...sections.ungrouped.dragProps,
              label: NO_GROUP_LABEL,
              count: count(bucket),
              actions: (
                <>
                  <IconButton icon={SquarePen} label={`${NO_GROUP_LABEL} で新しいチャット`} iconSize={13} className="custom-group-add" onClick={() => openTarget({ kind: "newChat", projectId })} />
                  {/* グループの見出しと＋の位置をそろえるため、右端の「…」の分を空けておく */}
                  <span className="group-menu-spacer" aria-hidden />
                </>
              ),
            }
          : null,
        wrap: sections.ungrouped.className,
        wrapProps: sections.ungrouped.dropProps as HTMLAttributes<HTMLDivElement>,
        content: content(!open),
        pinnedApart: AFTER_PINNED,
      };
    },
    worktree: (bucket, { parent }) => section(bucket, parent),
    status: (bucket, { parent }) => section(bucket, parent),
    archived: (bucket, { parent }) =>
      parent
        ? {
            head: { look: FOLD_ROW, icon: Archive, label: "アーカイブ済み", count: bucket.chats.length, title: "ここへチャットをドラッグすると、確かめてからアーカイブします" },
            frame: (s) => (
              <ArchiveDropFrame projectId={projectId} chats={o.chats} groupId={parent.kind === "group" ? parent.group?.id : parent.kind === "ungrouped" ? null : undefined}>
                {s}
              </ArchiveDropFrame>
            ),
            rowsClass: "archived-rows",
          }
        : {
            // チャットの行をここへドラッグすると、確かめてからアーカイブする（中も、ほかのチャットと同じまとめ方で出す。グループには分けない）
            head: { look: FOLD_ROW, icon: Archive, label: "アーカイブ済み", count: bucket.chats.length, ...huedHeadProps(colors.hueOf(bucket)), onContextMenu: colors.onContextMenu },
            frame: (s) => (
              <div className={cx("archive-drop", dropClass(drops.archiveDrop))} {...drops.archiveDrop.props}>
                {s}
              </div>
            ),
            childrenClass: "custom-group-grouped",
            rowsClass: "archived-rows",
          },
  };
}

/** 要対応の見出しの表（状態順 = 状態の色の点・名前 / プロジェクト別 = プロジェクトの印・名前） */
export const INBOX_HEADS: HeadTable = {
  status: (bucket) => ({
    head: {
      look: FOLD_SECTION,
      label: (
        <>
          <span className="status-group-dot" data-state={bucket.state && STATE_LOOKS[bucket.state].tone} aria-hidden />
          <span className="status-group-label">{bucket.label}</span>
        </>
      ),
      count: bucket.chats.length,
    },
  }),
  project: (bucket) => ({
    head: {
      look: FOLD_SECTION,
      label: (
        <>
          {bucket.project && <ProjectMark project={bucket.project} />}
          <span className="status-group-label">{bucket.label}</span>
        </>
      ),
      count: bucket.chats.length,
    },
  }),
};
