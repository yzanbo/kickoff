import { List, Plus, Settings2 } from "lucide-react";
import { useState, type MouseEvent, type MutableRefObject } from "react";
import type { Snippet } from "@shared/types";
import { snippetLabel } from "@shared/snippet/snippets";
import { useSetting } from "@/hooks/useSetting";
import { SNIPPET_BAR_HIDDEN } from "@/lib/storageKeys";
import { cx } from "@/lib/cx";
import { useProjectSnippets } from "@/stores/snippets";
import { reportFailure } from "@/ui/dialogs";
import { IconButton } from "@/ui/IconButton";
import { usePopover } from "@/ui/Popover";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import type { ComposerHandle } from "@/features/chat/composer/composerHandle";
import { SendCancelled } from "@/features/chat/composer/useComposerSend";
import { confirmDeleteSnippet } from "./snippetActions";
import { SnippetDialog } from "./SnippetDialog";
import type { SnippetEditing } from "./SnippetManager";
import { SnippetPicker } from "./SnippetPicker";
import { useHorizontalScroller } from "./useHorizontalScroller";

/** ピルに乗せたときに見せる本文の長さの上限 */
const TIP_MAX = 400;

const tipOf = (text: string) => (text.length > TIP_MAX ? `${text.slice(0, TIP_MAX)}…` : text);

/**
 * 入力欄の上の定型文の帯。このプロジェクトで使う定型文（共通とこのプロジェクトだけのもの）を横に並べ、入りきらなければ横にスクロールする
 * （縦のホイールでも動く。端の先に続きがあれば薄くぼかす）。ピルを押すと入力欄のキャレットの位置に入れ（書いている文は残す）、
 * ⌘クリック・右クリックの「すぐ送る」で、そのまま送る（作業中は送信待ちの送り方に従う。送る処理は呼ぶ側）。
 * 右に「一覧」（すべてを縦に並べて絞り込む）と「定型文を管理」。設定の「表示」・帯の右クリックで隠せる
 */
export function SnippetBar({
  projectId,
  composer,
  onSend,
}: {
  projectId: number;
  composer: MutableRefObject<ComposerHandle | null>;
  onSend: (text: string) => Promise<void>;
}) {
  const snippets = useProjectSnippets(projectId);
  const [hidden, setHidden] = useSetting(SNIPPET_BAR_HIDDEN);
  const scroller = useHorizontalScroller(snippets);
  const picker = usePopover();
  const menu = useContextMenu<Snippet | null>();
  // 管理のダイアログ（開いていなければ false。開いた直後に編集する行・新しく作るなら "new"）
  const [managing, setManaging] = useState<SnippetEditing | false>(false);
  if (hidden) return null;

  const insert = (s: Snippet) => composer.current?.insert(s.text);
  // 送る前の確かめでやめた（SendCancelled）なら、失敗の文を出さない
  const send = (s: Snippet) =>
    void onSend(s.text).catch((e: unknown) => {
      if (!(e instanceof SendCancelled)) void reportFailure("定型文を送れませんでした")(e);
    });
  const onChipClick = (e: MouseEvent, s: Snippet) => (e.metaKey ? send(s) : insert(s));

  return (
    <>
      <div className="snippet-bar" role="toolbar" aria-label="定型文" onContextMenu={(e) => menu.open(e, null)}>
        <div
          ref={scroller.ref}
          className={cx("snippet-bar-scroll", scroller.edges.start && "fade-start", scroller.edges.end && "fade-end")}
          onScroll={scroller.onScroll}
        >
          {snippets.map((s) => (
            <button
              key={s.id}
              type="button"
              className="snippet-chip"
              data-tip={tipOf(s.text)}
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
            <button type="button" className="snippet-chip snippet-chip-add" onClick={() => setManaging("new")}>
              <Plus size={12} aria-hidden />
              定型文を追加
            </button>
          )}
        </div>
        <div className="snippet-bar-tools">
          <IconButton
            ref={picker.anchor}
            icon={List}
            size={14}
            label="定型文の一覧"
            title={`定型文の一覧（${snippets.length} 件。絞り込んで選べます）`}
            aria-expanded={picker.open}
            className={cx("snippet-bar-tool", picker.open && "active")}
            onClick={picker.toggle}
          />
          <IconButton
            icon={Settings2}
            size={14}
            label="定型文を管理"
            title="定型文を管理（足す・直す・並べ替える）"
            className="snippet-bar-tool"
            onClick={() => setManaging(null)}
          />
        </div>
      </div>
      {/* 一覧・メニュー・ダイアログは帯の外に置く（中の右クリック・クリックが帯に伝わらないように） */}
      {picker.open && (
        <SnippetPicker
          anchor={picker.anchor}
          projectId={projectId}
          snippets={snippets}
          onInsert={insert}
          onSend={send}
          onAdd={() => setManaging("new")}
          onManage={() => setManaging(null)}
          onClose={picker.close}
        />
      )}
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
