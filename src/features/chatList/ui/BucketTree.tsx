import type { HTMLAttributes, ReactNode } from "react";
import type { Chat } from "@shared/chat/types";
import { useFolds } from "@/foundation/ui/hooks/useFold";
import { RowBudgetScope, useRowBudgets } from "@/foundation/ui/hooks/useProgressiveRows";
import { Collapse } from "@/foundation/ui/kit/Collapse";
import { FoldHead, type FoldHeadProps } from "@/foundation/ui/kit/FoldHead";
import type { BucketKind, ChatBucket, DraftTarget } from "./buckets";
import { ChatRowList } from "./ChatRowList";

/** 下書き（固定したものは「固定」の小見出しへ分ける） */
type TreeDraft = DraftTarget & { pinned?: boolean };

/** まとまり 1 つの描き方（見出しの表 HeadTable が、まとまりの種類ごとに返す） */
export interface HeadSpec {
  /** 見出し（開閉は BucketTree が渡す。null = 見出しを出さない） */
  head: Omit<FoldHeadProps, "open" | "onToggle"> | null;
  /** 見出しと中身を包む div のクラス（既定は見出しの look.wrap。null = 包まない） */
  wrap?: string | null;
  /** 包む div に付けるもの（落とし先・並べ替え） */
  wrapProps?: HTMLAttributes<HTMLDivElement>;
  /** いちばん外を包む（hook を使う落とし先の部品で包むとき） */
  frame?: (section: ReactNode) => ReactNode;
  /** 開閉の記憶によらず開くか閉じるか（見出しを出さないまとまり） */
  open?: boolean;
  /** 中身を段下げするか（既定 true） */
  indent?: boolean;
  /** 開閉で包まず、中身をそのまま並べる（固定の小見出し） */
  bare?: boolean;
  /** 中身の代わりに描くもの（空のときの案内。null = 何も描かない） */
  content?: ReactNode;
  /** 固定したチャット・下書きを「固定」の小見出し（種類 pinned の見出し）の下に分け、残りをこのクラスの要素に入れる */
  pinnedApart?: string;
  /** 中の段の並びを包むクラス */
  childrenClass?: string;
  /** 行の一覧のクラス */
  rowsClass?: string;
}

export interface HeadContext<D extends TreeDraft = TreeDraft> {
  open: boolean;
  toggle(): void;
  /** 中の段・アーカイブ済み・固定の小見出しのとき、外のまとまり */
  parent?: ChatBucket<D>;
}

/** まとまりの種類ごとの描き方（null を返せば描かない。表にない種類は見出しなしで中身だけ） */
export type HeadTable<D extends TreeDraft = TreeDraft> = Partial<Record<BucketKind, (bucket: ChatBucket<D>, ctx: HeadContext<D>) => HeadSpec | null>>;

export interface BucketTreeProps<D extends TreeDraft = TreeDraft> {
  buckets: readonly ChatBucket<D>[];
  heads: HeadTable<D>;
  renderRow(chat: Chat, bucket: ChatBucket<D>): ReactNode;
  /** まとまりの下書きの行（drafts） */
  renderDrafts?(drafts: readonly D[]): ReactNode;
  /** 開閉を覚える場所（useFolds の place） */
  place: string;
  /** すべて開いて見せる（絞り込み中） */
  forceOpen?: boolean;
  /** 中の段のとき、外のまとまり（BucketTree が自分で渡す） */
  parent?: ChatBucket<D>;
}

const BARE: HeadSpec = { head: null, wrap: null, bare: true };

/**
 * まとまりの木を描く（サイドバーのプロジェクトのチャット一覧・要対応）。見出しは種類ごとの表 heads で決め、開閉はまとまりのキーで覚える
 * （アーカイブ済みは初めは閉じる。見出しのないまとめないまとまり all は覚えない）。中の段（children）とまとまりのアーカイブ済み（archived）は同じ形で再帰する。
 * 最初に描く行の上限は、上から並ぶ順に配る（閉じているまとまりは 0）
 */
export function BucketTree<D extends TreeDraft>(props: BucketTreeProps<D>) {
  const { buckets, heads, place, forceOpen = false, parent } = props;
  const folds = useFolds(
    place,
    buckets.filter((b) => b.kind !== "all").map((b) => b.key),
  );
  const items = buckets.flatMap((bucket) => {
    const remembered = bucket.kind === "all" || forceOpen || folds.isOpen(bucket.key, bucket.kind !== "archived");
    const toggle = () => folds.set(bucket.key, !remembered);
    const describe = heads[bucket.kind];
    const spec = describe ? describe(bucket, { open: remembered, toggle, parent }) : BARE;
    return spec ? [{ bucket, spec, open: spec.open ?? remembered, toggle }] : [];
  });
  const budgets = useRowBudgets(items.map((item) => (item.open ? item.bucket.chats.length : 0)));
  return items.map((item, i) => (
    <RowBudgetScope key={item.bucket.key} value={budgets[i]}>
      <BucketSection tree={props} {...item} />
    </RowBudgetScope>
  ));
}

