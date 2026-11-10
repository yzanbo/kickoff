import { Pin, type LucideIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode, type RefObject } from "react";
import { cx } from "@/lib/cx";
import { isRenameKey } from "@/lib/keys";
import { CloseButton } from "@/ui/IconButton";
import { InlineName } from "@/ui/InlineName";
import { projectHueStyle } from "@/features/project/projectColor";
import type { TabGroupBadge } from "./tabKinds";

/**
 * パネルのタブ 1 つ（右のパネル・下のパネルで共通）。タブのどこを押しても表示し（名前のボタンの押せる範囲を CSS でタブ全体に広げる）、× で閉じる。
 * onRename があれば名前のダブルクリック・ピントがあるときの Enter で名前を変え始め、editor がある間は名前の代わりに入力欄を出す（チャットのタブ）。
 * pinnedIn があればいちばん左にピンを出す（ピン留めしたチャット。サイドバーの「固定」と同じく、まっすぐのピンをそのプロジェクトの色で塗る）。extra は右のパネルで足す属性（ドラッグ・右クリックのメニュー）、className はドラッグで落とす位置の印など。
 * twoLine なら、グループ・作業場所の札を名前の下の行に置く（「表示」のメニューの「タブに出す項目」の「2 行で表示」）。
 * 作業場所の札（tag）は、入る幅があるときだけ「本体 | main」「WT | ブランチ」、入らなければ「本体」・ブランチ名だけ（省く）にする（useBranchShort。
 * 2 行のタブは札の行、1 行のタブは名前ごと見るので、名前を省くことになるならブランチ名を隠す）
 */
