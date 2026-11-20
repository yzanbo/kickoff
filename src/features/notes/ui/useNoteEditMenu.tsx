import { Fragment, type MutableRefObject, type ReactNode } from "react";
import { ClipboardItems } from "@/foundation/ui/kit/ClipboardItems";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { IssueFromTextItem } from "@/features/github/ui/IssueFromTextItem";
import type { NoteLines } from "./noteAttachment";
import type { NoteEditorHandle } from "./NoteEditor";
import { canOpenExternal, openExternal } from "@/foundation/ui/external/native";

/**
 * 開いたときの様子: text = 選んでいた文、lines = 選んでいた行（本文の編集の部品のときだけ。ほかは null）、insert = 書ける所なら選んでいた範囲を置き換える関数（null なら書けない。
 * HTML のノートのページの表示は書けないので、切り取り・貼り付けを出さない）、copyAll = 何も選んでいないときにコピーする文（題名の欄は題名の全体）
 */
interface NoteMenuSource {
  text: string;
  lines?: NoteLines | null;
  insert: ((text: string) => void) | null;
  copyAll?: string;
}

/**
 * ノートを足す先のチャット（開いたチャット・ノートのチャット）。add: 選んでいれば、その部分の引用を足し、なければノート全体の写しを札で足す /
 * addQuote: 作った引用（ファイルのフルパスと行番号付き）をそのまま足す（本文で選んだときの上のボタン）/ addPath: ノートのパスを足す
 */
export interface NoteChatTarget {
  /** 見出し・ボタンに出す呼び名（開いたチャットは名前。「機能開発」など） */
  name: string;
  add: (selection: string, lines: NoteLines | null) => void;
  addQuote: (quote: string) => void;
  addPath: () => void;
}

/** 選んだ文の引用を入れた新しいチャットを開く口（start: 選んだ文と行から引用を作る / startQuote: 作った引用をそのまま入れる） */
export interface NoteNewChat {
  start: (selection: string, lines: NoteLines | null) => void;
  startQuote: (quote: string) => void;
}

/** ノートから足す先（開いたチャットはあるときだけ）と、新しいチャットで始める口 */
export interface NoteChatTargets {
  main?: NoteChatTarget;
  note: NoteChatTarget;
  newChat: NoteNewChat;
}

/**
 * ノートの本文の右クリックのメニュー。足すもので組に分け、それぞれの組に足す先を並べる:
 * 「選択部分をチャットに追加」（選んでいるときだけ。組のいちばん下に「新しいチャットで始める」= 選んだ文の引用を入れた新しいチャットを開く）/「ノートすべてをチャットに追加」（ノート全体の写しの札）/「パスをチャットに追加」（ノートのファイルのフルパス）。
 * 足す先は、開いたチャット（main を渡したとき。「「機能開発」に追加」。チャットの右の欄・別ウィンドウのノート）とノートのチャット（「ノートのチャットに追加」）。送るのは自分で。
 * その下に「クリップボード」の組（ClipboardItems: 切り取り・コピー・パスを含めてコピー・パスをコピー・貼り付け。file = ノートのファイルのフルパス）と、
 * 「issue にする」（選んだ文、なければノート全体を本文にした GitHub の新しい issue。issue を渡したとき）、いちばん下に「Finder で表示」（Mac のアプリのとき）。
 * 文を選んだだけではチャットに足さない（右クリックで選んだときだけ）。
 * HTML のノートのページの表示からは、選んだ文を渡して開く（チャットに足す項目と、切り取り・貼り付けのないクリップボードの組）。
 * 見出しの題名の欄からも同じメニューを開く（openFor。切り取り・貼り付けは題名の欄に効き、何も選んでいなければコピーは題名の全体。パスを含めてコピーは選んだ文だけ）
 */
export function useNoteEditMenu(
  editor: MutableRefObject<NoteEditorHandle | null>,
  targets: NoteChatTargets,
  file: string,
  /** 「issue にする」（選んでいなければノート全体を本文に。projectId はノートのプロジェクト、body はいまの本文（書きかけも）） */
  issue?: { projectId: number; body: () => string },
): {
  open: (at: { x: number; y: number }, pageSelection?: string) => void;
  openFor: (at: { x: number; y: number }, source: NoteMenuSource) => void;
  element: ReactNode;
} {
  const menu = useContextMenu<NoteMenuSource>();
  const shown = menu.menu;
  const selected = shown?.value.text ?? "";
  const insert = shown?.value.insert ?? null;
  const copyText = selected || shown?.value.copyAll || "";
  const chatTargets = [targets.main, targets.note].filter((t): t is NoteChatTarget => t !== undefined);
  // 足すものの組（選択部分は選んでいるときだけ）
  const groups: { key: string; label: string; title: (name: string) => string; run: (target: NoteChatTarget) => void }[] = [
    ...(selected.trim()
      ? [
          {
            key: "selection",
            label: "選択部分をチャットに追加",
            title: (name: string) => `選択部分を、ファイルのパスと行番号付きの引用にして、${name}の入力欄に足します`,
            run: (target: NoteChatTarget) => target.add(selected, shown?.value.lines ?? null),
          },
        ]
      : []),
    {
      key: "all",
      label: "ノートすべてをチャットに追加",
      title: (name) => `このノート全体の押した時点の中身を、${name}の入力欄に札で足します`,
      run: (target) => target.add("", null),
    },
    { key: "path", label: "パスをチャットに追加", title: (name) => `このノートのファイルのフルパスを、${name}の入力欄に足します`, run: (target) => target.addPath() },
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
      <PopupMenu at={shown.at} label="ノートの本文の操作" onClose={menu.close}>
        {groups.map((group) => (
          <Fragment key={group.key}>
            <div className="menu-label">{group.label}</div>
            {chatTargets.map((target) => (
              <MenuItem key={target.name} title={group.title(target.name)} onSelect={() => group.run(target)}>
                {target.name}に追加
              </MenuItem>
            ))}
            {group.key === "selection" && (
              <MenuItem title="選択部分を、ファイルのパスと行番号付きの引用にして、新しいチャットの入力欄に入れて開きます（送るのは自分で）" onSelect={() => targets.newChat.start(selected, shown?.value.lines ?? null)}>
                新しいチャットで始める
              </MenuItem>
            )}
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
        {/* Finder で表示（ノートのタブでは一覧の右クリックにもある） */}
        {canOpenExternal() && (
          <>
            <div className="menu-separator" role="separator" />
            <MenuItem onSelect={() => void openExternal({ kind: "reveal", path: file })}>Finder で表示</MenuItem>
          </>
        )}
      </PopupMenu>
    ),
  };
}
