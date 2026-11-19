// 文書の検査（scripts/check-docs.mjs）の上限の差し替え。ここの DOC_LIMITS を scripts/docs.config.mjs の limits より先に当てる。
// いまの中身は 0018 の作り直しの「説明を痩せさせる」段の間だけの一時の値: CLAUDE.md ごとの痩せさせる目標（KB × 1024）と、
// 測った数を書き足す docs/architecture.md の一時の緩め。作り直しの仕上げで最後の上限に書き直す
/** 上限の差し替え（{ path | glob, max }。上から最初に合ったものを当てる） */
export const DOC_LIMITS = [
  { path: "CLAUDE.md", max: 10 * 1024 },
  { path: "src/renderer/src/features/chat/CLAUDE.md", max: 32 * 1024 },
  { path: "src/core/CLAUDE.md", max: 34 * 1024 },
  { path: "src/core/chat/CLAUDE.md", max: 21 * 1024 },
  { path: "src/renderer/src/features/panel/CLAUDE.md", max: 13 * 1024 },
  { path: "src/renderer/src/CLAUDE.md", max: 17 * 1024 },
  { path: "src/core/providers/CLAUDE.md", max: 8.5 * 1024 },
  { path: "src/renderer/src/features/sidebar/CLAUDE.md", max: 5 * 1024 },
  { path: "src/renderer/src/features/editor/CLAUDE.md", max: 5 * 1024 },
  { path: "src/renderer/src/features/database/CLAUDE.md", max: 5 * 1024 },
  { path: "src/main/CLAUDE.md", max: 6 * 1024 },
  { path: "src/renderer/src/features/memo/CLAUDE.md", max: 4 * 1024 },
  { path: "src/renderer/src/features/board/CLAUDE.md", max: 4 * 1024 },
  { path: "src/shared/CLAUDE.md", max: 5 * 1024 },
  { path: "src/renderer/src/features/settings/CLAUDE.md", max: 3 * 1024 },
  { path: "src/renderer/src/features/project/CLAUDE.md", max: 3 * 1024 },
  { path: "src/renderer/src/styles/CLAUDE.md", max: 8 * 1024 },
  { path: "src/renderer/src/features/github/CLAUDE.md", max: 3 * 1024 },
  { path: "src/renderer/src/features/docker/CLAUDE.md", max: 2 * 1024 },
  { path: "src/renderer/src/features/terminal/CLAUDE.md", max: 2 * 1024 },
  { path: "src/renderer/src/features/worktree/CLAUDE.md", max: 2 * 1024 },
  { path: "src/renderer/src/features/chatList/CLAUDE.md", max: 2 * 1024 },
  { path: "mobile/CLAUDE.md", max: 3 * 1024 },
  { path: "src/renderer/src/features/palette/CLAUDE.md", max: 1.5 * 1024 },
  { path: "src/renderer/src/features/snippet/CLAUDE.md", max: 1.5 * 1024 },
  { path: "src/renderer/src/features/trash/CLAUDE.md", max: 2 * 1024 },
  // 末尾の「決めたこと（測った数）」に、CLAUDE.md から移す測った数を書き足すため一時に緩める
  { path: "docs/architecture.md", max: 68 * 1024 },
];
