import { Fragment, type MutableRefObject, type ReactNode } from "react";
import { ClipboardItems } from "@/ui/ClipboardItems";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { IssueFromTextItem } from "@/features/github/IssueFromTextItem";
import type { MemoLines } from "./memoAttachment";
import type { MemoEditorHandle } from "./MemoEditor";

/**
 * 開いたときの様子: text = 選んでいた文、lines = 選んでいた行（本文の編集の部品のときだけ。ほかは null）、insert = 書ける所なら選んでいた範囲を置き換える関数（null なら書けない。
 * HTML のメモのページの表示は書けないので、切り取り・貼り付けを出さない）、copyAll = 何も選んでいないときにコピーする文（題名の欄は題名の全体）
 */
interface MemoMenuSource {
  text: string;
  lines?: MemoLines | null;
  insert: ((text: string) => void) | null;
  copyAll?: string;
}

/**
 * メモを足す先のチャット（開いたチャット・メモのチャット）。add: 選んでいれば、その部分の引用を足し、なければメモ全体を添付する /
 * addQuote: 作った引用（ファイルのフルパスと行番号付き）をそのまま足す（本文で選んだときの上のボタン）/ addPath: メモのパスを足す
 */
export interface MemoChatTarget {
  /** 見出し・ボタンに出す呼び名（開いたチャットは名前。「機能開発」など） */
  name: string;
  add: (selection: string, lines: MemoLines | null) => void;
  addQuote: (quote: string) => void;
  addPath: () => void;
}

/**
 * メモの本文の右クリックのメニュー。足すもので組に分け（利用者の依頼。前は足す先のチャットごとの組だった）、それぞれの組に足す先を並べる:
 * 「選択部分をチャットに追加」（選んでいるときだけ）/「メモすべてをチャットに追加」（メモ全体を添付）/「パスをチャットに追加」（メモのファイルのフルパス）。
 * 足す先は、開いたチャット（main を渡したとき。「「機能開発」に追加」。チャットの右の欄・別ウィンドウのメモ）とメモのチャット（「メモのチャットに追加」）。送るのは自分で。
 * その下に「クリップボード」の組（ClipboardItems: 切り取り・コピー・パスを含めてコピー・パスをコピー・貼り付け。file = メモのファイルのフルパス）と、
 * 「issue にする」（選んだ文、なければメモ全体を本文にした GitHub の新しい issue。issue を渡したとき）、いちばん下に「Finder で表示」（Mac のアプリのとき）。
 * 文を選んだだけではチャットに足さない（右クリックで選んだときだけ）。
 * HTML のメモのページの表示からは、選んだ文を渡して開く（チャットに足す項目と、切り取り・貼り付けのないクリップボードの組）。
 * 見出しの題名の欄からも同じメニューを開く（openFor。切り取り・貼り付けは題名の欄に効き、何も選んでいなければコピーは題名の全体。パスを含めてコピーは選んだ文だけ）
 */
export function useMemoEditMenu(
  editor: MutableRefObject<MemoEditorHandle | null>,
  targets: { main?: MemoChatTarget; memo: MemoChatTarget },
  file: string,
  /** 「issue にする」（選んでいなければメモ全体を本文に。projectId はメモのプロジェクト、body はいまの本文（書きかけも）） */
  issue?: { projectId: number; body: () => string },
): {
  open: (at: { x: number; y: number }, pageSelection?: string) => void;
  openFor: (at: { x: number; y: number }, source: MemoMenuSource) => void;
  element: ReactNode;
} {
  const menu = useContextMenu<MemoMenuSource>();
  const shown = menu.menu;
  const selected = shown?.value.text ?? "";
  const insert = shown?.value.insert ?? null;
  const copyText = selected || shown?.value.copyAll || "";
  const chatTargets = [targets.main, targets.memo].filter((t): t is MemoChatTarget => t !== undefined);
  // 足すものの組（選択部分は選んでいるときだけ）
  const groups: { key: string; label: string; title: (name: string) => string; run: (target: MemoChatTarget) => void }[] = [
    ...(selected.trim()
      ? [
          {
            key: "selection",
            label: "選択部分をチャットに追加",
            title: (name: string) => `選択部分を、ファイルのパスと行番号付きの引用にして、${name}の入力欄に足します`,
            run: (target: MemoChatTarget) => target.add(selected, shown?.value.lines ?? null),
          },
        ]
      : []),
    {
      key: "all",
      label: "メモすべてをチャットに追加",
      title: (name) => `このメモ全体を、${name}の入力欄に添付します`,
      run: (target) => target.add("", null),
    },
    { key: "path", label: "パスをチャットに追加", title: (name) => `このメモのファイルのフルパスを、${name}の入力欄に足します`, run: (target) => target.addPath() },
  ];
  return {
    // 開いたときに選んでいた文を覚える（メニューを押すまでに選択が変わっても、開いたときの文を使う）
    open: (at, pageSelection) =>
      menu.openAt(
        at,
        pageSelection === undefined
          ? { text: editor.current?.selectedText() ?? "", lines: editor.current?.selectedLines() ?? null, insert: (text) => editor.current?.insert(text) }
          : { text: pageSelection, insert: null },
      ),
    openFor: (at, source) => menu.openAt(at, source),
    element: shown && (
      <PopupMenu at={shown.at} label="メモの本文の操作" onClose={menu.close}>
        {groups.map((group) => (
          <Fragment key={group.key}>
            <div className="menu-label">{group.label}</div>
            {chatTargets.map((target) => (
              <MenuItem key={target.name} title={group.title(target.name)} onSelect={() => group.run(target)}>
                {target.name}に追加
              </MenuItem>
            ))}
            <div className="menu-separator" role="separator" />
          </Fragment>
        ))}
        <ClipboardItems
          text={copyText}
          selection={selected}
          path={file}
          lines={shown.value.lines ?? null}
          onCut={insert ? () => insert("") : undefined}
          onPaste={insert ?? undefined}
        />
        {issue && (
          <>
            <div className="menu-separator" role="separator" />
            <IssueFromTextItem projectId={issue.projectId} body={() => (selected.trim() ? selected : issue.body())} />
          </>
        )}
        {/* Finder で表示（利用者の依頼で、見出しのボタンから右クリックへ移した。メモのタブでは一覧の右クリックにもある） */}
        {window.kickoff && (
          <>
            <div className="menu-separator" role="separator" />
            <MenuItem onSelect={() => void window.kickoff?.externalApps.revealPath(file)}>Finder で表示</MenuItem>
          </>
        )}
      </PopupMenu>
    ),
  };
}
