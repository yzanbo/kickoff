// アプリの殻が持つコマンド（機能に属さないもの）: ⌘F ページの中を探す・⌘⇧S すべて保存・⌘[ ⌘] 前の画面・次の画面
import { commandHandler, commands, type CommandContext } from "@/foundation/ui/commands";
import { saveAll } from "@/foundation/ui/document/unsaved";
import { runPageFind } from "@/foundation/ui/kit/pageFind";

/** ⌘[ / ⌘] が呼ぶ、いまの履歴の 1 歩（App が useNavigationHistory の step を置く。動けなければ false） */
export const historySteps = commandHandler<[step: -1 | 1]>();

/** ⌘[ ⌘] はコードの字下げや、開いているダイアログの操作を奪わない */
const outsideEditors = ({ event }: CommandContext): boolean =>
  !(event?.target as HTMLElement | null)?.closest?.(".monaco-editor, .cm-editor, [role=dialog], [aria-modal=true]");

export const appCommands = [
  commands.item({
    id: "page.find",
    title: "ページの中を探す",
    keys: "mod+f",
    windows: "both",
    // 開いているページ（ファイル・検索・変更の右側・履歴の詳細・ノート・別ウィンドウ）が置いた検索を開き（kit/pageFind）、なければボードのチャット名の検索欄へ（別ウィンドウはキーを奪わない）。
    // チャットの中・チャットの画面の右の欄の検索は捕捉で先に受け取り、エディタ（Monaco・CodeMirror）の中ならエディタが自分の検索を開く
    run: ({ window }) => {
      if (runPageFind()) return;
      if (window === "popout") return false;
      const boardSearch = document.querySelector<HTMLInputElement>("main .board-search input");
      boardSearch?.focus();
      boardSearch?.select();
    },
  }),
  // このウィンドウで開いている、まだ保存していないノート・ファイルをまとめて保存する
  commands.item({ id: "document.saveAll", title: "すべて保存", keys: "mod+shift+s", windows: "both", run: () => void saveAll() }),
  commands.item({ id: "navigation.back", title: "前の画面", keys: "mod+[", when: outsideEditors, run: () => historySteps.run(-1) }),
  commands.item({ id: "navigation.forward", title: "次の画面", keys: "mod+]", when: outsideEditors, run: () => historySteps.run(1) }),
];
