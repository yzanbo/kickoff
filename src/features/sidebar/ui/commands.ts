// サイドバーのコマンド: ⌘B 開閉・⌃Tab ⌥⌘← → 前後のプロジェクト・⌃1〜9 n 番目のプロジェクト
import { commandHandler, commands } from "@/foundation/ui/commands";
import { IS_MAC } from "@/foundation/ui/lib/keys";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { storage } from "./storage";

/** プロジェクトを移る操作（useProjectNav が置く）: step は前後（wrap = 端まで来たら反対の端へ）、at は n 番目（0 から） */
export type ProjectMove = { step: -1 | 1; wrap: boolean; vertical: boolean } | { at: number };
export const projectMoves = commandHandler<[move: ProjectMove]>();

/** ⌥⌘↑ ↓ は縦スライドのときだけ（useProjectNav が vertical を断る）。⌥⌘ はいまは Mac の ⌘ だけ */
const arrowStep = (step: -1 | 1, vertical: boolean) => () => IS_MAC && projectMoves.run({ step, wrap: false, vertical });

export const sidebarCommands = [
  commands.item({ id: "sidebar.toggle", title: "サイドバーの開閉", keys: "mod+b", run: () => writeSetting(storage.settings.open, !readSetting(storage.settings.open)) }),
  // ⌃Tab で次、⌃⇧Tab で前（ブラウザのタブと同じく、端まで来たら反対の端へ回る）
  commands.item({ id: "sidebar.nextProject", title: "次のプロジェクト", keys: "ctrl+Tab", windows: "both", run: () => projectMoves.run({ step: 1, wrap: true, vertical: false }) }),
  commands.item({ id: "sidebar.prevProject", title: "前のプロジェクト", keys: "ctrl+shift+Tab", windows: "both", run: () => projectMoves.run({ step: -1, wrap: true, vertical: false }) }),
  commands.item({ id: "sidebar.nextProjectArrow", title: "次のプロジェクト", keys: "mod+alt+ArrowRight", windows: "both", run: arrowStep(1, false) }),
  commands.item({ id: "sidebar.prevProjectArrow", title: "前のプロジェクト", keys: "mod+alt+ArrowLeft", windows: "both", run: arrowStep(-1, false) }),
  commands.item({ id: "sidebar.nextProjectVertical", title: "次のプロジェクト（縦スライド）", keys: "mod+alt+ArrowDown", windows: "both", run: arrowStep(1, true) }),
  commands.item({ id: "sidebar.prevProjectVertical", title: "前のプロジェクト（縦スライド）", keys: "mod+alt+ArrowUp", windows: "both", run: arrowStep(-1, true) }),
  commands.item({
    id: "sidebar.projectN",
    title: "n 番目のプロジェクト",
    keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => `ctrl+${n}`),
    windows: "both",
    run: ({ event }) => event !== undefined && projectMoves.run({ at: Number(event.key) - 1 }),
  }),
];
