import { Archive, ArchiveRestore, type LucideIcon, Trash2 } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { ArchivedFold } from "@/foundation/ui/kit/ArchivedFold";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import type { usePopover } from "@/foundation/ui/kit/Popover";
import { StatusSlot } from "@/features/chat/ui/state/StatusSlot";
import type { SummaryState } from "@/features/chat/ui/state/chatState";
import { ChipWord, ComposerChip } from "./ChatPill";
import { DefaultOpenPlace, OpenPlaceButtons, type OpenPlace } from "./OpenPlaceControls";

/** 一覧の 1 行（サブエージェント・子チャットで同じ形） */
export interface AgentListRow {
  key: string;
  /** 読み上げ・ボタンの名前に使う名前 */
  name: string;
  /** 左の印（サブエージェントは Claude の印、子チャットは子チャットの印） */
  icon: ReactNode;
  /** 左の印を回す（作業中のサブエージェント） */
  spinning?: boolean;
  /** 名前の行（名前の前の点・状態の印を含む） */
  title: ReactNode;
  /** 2 行目（種類・モデル・様子など） */
  meta: ReactNode;
  /** 2 行目の下に足すもの（サブエージェントの再開などの操作。アーカイブ済みの行には出さない） */
  below?: ReactNode;
  /** 乗せたときの説明 */
  tip?: string;
  /** 入れ子の深さ（字下げ。0 = いちばん外側） */
  depth?: number;
  /** 色相（CSS の --hue） */
  hue?: number;
  /** 行に足す class */
  className?: string;
  archived: boolean;
  /** アーカイブのボタンを出すか（作業中は出さない） */
  canArchive: boolean;
  /** 削除のボタン（子チャットだけ。作業中は渡さない） */
  onDelete?: () => void;
}

/** 開いたときの一覧の中身（行は木の順・アーカイブ済みは新しい順。finished は「完了したものをアーカイブ」の対象） */
interface AgentListContent {
  rows: readonly AgentListRow[];
  archived: readonly AgentListRow[];
  finished: readonly string[];
}

/**
 * 入力欄の上のピル（「サブエージェント 3 件 · 1 件作業中」「子チャット 2 件」）と、押すと上に開く一覧（サブエージェントと子チャットで同じ形）。
 * 一覧の上に行を押したときの開き方の切り替えと「完了した…をアーカイブ」、いちばん下に閉じたまとまり「アーカイブ済み n」。
 * アーカイブ・戻す・削除は呼ぶ側が確かめてから（確かめのダイアログを押しても一覧は閉じない）。行は開いているときだけ作る（list）
 */
