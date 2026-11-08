import { Archive, ArrowDown, ArrowUp, Folder } from "lucide-react";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { Chat } from "@shared/types";
import type { ChatBucket } from "@/features/chatList/buckets";
import { bucketTone } from "@/features/chatList/StateChatsPopover";
import { NO_GROUP_LABEL } from "@/features/chat/chatTitle";
import { DRAFT_TONE } from "@/features/chat/tones";
import type { PanelDraft } from "@/features/panel/state/panelDrafts";
import { useFold } from "@/hooks/useFold";
import { splitArchived } from "@/ui/ArchivedFold";
import { Chevron } from "@/ui/Chevron";
import { ToneChip } from "@/ui/ToneChip";
import { CHAT_SORT_LABELS, nextChatSort, type ChatSort, type ChatSortKey } from "./chatSort";
import { DraftCards } from "./DraftCards";

interface Props {
  /**
   * 表の中のまとまり（列の分け方: 状態・グループ。まとまりごとに見出しの行を挟む）。headless なら見出しの行を挟まない
   * （列で分けない = 1 つのまとまり）
   */
  sections: readonly ChatBucket<PanelDraft>[];
  headless?: boolean;
  /** まとまりの中をもう一段（children。グループ×状態の状態）の小見出しの行で区切る */
  nested?: boolean;
  /** いちばん上の「下書き」の行に出す下書き */
  drafts: readonly PanelDraft[];
  showDraftProject?: boolean;
  /** 出す列（並びは CHAT_SORT_KEYS の順。名前はいつも出す） */
  columns: readonly ChatSortKey[];
  sort: ChatSort;
  onSort: (sort: ChatSort) => void;
  /** 行の描き方（useBoardCards の tableRow） */
  row: (chat: Chat) => ReactNode;
  /** いちばん下の「アーカイブ済み」の開閉を覚える場所とキー */
  foldPlace: string;
  archivedKey: string;
}

/**
 * ボードの表（チャット 1 つが 1 行）。見出しを押すとその列で並べ替え（もう一度押すと向きを逆に）、並び順はボード・リストにも効く。
 * 列の分け方（状態・グループ）は、表の中のまとまりの見出しの行になる（チャットのないまとまりは出さない）。下書きはいちばん上の行に並べ、アーカイブ済みはいちばん下の閉じたまとまりにまとめる
 */
export function ChatTable({ sections, headless = false, nested = false, drafts, showDraftProject, columns, sort, onSort, row, foldPlace, archivedKey }: Props) {
  // 表では、チャットのないまとまり（作業中 0 など）の見出しの行は出さない（行がなく見出しだけが並ぶと読みにくい）
  const parts = sections.map((s) => ({ section: s, split: splitArchived(s.chats) }));
  const shown = parts.filter((p) => headless || p.split[0].length > 0);
  const archived = parts.flatMap((p) => p.split[1]);
  const span = columns.length;
  const empty = drafts.length === 0 && parts.every((p) => p.split[0].length === 0) && archived.length === 0;
  return (
    <table className="chat-table">
      <thead>
        <tr>
          {columns.map((key) => (
            <SortHead key={key} column={key} sort={sort} onSort={onSort} />
          ))}
        </tr>
      </thead>
      <tbody>
        {drafts.length > 0 && (
          <>
            <SectionRow span={span}>
              <ToneChip tone={DRAFT_TONE} dot label="下書き" count={drafts.length} />
            </SectionRow>
            <tr className="chat-table-drafts">
              <td colSpan={span}>
                <div className="chat-table-draft-cards">
                  <DraftCards drafts={drafts} showProject={showDraftProject} />
                </div>
              </td>
            </tr>
          </>
        )}
        {shown.map(({ section, split: [active] }) =>
          headless ? (
            active.map(row)
          ) : (
            <SectionBody key={section.key} section={section} active={active} span={span} row={row} nested={nested} />
          ),
        )}
        {empty && (
          <tr className="chat-table-empty">
            <td colSpan={span}>チャットはありません</td>
          </tr>
        )}
      </tbody>
      {archived.length > 0 && <ArchivedRows chats={archived} span={span} row={row} foldPlace={foldPlace} foldKey={archivedKey} />}
    </table>
  );
}

