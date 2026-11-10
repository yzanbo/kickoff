import { ChevronDown, SendHorizontal, Square, type LucideIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { IconButton } from "@/ui/IconButton";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import type { QueueSendMode } from "./composerKeys";

/** 送信ボタンの右クリックで選べる、ほかの送り方・送り先（質問として送る・子チャットに送るなど） */
export interface SendTarget {
  label: string;
  /** 名前の下に小さく添える、何が起きるかの一言 */
  hint?: string;
  icon?: LucideIcon;
  /** 組の見出し（同じ見出しの項目を続けて並べ、組の前に区切り線と見出しを置く。「新規の子チャットに送る」など） */
  group?: string;
  title?: string;
  disabled?: boolean;
  onSelect: () => void;
}

/**
 * チャット欄の右下の操作: 送信ボタンの左に置くもの（コンテキストのメーターなど）・送り方の切り替え（作業中・送信待ちがあるとき。
 * 送信ボタンのすぐ左に音声の道具（マイク・▾・音声モードの波形。利用者の依頼で、話して送る流れが手元で済むよう送信の隣に置いた）。
 * ⌘ / ⌘⇧ を押している間は、Enter で使われる方を光らせる）・中断（作業中。Esc を 1 回押したら「もう一度 Esc で中断」、
 * 止めている間は「停止中…」で押せない）・送信（作業中も、書いていれば・録音中なら出す。録音中は文字起こしして送る）。
 * ほかの送り方・送り先を選べるとき（sendTargets。質問として送る・子チャットに送るなど）は、送信ボタンの右クリックでそれらを選ぶメニューを開く
 * （ふだんの送り方（「あとで送る」など）は送信ボタンそのものなので、メニューには並べない）。
 * 同じメニューは丸いボタンの右の ▾ でも開く（右クリックに気づかなくても選べるように。作業中で中断のボタンだけのときも出す）。
 * plain のとき（会話の圧縮中）は、作業中でもふだんの見た目（送信ボタンの左のもの・送信・▾）にし、中断のボタンを出さない
 * （圧縮の間は返答もツールも動かない。Esc を 2 回押す中断は効く）。送り方の切り替え（いま = 圧縮のあとのやり取りが終わってから送る /
 * あとで = 送信待ち）は出す
 */
export function ComposerActions({
  busy,
  stopping,
  stopArmed,
  onStop,
  queueing,
  heldMode,
  busyControls,
  trailing,
  voice,
  canSend,
  recording,
  hasContent,
  sendLabel,
  onSubmit,
  sendTargets,
  plain,
}: {
  busy?: boolean;
  stopping?: boolean;
  /** Esc を 1 回押して、もう一度で中断する待ち */
  stopArmed: boolean;
  onStop?: () => void;
  /** 送ると待ちの列に入れる・送り方を選ぶ（作業中・送信待ちがあるとき） */
  queueing: boolean;
  /** ⌘ / ⌘⇧ を押している間の、Enter で使われる送り方 */
  heldMode?: QueueSendMode;
  busyControls?: ReactNode;
  trailing?: ReactNode;
  /** 送信ボタンのすぐ左に置く音声の道具（マイク・▾・音声モードの波形） */
  voice?: ReactNode;
  canSend: boolean;
  recording: boolean;
  hasContent: boolean;
  sendLabel?: string;
  onSubmit: () => void;
  sendTargets?: SendTarget[];
  /** 作業中でも、ふだんの見た目にする（会話の圧縮中） */
  plain?: boolean;
}) {
  // ▾ で開くときはボタンの上・右端そろえ（右クリックはその位置）
  const menu = useContextMenu({ side: "above", align: "end" });
  const hasTargets = Boolean(sendTargets?.length);
  return (
    <div className="composer-actions">
      {trailing}
      {queueing && busyControls && <span className={cx("busy-controls", heldMode && `held-${heldMode}`)}>{busyControls}</span>}
      {/* 作業中は中断。書いていれば（録音中も）、その横に待ちの列に入れるボタン */}
      {busy && onStop && !stopping && stopArmed && <span className="composer-stop-hint">もう一度 Esc で中断</span>}
      {busy && onStop && stopping && <span className="composer-stop-hint stopping">停止中…</span>}
      {voice && <span className="composer-voice">{voice}</span>}
      {/* 丸いボタン（中断・送信）と ▾ は詰めて 1 組に並べる */}
      <span className="send-group">
        {busy && onStop && !plain && (
          <button
            className={cx("send-button stop", stopping && "stopping")}
            title={stopping ? "停止中…（サブエージェント・裏のコマンドが終わるのを待っています）" : "中断（チャット欄で Esc を 2 回）"}
            aria-label={stopping ? "停止中" : "中断"}
            aria-busy={stopping || undefined}
            disabled={stopping}
            onClick={onStop}
          >
            {stopping ? <span className="spinner" aria-hidden /> : <Square size={12} fill="currentColor" />}
          </button>
        )}
        {(plain || !busy || !onStop || (queueing && (hasContent || recording))) && (
          <button
            className="send-button"
            title={
              recording
                ? "録音を止めて、文字起こしした文を入れてそのまま送る（Enter）"
                : `${
                    sendLabel
                      ? `${sendLabel}（Enter）`
                      : queueing
                        ? "待ちの列に入れる（Enter）。いまの作業が終わったら送ります"
                        : "送信（Enter）"
                  }${hasTargets ? "。右クリック・右の ▾ で送り方を選ぶ（質問として送るなど）" : ""}`
            }
            aria-label={recording ? "文字起こしして送信" : (sendLabel ?? (queueing ? "待ちの列に入れる" : "送信"))}
            disabled={!canSend}
            onClick={onSubmit}
            onContextMenu={hasTargets ? (e) => menu.open(e) : undefined}
          >
            <SendHorizontal size={17} strokeWidth={2.5} />
          </button>
        )}
        {hasTargets && (
          <IconButton
            icon={ChevronDown}
            label="送り方を選ぶ"
            title="送り方を選ぶ（質問として送る・新規の子チャットに送るなど。送信ボタンの右クリックと同じ）"
            className="send-more"
            aria-haspopup="menu"
            aria-expanded={menu.isOpen}
            onClick={(e) => menu.toggle(e)}
          />
        )}
      </span>
      {menu.menu && sendTargets && (
        <PopupMenu at={menu.menu.at} label="送り方" ignore=".send-more" onClose={menu.close}>
          {sendTargets.map((target, i) => {
            const prev = sendTargets[i - 1];
            const startsGroup = target.group !== undefined && target.group !== prev?.group;
            const Icon = target.icon;
            return (
              <Fragment key={`${target.group ?? ""}/${target.label}`}>
                {/* 組の前後に区切り線、組の初めに見出し（同じ言葉を項目ごとにくり返さない） */}
                {i > 0 && (startsGroup || (prev?.group !== undefined && target.group !== prev.group)) && <div className="menu-separator" role="separator" />}
                {startsGroup && <div className="menu-label">{target.group}</div>}
                <MenuItem className="send-target" title={target.title} disabled={target.disabled} onSelect={target.onSelect}>
                  {Icon && <Icon size={15} aria-hidden className="send-target-icon" />}
                  <span className="send-target-text">
                    <span>{target.label}</span>
                    {target.hint && <span className="send-target-hint">{target.hint}</span>}
                  </span>
                </MenuItem>
              </Fragment>
            );
          })}
        </PopupMenu>
      )}
    </div>
  );
}