function BucketSection<D extends TreeDraft>({ tree, bucket, spec, open, toggle }: { tree: BucketTreeProps<D>; bucket: ChatBucket<D>; spec: HeadSpec; open: boolean; toggle: () => void }) {
  const body = <BucketBody tree={tree} bucket={bucket} spec={spec} />;
  const content =
    spec.content !== undefined ? spec.content : spec.bare ? body : (
      <Collapse open={open} indent={spec.indent ?? true}>
        {body}
      </Collapse>
    );
  const head = spec.head && <FoldHead {...spec.head} open={open} onToggle={toggle} />;
  const wrap = spec.wrap === undefined ? spec.head?.look.wrap : spec.wrap;
  const section =
    wrap === null || wrap === undefined ? (
      <>
        {head}
        {content}
      </>
    ) : (
      <div className={wrap} {...spec.wrapProps}>
        {head}
        {content}
      </div>
    );
  return spec.frame ? spec.frame(section) : section;
}

/** 中身: 下書き → 行（中の段があれば、その木）→ まとまりのアーカイブ済み。pinnedApart なら固定したものを小見出しの下に分ける */
function BucketBody<D extends TreeDraft>({ tree, bucket, spec }: { tree: BucketTreeProps<D>; bucket: ChatBucket<D>; spec: HeadSpec }) {
  const archived = bucket.archived && <BucketTree {...tree} buckets={[bucket.archived]} parent={bucket} />;
  if (spec.pinnedApart !== undefined)
    return (
      <>
        <PinnedApart tree={tree} bucket={bucket} spec={spec} afterClass={spec.pinnedApart} />
        {archived}
      </>
    );
  return (
    <>
      {tree.renderDrafts?.(bucket.drafts)}
      <Rows tree={tree} bucket={bucket} spec={spec} chats={bucket.chats} sections={bucket.children} />
      {archived}
    </>
  );
}

/** 行の一覧か、中の段の木（行のないときは何も描かない） */
function Rows<D extends TreeDraft>({ tree, bucket, spec, chats, sections }: { tree: BucketTreeProps<D>; bucket: ChatBucket<D>; spec: HeadSpec; chats: readonly Chat[]; sections?: readonly ChatBucket<D>[] }) {
  if (sections) {
    const nested = <BucketTree {...tree} buckets={sections} parent={bucket} />;
    return spec.childrenClass ? <div className={spec.childrenClass}>{nested}</div> : nested;
  }
  if (chats.length === 0) return null;
  return <ChatRowList chats={chats} renderRow={(chat) => tree.renderRow(chat, bucket)} className={spec.rowsClass} />;
}

/**
 * 固定したチャットと下書きを「固定」の小見出し（heads.pinned に外のまとまりを添えて引く）の下にまとめ、残りをその後ろに並べる
 * （状態順でも、中の段の「固定」は重ねない）。最初に描く行の上限は、分けても元のまとまりで 1 つ
 */
function PinnedApart<D extends TreeDraft>({ tree, bucket, spec, afterClass }: { tree: BucketTreeProps<D>; bucket: ChatBucket<D>; spec: HeadSpec; afterClass: string }) {
  const pinnedChats = bucket.chats.filter((c) => c.pinned && !c.archived_at);
  const regularChats = bucket.chats.filter((c) => !c.pinned || c.archived_at);
  const pinnedDrafts = bucket.drafts.filter((d) => d.pinned);
  const regularDrafts = bucket.drafts.filter((d) => !d.pinned);
  const regularSections = bucket.children?.filter((b) => b.kind !== "pinned");
  const hasPinned = pinnedChats.length > 0 || pinnedDrafts.length > 0;
  const hasRegular = regularChats.length > 0 || regularDrafts.length > 0;
  const [pinnedBudget, regularBudget] = useRowBudgets([pinnedChats.length, regularChats.length]);
  const pinned: ChatBucket<D> = { ...bucket, key: `${bucket.key}/pinned`, kind: "pinned", chats: pinnedChats, drafts: pinnedDrafts, children: undefined, archived: undefined };
  const pinnedSpec = hasPinned ? (tree.heads.pinned?.(pinned, { open: true, toggle: () => {}, parent: bucket }) ?? BARE) : null;
  return (
    <>
      {pinnedSpec && (
        <RowBudgetScope value={pinnedBudget}>
          <BucketSection tree={tree} bucket={pinned} spec={pinnedSpec} open toggle={() => {}} />
        </RowBudgetScope>
      )}
      {hasRegular && (
        <div className={hasPinned ? afterClass : undefined}>
          {tree.renderDrafts?.(regularDrafts)}
          <RowBudgetScope value={regularBudget}>
            <Rows tree={tree} bucket={bucket} spec={spec} chats={regularChats} sections={regularSections} />
          </RowBudgetScope>
        </div>
      )}
    </>
  );
}