export function PanelTab({
  active,
  icon: Icon,
  iconClass,
  badge,
  label,
  group,
  tag,
  tagKey,
  twoLine = false,
  title,
  className,
  extra,
  onSelect,
  onClose,
  closeLabel,
  onRename,
  editor,
  lead,
  pinnedIn = null,
}: {
  active: boolean;
  icon: LucideIcon;
  iconClass?: string;
  /** 名前の前に置く種類の札（メモ・サブ・子）。タブの枠もその種類の色にする（kind で色を分ける。CSS の .tab-kind-<kind>） */
  badge?: { text: ReactNode; kind: string };
  label: string;
  /** チャットのグループ（名前の後ろに、グループの色の札で添える。グループなしなら出さない） */
  group?: TabGroupBadge;
  /** グループの札の後ろに添えるもの（作業場所の札 TabWorkplaceBadge） */
  tag?: ReactNode;
  /** tag の中身が変わったら測り直すためのキー（作業場所とブランチ） */
  tagKey?: string;
  /** 2 行にする（名前の下の行にグループ・作業場所の札） */
  twoLine?: boolean;
  /** 名前にマウスを乗せたときの説明（なければ名前） */
  title?: string;
  className?: string;
  extra?: HTMLAttributes<HTMLDivElement>;
  onSelect: () => void;
  onClose: () => void;
  /** 閉じるボタンの名前（なければ「〜 のタブを閉じる」。分けたペインのチャットは「一覧のペインに戻す」） */
  closeLabel?: string;
  /** アイコンの代わりに名前の前に置くもの（チャットのタブの状態の印） */
  lead?: ReactNode;
  /** ピン留めしたチャットのタブなら、そのチャットのプロジェクトの ID（いちばん左にピンをその色で出す）。ピン留めでなければ null */
  pinnedIn?: number | null;
  /** 名前のダブルクリックで名前を変え始める */
  onRename?: () => void;
  /** 名前を変えている途中なら、入力欄の初めの値・上限・決定・取り消し */
  editor?: { initial: string; maxLength: number; onSubmit: (name: string) => void; onCancel: () => void };
}) {
  const pin = pinnedIn !== null && <Pin size={12} className="panel-tab-pin" style={projectHueStyle(pinnedIn)} aria-label="ピン留め" />;
  const groupBadge = group && (
    <span className="panel-tab-group-name" style={group.hue === null ? undefined : ({ "--group-hue": group.hue } as CSSProperties)}>
      {group.name}
    </span>
  );
  const lines = twoLine && Boolean(groupBadge || tag);
  // 作業場所の札のブランチ名が入るか（2 行なら札の行、1 行なら名前のボタンの中で見る）
  const measureRef = useRef<HTMLElement>(null);
  const placeShort = useBranchShort(measureRef, `${label}|${group?.name ?? ""}|${tagKey ?? ""}|${lines}`, Boolean(tag));
  const measure = tag ? measureRef : undefined;
  return (
    <div
      className={cx("panel-tab", active && "active", twoLine && "two-line", placeShort && "place-short", badge && `panel-tab-typed tab-kind-${badge.kind}`, className)}
      role="tab"
      aria-selected={active}
      {...extra}
    >
      {editor ? (
        <span className="panel-tab-label editing">
          {pin}
          {lead ?? <Icon size={12} className={iconClass} aria-hidden />}
          <InlineName initial={editor.initial} maxLength={editor.maxLength} className="panel-tab-input" onSubmit={editor.onSubmit} onCancel={editor.onCancel} />
        </span>
      ) : (
        <button
          ref={lines ? undefined : (measure as RefObject<HTMLButtonElement | null> | undefined)}
          className="panel-tab-label"
          onClick={onSelect}
          onDoubleClick={onRename}
          // タブにピントがあるときの Enter は名前の変更（名前を変えられるタブだけ。開くのは押す・Space）
          onKeyDown={
            onRename
              ? (e) => {
                  if (!isRenameKey(e)) return;
                  e.preventDefault();
                  onRename();
                }
              : undefined
          }
          title={onRename ? `${title ?? label}（ダブルクリック・Enter で名前を変更）` : (title ?? label)}
        >
          {pin}
          {lead ?? <Icon size={12} className={iconClass} aria-hidden />}
          {lines ? (
            // 2 行: 上に種類の札と名前、下にグループ・作業場所の札
            <span className="panel-tab-lines">
              <span className="panel-tab-line">
                {badge && <span className="panel-tab-kind">{badge.text}</span>}
                <span>{label}</span>
              </span>
              <span ref={measure} className="panel-tab-line panel-tab-tags">
                {groupBadge}
                {tag}
              </span>
            </span>
          ) : (
            <>
              {badge && <span className="panel-tab-kind">{badge.text}</span>}
              <span>{label}</span>
              {groupBadge}
              {tag}
            </>
          )}
        </button>
      )}
      {/* 名前を変えている間は、入力欄の ✓ / ✕ と並ばないよう閉じるを隠す */}
      {!editor && (
        <CloseButton label={closeLabel ?? `${label} のタブを閉じる`} size={12} className="panel-tab-close" onClick={onClose} />
      )}
    </div>
  );
}

/**
 * 作業場所の札のブランチ名を隠すか（PanelTab）。入れ物の中の文字が省かれていれば隠し、そのときに足りなかった幅を覚えて、
 * 入れ物がその幅まで広がったら戻す（隠したままでは、戻して入るかを測れないため。useOverflowCompact と同じ考え方。
 * 名前のボタンは flex: 1 なので max-content の幅を測れず、省かれた幅で見る）。key が変わったら出して測り直す
 */
function useBranchShort(ref: RefObject<HTMLElement | null>, key: string, enabled: boolean): boolean {
  const [short, setShort] = useState(false);
  const needed = useRef(0);
  useLayoutEffect(() => {
    needed.current = 0;
    setShort(false);
  }, [key]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const check = () => {
      // 隠れている間（幅 0）は測らない
      if (el.clientWidth === 0) return;
      if (!short) {
        const lack = clippedWidth(el);
        if (lack > 0) {
          needed.current = el.clientWidth + lack;
          setShort(true);
        }
      } else if (el.clientWidth >= needed.current) {
        setShort(false);
      }
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [short, key, enabled]);
  return short;
}

/** 要素とその中の文字（span）のうち、いちばん省かれている幅（px。省かれていなければ 0） */
function clippedWidth(el: HTMLElement): number {
  return Math.max(0, ...[el, ...el.querySelectorAll<HTMLElement>("span")].map((e) => e.scrollWidth - e.clientWidth));
}
