import type { ContextMenuEvent, Params, WebviewTag } from "electron";
import { useEffect, useEffectEvent } from "react";
import { webUrlOf } from "@shared/remoteImages/linkWarnings";
import { googleSearch } from "@/foundation/ui/lib/url";
import { HandOffItems } from "@/features/attachments/ui";
import { ClipboardItems, copyClipboardText } from "@/foundation/ui/kit/ClipboardItems";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { browserSelectionItem } from "./browserHandOff";
import { browserMenuContext } from "./browserMenuContext";

const separator = <div className="menu-separator" role="separator" />;
type PagePoint = { x: number; y: number };

/** webview は別のプロセスにあるので、DOM の contextmenu ではなく Electron の知らせで開く */
export function useBrowserPageMenu(view: WebviewTag | null, visible: boolean) {
  const menu = useContextMenu<Params>();
  const open = useEffectEvent(({ params }: ContextMenuEvent) => {
    if (!view?.checkVisibility() || view.closest("[inert]") || !params) return;
    // Electron は webview の中のクリックも、持ち主の画面全体に対する座標で知らせる
    menu.openAt({ x: params.x, y: params.y }, params);
  });
  const close = useEffectEvent(() => menu.close());
  useEffect(() => {
    if (!visible || !view) {
      close();
      return;
    }
    const onMenu = (event: ContextMenuEvent) => open(event);
    const onNavigate = () => close();
    view.addEventListener("context-menu", onMenu);
    view.addEventListener("did-navigate", onNavigate);
    view.addEventListener("did-navigate-in-page", onNavigate);
    return () => {
      view.removeEventListener("context-menu", onMenu);
      view.removeEventListener("did-navigate", onNavigate);
      view.removeEventListener("did-navigate-in-page", onNavigate);
    };
  }, [view, visible]);
  return { shown: visible ? menu.menu : null, close: menu.close };
}

type OpenTab = (url: string, background: boolean) => void;

export function BrowserPageMenu({ shown, close, view, currentUrl, projectId, nav, external, openTab, openFind, inspect }: {
  shown: NonNullable<ReturnType<typeof useBrowserPageMenu>["shown"]>;
  close: () => void;
  view: WebviewTag;
  currentUrl: string;
  projectId: number | null;
  nav: { back: boolean; forward: boolean };
  external: { label: string; open: (url: string) => void };
  openTab: OpenTab;
  openFind: () => void;
  inspect: (at: PagePoint) => void;
}) {
  const p = shown.value;
  const { linkUrl, linkAddress, password, selection, copyImage, mediaLabel, mediaUrl, downloadUrl, pageActions } = browserMenuContext(p);
  const copyBitmap = () => void window.kickoff?.browser.copyImageAt(view.getWebContentsId(), p.x, p.y).catch(reportFailure("画像をコピーできませんでした"));
  const pageUrl = webUrlOf(currentUrl)?.href ?? null;
  // 選んだ文の出どころは、入れ子のページならそのフレーム
  const sourceUrl = webUrlOf(p.frameURL)?.href ?? currentUrl;
  const downloadMedia = p.mediaFlags.canSave || mediaLabel === "画像" ? downloadUrl : null;
  const hasMediaItems = Boolean(mediaUrl || copyImage || downloadMedia);

  return (
    <PopupMenu at={shown.at} label="ブラウザのページの操作" onClose={close}>
      {linkAddress && (
        <>
          {linkUrl && (
            <>
              <MenuItem onSelect={() => openTab(linkUrl, true)}>リンクを新しいタブで開く</MenuItem>
              <MenuItem onSelect={() => external.open(linkUrl)}>リンクを {external.label} で開く</MenuItem>
              <MenuItem onSelect={() => view.downloadURL(linkUrl)}>リンク先を保存…</MenuItem>
            </>
          )}
          <MenuItem onSelect={() => void copyClipboardText(linkAddress)}>リンクのアドレスをコピー</MenuItem>
          {separator}
        </>
      )}
      {hasMediaItems && (
        <>
          {mediaUrl && <MenuItem onSelect={() => openTab(mediaUrl, true)}>{mediaLabel}を新しいタブで開く</MenuItem>}
          {copyImage && <MenuItem onSelect={copyBitmap}>画像をコピー</MenuItem>}
          {mediaUrl && <MenuItem onSelect={() => void copyClipboardText(mediaUrl)}>{mediaLabel}のアドレスをコピー</MenuItem>}
          {downloadMedia && <MenuItem onSelect={() => view.downloadURL(downloadMedia)}>{mediaLabel}を保存…</MenuItem>}
          {separator}
        </>
      )}
      {p.isEditable && (
        <>
          <BrowserEditItems view={view} flags={p.editFlags} password={password} />
          {separator}
        </>
      )}
      {selection && (
        <>
          <ClipboardItems path={null} text={selection} />
          <MenuItem onSelect={() => openTab(googleSearch(selection.trim().slice(0, 500)), false)}>選択部分を Google で検索</MenuItem>
          {projectId !== null && (
            <>
              {separator}
              <div className="menu-label">選択部分をチャットに追加</div>
              <HandOffItems item={browserSelectionItem(projectId, selection, sourceUrl)} />
            </>
          )}
          {separator}
        </>
      )}
      {pageActions && (
        <>
          <MenuItem disabled={!nav.back} onSelect={() => view.goBack()}>戻る</MenuItem>
          <MenuItem disabled={!nav.forward} onSelect={() => view.goForward()}>進む</MenuItem>
          <MenuItem onSelect={() => view.reload()}>再読み込み</MenuItem>
          {separator}
          <MenuItem onSelect={openFind}>このページを検索</MenuItem>
          {pageUrl && <MenuItem onSelect={() => void copyClipboardText(pageUrl)}>ページのアドレスをコピー</MenuItem>}
          {separator}
        </>
      )}
      <MenuItem onSelect={() => inspect({ x: p.x, y: p.y })}>検証</MenuItem>
    </PopupMenu>
  );
}

function BrowserEditItems({ view, flags, password }: { view: WebviewTag; flags: Params["editFlags"]; password: boolean }) {
  const items = [
    ["undo", "元に戻す", flags.canUndo],
    ["redo", "やり直す", flags.canRedo],
    ["cut", "切り取り", flags.canCut && !password],
    ["copy", "コピー", flags.canCopy && !password],
    ["paste", "貼り付け", flags.canPaste],
    ...(flags.canEditRichly ? [["pasteAndMatchStyle", "書式なしで貼り付け", flags.canPaste] as const] : []),
    ["selectAll", "すべて選択", flags.canSelectAll],
  ] as const;
  return items.map(([command, label, enabled]) => (
    <MenuItem key={command} disabled={!enabled} onSelect={() => {
      // 共通メニューにいったんピントが移るため、編集命令の前に右クリックしたページへ戻す
      view.focus();
      view[command]();
    }}>{label}</MenuItem>
  ));
}
