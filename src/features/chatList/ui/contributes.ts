// chatList が拡張点に出すもの（app/renderer/registry.ts が入れる）: プロジェクトの画面の見出しの状態ごとのチャット・⌘K のチャット・⌘⇧A・Esc で選ぶのをやめる
import { projectHeaderStats } from "@/features/projects/ui";
import { allStateChatsItem, stateStatsItem } from "./projectHeaderStats";
import { commands } from "@/foundation/ui/commands";
import { openActiveChats } from "./activeChats/openActiveChats";
import { selectionClears } from "./selection/selectionClears";
import { paletteSources } from "@/features/palette/ui";
import { chatPaletteSource } from "./paletteSources";

export const contributes = [
  projectHeaderStats.item(stateStatsItem),
  projectHeaderStats.item(allStateChatsItem),
  paletteSources.item(chatPaletteSource),
  commands.item({ id: "chatList.activeChats", title: "作業中・回答待ち・未読の一覧", keys: "mod+shift+a", run: () => openActiveChats({}) }),
  // 選んでいるときだけ（入力欄・ダイアログ・メニューの中の Esc は、そちらに任せる）
  commands.item({
    id: "chatList.clearSelection",
    title: "選ぶのをやめる",
    keys: "Escape",
    windows: "both",
    when: ({ event }) => !(event?.target as HTMLElement | null)?.closest?.("input, textarea, [role=dialog], [role=menu]"),
    run: () => selectionClears.run(),
  }),
];