/** 見出しのセル（押すとその列で並べ替える。並べている列には向きの矢印） */
function SortHead({ column, sort, onSort }: { column: ChatSortKey; sort: ChatSort; onSort: (sort: ChatSort) => void }) {
  const on = sort.key === column;
  const Arrow = sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`chat-table-head cell-${column}`} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className={on ? "is-sorted" : undefined} onClick={() => onSort(nextChatSort(sort, column))} title={`${CHAT_SORT_LABELS[column]}で並べ替える`}>
        {CHAT_SORT_LABELS[column]}
        {on && <Arrow size={12} aria-hidden />}
      </button>
    </th>
  );
}

function SectionRow({ span, sub = false, children }: { span: number; sub?: boolean; children: ReactNode }) {
  return (
    <tr className={sub ? "chat-table-section chat-table-subsection" : "chat-table-section"}>
      <th colSpan={span} scope="colgroup">
        {children}
      </th>
    </tr>
  );
}

/**
 * まとまり 1 つ（見出しの行 ＋ 行。件数はアーカイブしていないものだけ）。nested なら、中をもう一段のまとまり（children）の小見出しの行で区切る
 * （チャットのない小分けは出さない）
 */
function SectionBody({
  section,
  active,
  span,
  row,
  nested,
}: {
  section: ChatBucket<PanelDraft>;
  active: Chat[];
  span: number;
  row: (chat: Chat) => ReactNode;
  nested: boolean;
}) {
  return (
    <>
      <SectionRow span={span}>
        <BucketChip bucket={section} count={active.length} />
      </SectionRow>
      {nested && section.children
        ? section.children.map((part) => {
            const [rows] = splitArchived(part.chats);
            return (
              rows.length > 0 && (
                <Fragment key={part.key}>
                  <SectionRow span={span} sub>
                    <BucketChip bucket={part} count={rows.length} />
                  </SectionRow>
                  {rows.map(row)}
                </Fragment>
              )
            );
          })
        : active.map(row)}
    </>
  );
}

/** まとまりの札（状態は列の色、グループはグループの色、No Group は灰） */
function BucketChip({ bucket, count }: { bucket: ChatBucket<PanelDraft>; count: number }) {
  if (bucket.group) {
    return (
      <ToneChip
        className="group-hued"
        style={{ "--group-hue": bucket.group.hue } as CSSProperties}
        icon={<Folder size={13} aria-hidden />}
        label={bucket.group.name}
        count={count}
      />
    );
  }
  if (bucket.kind === "ungrouped") return <ToneChip label={NO_GROUP_LABEL} count={count} />;
  return <ToneChip tone={bucketTone(bucket)} dot={Boolean(bucket.column)} label={bucket.label} count={count} />;
}

/** いちばん下の「アーカイブ済み n」（初めは閉じていて、見出しの行を押すと開く） */
function ArchivedRows({ chats, span, row, foldPlace, foldKey }: { chats: Chat[]; span: number; row: (chat: Chat) => ReactNode; foldPlace: string; foldKey: string }) {
  const fold = useFold(foldPlace, foldKey, { defaultOpen: false });
  return (
    <tbody className="chat-table-archived">
      <tr className="chat-table-section">
        <th colSpan={span} scope="colgroup">
          <button type="button" className="chat-table-fold" aria-expanded={fold.open} onClick={fold.toggle}>
            <Chevron open={fold.open} />
            <Archive size={12} aria-hidden />
            アーカイブ済み
            <span className="muted">{chats.length}</span>
          </button>
        </th>
      </tr>
      {fold.open && chats.map(row)}
    </tbody>
  );
}