export function AgentListChip<P extends OpenPlace>({
  noun,
  icon: Icon,
  popover,
  shown,
  archivedCount,
  mark,
  details,
  list,
  places,
  openIn,
  onOpenIn,
  onOpen,
  onArchive,
  onRestore,
  foldKey,
  flashing = false,
}: {
  /** 何の一覧か（「サブエージェント」「子チャット」） */
  noun: string;
  /** 狭い所でアイコンと数だけにするときの印 */
  icon: LucideIcon;
  popover: ReturnType<typeof usePopover<HTMLButtonElement>>;
  /** アーカイブしていない数（0 ならピルはアーカイブ済みの数を出す） */
  shown: number;
  archivedCount: number;
  /** ピルの左の印（アーカイブしていないものの状態をまとめたもの） */
  mark: SummaryState;
  /** ピルの数の後ろの内訳（「 · 1 件作業中」など） */
  details: ReactNode;
  list: () => AgentListContent;
  places: readonly P[];
  openIn: P;
  onOpenIn: (place: P) => void;
  /** 行を押した（place がなければ設定の開き方）。一覧は閉じてから呼ぶ */
  onOpen: (key: string, place?: P) => void;
  onArchive: (keys: string[]) => void;
  onRestore: (key: string) => void;
  foldKey: string;
  /** 少しの間ピルを光らせる（新しい子チャットができたとき） */
  flashing?: boolean;
}) {
  const open = (key: string, place?: P) => {
    popover.close();
    onOpen(key, place);
  };
  const renderRow = (row: AgentListRow) => (
    <AgentListRowView key={row.key} row={row} places={places} onOpen={(place) => open(row.key, place)} onArchive={() => onArchive([row.key])} onRestore={() => onRestore(row.key)} />
  );
  return (
    <ComposerChip
      popover={popover}
      chip={
        <>
          {/* 左の印: 回答待ち > 作業中（ほかに未読があれば緑の点を重ねる）> 失敗 > 未読 > 既読（すべてアーカイブ済みなら出さない） */}
          {shown > 0 && <StatusSlot {...mark} />}
          <Icon size={14} className="chip-icon chip-short-icon" aria-hidden />
          <span>
            <ChipWord>{shown > 0 ? `${noun} ` : `アーカイブ済みの${noun} `}</ChipWord>
            {shown > 0 ? shown : archivedCount}
            <ChipWord> 件</ChipWord>
          </span>
          {details}
        </>
      }
      label={noun}
      chipClassName={flashing ? "child-chats-new" : undefined}
      // アーカイブ・戻す・削除の確かめのダイアログを押しても、一覧は閉じない
      ignore="dialog"
    >
      {() => {
        const { rows, archived, finished } = list();
        return (
          <>
            {places.length > 1 && <DefaultOpenPlace places={places} value={places.includes(openIn) ? openIn : places[0]} onChange={onOpenIn} />}
            <button type="button" className="agent-list-archive-all" disabled={finished.length === 0} onClick={() => onArchive([...finished])}>
              <Archive size={15} aria-hidden />
              {`完了した${noun}をアーカイブ`}
              {finished.length > 0 && <span className="muted">（{finished.length} 件）</span>}
            </button>
            {rows.length === 0 && <p className="muted small agent-list-empty">{`表示中の${noun}はありません`}</p>}
            {rows.map(renderRow)}
            <ArchivedFold place="composer" foldKey={foldKey} count={archived.length} className="composer-archived">
              {archived.map(renderRow)}
            </ArchivedFold>
          </>
        );
      }}
    </ComposerChip>
  );
}

/**
 * 一覧の行。押すと設定の開き方で開き、右のボタンでその場所に開く・アーカイブ・戻す・削除。中にボタンがあるので <button> にせず role="button" にし、
 * 行そのものにピントがあるときだけ Enter・Space で開く
 */
export function AgentListRowView<P extends OpenPlace>({
  row,
  places,
  onOpen,
  onArchive,
  onRestore,
}: {
  row: AgentListRow;
  places: readonly P[];
  onOpen: (place?: P) => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const style = { ...(row.depth ? { "--depth": Math.min(row.depth, 4) } : {}), ...(row.hue !== undefined ? { "--hue": `${row.hue}` } : {}) } as CSSProperties;
  return (
    <div
      role="button"
      tabIndex={0}
      className={cx("agent-list-row tree-indent", row.className, row.archived && "archived")}
      style={style}
      title={row.tip}
      onClick={() => onOpen()}
      onKeyDown={(e) => {
        // 行そのものにピントがあるときだけ（中のボタンの Enter・Space はそのボタンのもの）。Space で下へ流れないようにする
        if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        onOpen();
      }}
    >
      <span className={cx("agent-icon", row.spinning && "spinning")}>{row.icon}</span>
      <span className="agent-list-text">
        <span className="agent-list-title">{row.title}</span>
        <span className="agent-list-meta">{row.meta}</span>
        {!row.archived && row.below}
      </span>
      <OpenPlaceButtons places={places} onOpen={(place) => onOpen(place)} />
      {row.archived ? (
        <IconButton
          icon={ArchiveRestore}
          label={`${row.name} を一覧に戻す`}
          title="一覧に戻す"
          className="agent-list-row-action"
          type="button"
          onClick={(e) => (e.stopPropagation(), onRestore())}
        />
      ) : (
        row.canArchive && (
          <IconButton icon={Archive} label={`${row.name} をアーカイブ`} title="アーカイブ" className="agent-list-row-action" type="button" onClick={(e) => (e.stopPropagation(), onArchive())} />
        )
      )}
      {row.onDelete && (
        <IconButton
          icon={Trash2}
          label={`${row.name} を削除`}
          title="削除（会話の記録も消えます）"
          className="agent-list-row-action"
          type="button"
          onClick={(e) => (e.stopPropagation(), row.onDelete?.())}
        />
      )}
    </div>
  );
}
