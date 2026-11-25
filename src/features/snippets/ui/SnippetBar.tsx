import "./SnippetBar.css";
import { Plus, Settings } from "lucide-react";
import { useState, type MouseEvent } from "react";
import type { Snippet } from "@shared/snippets/types";
import { snippetLabel } from "@shared/snippets/snippets";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { storage } from "./storage";
import { cx } from "@/foundation/ui/lib/cx";
import { useProjectSnippets } from "@/features/snippets/ui/store";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { SendCancelled, useComposerInsert, type ComposerBandProps } from "@/features/composer/ui";
import { confirmDeleteSnippet } from "./snippetActions";
import { SnippetDialog } from "./SnippetDialog";
import type { SnippetEditing } from "./SnippetManager";
import { useHorizontalScroller } from "./useHorizontalScroller";
import { hasAppModifier } from "@/foundation/ui/lib/keys";
import { truncate } from "@shared/foundation/text/truncate";

/** ピルに乗せたときに見せる本文の長さの上限 */
const TIP_MAX = 400;

/**
 * 入力欄の上の定型文の帯。このプロジェクトで使う定型文（すべてのプロジェクトのものと、このプロジェクトだけのもの。共通のチャットでは共通だけのもの）を横に並べ、入りきらなければ横にスクロールする
 * （縦のホイールでも動く。端の先に続きがあれば薄くぼかす）。ピルを押すと入力欄のキャレットの位置に入れ（書いている文は残す）、
 * ⌘クリック・右クリックの「すぐ送る」で、そのまま送る（作業中は送信待ちの送り方に従う。送る処理は呼ぶ側）。
 * 右に「定型文を管理」の歯車。設定の「表示」・帯の右クリックで隠せる
 */
export function SnippetBar({
  projectId,
  onSend,
}: {
  projectId: number;
  /** すぐ送る（省けば、すぐ送るも入力欄に入れるだけ。預かった指示の書き直し） */
  onSend?: (text: string) => Promise<void>;
}) {
  const snippets = useProjectSnippets(projectId);
  // 入力欄のキャレットの位置に入れる口（入力欄の枠の中に置いたときだけある）
  const insertText = useComposerInsert();
  const [hidden, setHidden] = useSetting(storage.settings.barHidden);
  const { ref: scrollerRef, ...scroller } = useHorizontalScroller(snippets);
  const menu = useContextMenu<Snippet | null>();
  // 管理のダイアログ（開いていなければ false。開いた直後に編集する行・新しく作るなら "new"）
  const [managing, setManaging] = useState<SnippetEditing | false>(false);
  if (hidden) return null;

  const insert = (s: Snippet) => insertText?.(s.text);
  // 送る前の確かめでやめた（SendCancelled）なら、失敗の文を出さない
  const send = (s: Snippet) =>
    void (onSend ? onSend(s.text) : Promise.resolve(insert(s))).catch((e: unknown) => {
      if (!(e instanceof SendCancelled)) void reportFailure("定型文を送れませんでした")(e);
    });
  const onChipClick = (e: MouseEvent, s: Snippet) => (hasAppModifier(e) ? send(s) : insert(s));

  return (
    <>
      <div className="snippet-bar" role="toolbar" aria-label="定型文" onContextMenu={(e) => menu.open(e, null)}>
        <div
          ref={scrollerRef}
          className={cx("snippet-bar-scroll", scroller.edges.start && "fade-start", scroller.edges.end && "fade-end")}
          onScroll={scroller.onScroll}
        >
          {snippets.map((s) => (
            <button
              key={s.id}
              type="button"
              className="snippet-chip pill"
              data-tip={truncate(s.text, TIP_MAX)}
              data-tip-title={`${snippetLabel(s)}（押すと入力欄に入れる・⌘クリックで送る）`}
              onClick={(e) => onChipClick(e, s)}
              onContextMenu={(e) => {
                e.stopPropagation();
                menu.open(e, s);
              }}
            >
              <span className="snippet-chip-label">{snippetLabel(s)}</span>
            </button>
          ))}
          {snippets.length === 0 && (
            <button type="button" className="snippet-chip pill snippet-chip-add" onClick={() => setManaging("new")}>
              <Plus size={12} aria-hidden />
              定型文を追加
            </button>
          )}
        </div>
        <div className="snippet-bar-tools">
          <IconButton
            icon={Settings}
            iconSize={14}
            label="定型文を管理"
            title="定型文を管理（足す・直す・並べ替える）"
            className="snippet-bar-tool"
            onClick={() => setManaging(null)}
          />
        </div>
      </div>
      {/* メニュー・ダイアログは帯の外に置く（中の右クリック・クリックが帯に伝わらないように） */}
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="定型文" onClose={menu.close}>
          {menu.menu.value && <SnippetMenuItems snippet={menu.menu.value} onInsert={insert} onSend={send} onEdit={(s) => setManaging(s.id)} />}
          <MenuItem onSelect={() => setManaging("new")}>定型文を追加</MenuItem>
          <MenuItem onSelect={() => setManaging(null)}>定型文を管理…</MenuItem>
          <div className="menu-separator" role="separator" />
          <MenuItem title="設定の「表示」・タブの列の「表示」で戻せます" onSelect={() => setHidden(true)}>
            定型文の帯を隠す
          </MenuItem>
        </PopupMenu>
      )}
      {managing !== false && <SnippetDialog projectId={projectId} initialEditing={managing} onClose={() => setManaging(false)} />}
    </>
  );
}

/**
 * 入力欄の右クリックの「定型文の帯を表示 / 隠す」（帯を隠していても、入力欄から戻せるように。帯の右クリック・タブの列の「表示」と同じ設定）
 */
export function SnippetBarToggleItem() {
  const [hidden, setHidden] = useSetting(storage.settings.barHidden);
  return (
    <MenuItem title="どのチャットでも同じです（設定の「表示」・タブの列の「表示」でも切り替えられます）" onSelect={() => setHidden(!hidden)}>
      {hidden ? "定型文の帯を表示" : "定型文の帯を隠す"}
    </MenuItem>
  );
}

/** ピルの右クリックの、その定型文の操作 */
function SnippetMenuItems({
  snippet,
  onInsert,
  onSend,
  onEdit,
}: {
  snippet: Snippet;
  onInsert: (s: Snippet) => void;
  onSend: (s: Snippet) => void;
  onEdit: (s: Snippet) => void;
}) {
  return (
    <>
      <MenuItem onSelect={() => onInsert(snippet)}>入力欄に入れる</MenuItem>
      <MenuItem title="入力欄の文はそのままにして、この定型文だけを送ります（作業中は送信待ちの送り方に従います）" onSelect={() => onSend(snippet)}>
        すぐ送る
      </MenuItem>
      <div className="menu-separator" role="separator" />
      <MenuItem onSelect={() => onEdit(snippet)}>編集…</MenuItem>
      <MenuItem danger onSelect={() => void confirmDeleteSnippet(snippet).catch(reportFailure("削除できませんでした"))}>
        削除
      </MenuItem>
      <div className="menu-separator" role="separator" />
    </>
  );
}

/** 入力欄の差し込み（composerSlots の band）: このプロジェクトの定型文の帯 */
export function SnippetBand({ place, send }: ComposerBandProps) {
  return <SnippetBar projectId={place.projectId} onSend={send} />;
}
