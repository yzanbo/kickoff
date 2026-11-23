// ⌘⇧F で検索タブの検索欄にピントを置く頼み（コマンド files.codeSearch が検索タブへ移ってから頼む）。
// もう開いている検索欄には知らせで、これから開く検索欄（タブを移った直後）は描いたときに受け取る

import { commands } from "@/foundation/ui/commands";
import { createRequest } from "@/foundation/ui/store";
import { open } from "@/foundation/ui/navigation/open";
import { openNoProjectsGuide, projectInView } from "@/features/projects/ui";

/** 頼みを覚えておく時間（検索タブが開かなかったとき、あとで開いた検索欄で急に文を選ばないように） */
const TTL_MS = 3000;

/** 検索欄にピントを置いて、書いてある文を選ぶ頼み（take で受け取る・peek は一覧を隠している EditorTab が検索の欄を出すかを決める） */
export const codeSearchFocus = createRequest(TTL_MS);

/** ⌘⇧F: 開いている（なければサイドバーで選んでいる）プロジェクトの検索タブへ移り、検索の欄にピントを置く（チャットの中の文言の全文検索は palette.contentSearch） */
export const codeSearchCommand = commands.item({
  id: "files.codeSearch",
  title: "プロジェクトのファイルの中を探す",
  keys: "mod+shift+f",
  run: ({ projectId }) => {
    const target = projectInView(projectId);
    if (target === undefined) return openNoProjectsGuide();
    open({ kind: "projectView", projectId: target, view: "search" });
    codeSearchFocus.ask(true);
  },
});
