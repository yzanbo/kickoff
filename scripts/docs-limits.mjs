// 文書の検査（scripts/check-docs.mjs）の上限の差し替え。ここの DOC_LIMITS を scripts/docs.config.mjs の limits より先に当てる。
// いまの中身は 0018 の作り直しの「説明を痩せさせる」段の間だけの一時の値: CLAUDE.md ごとの痩せさせる目標（KB × 1024。機能のフォルダへ配ったあとの値で、
// ここにない機能の CLAUDE.md は docs.config.mjs の 4KB）と、
// 測った数を書き足す docs/architecture.md の一時の緩め。作り直しの仕上げで最後の上限に書き直す
/** 上限の差し替え（{ path | glob, max }。上から最初に合ったものを当てる） */
export const DOC_LIMITS = [
  { path: "CLAUDE.md", max: 10 * 1024 },
  { path: "src/features/panel/CLAUDE.md", max: 13 * 1024 },
  { path: "src/features/sidebar/CLAUDE.md", max: 5 * 1024 },
  { path: "src/features/files/CLAUDE.md", max: 5 * 1024 },
  { path: "src/features/database/CLAUDE.md", max: 6 * 1024 },
  { path: "src/features/notes/CLAUDE.md", max: 4 * 1024 },
  { path: "src/features/board/CLAUDE.md", max: 4 * 1024 },
  { path: "src/features/settings/CLAUDE.md", max: 3 * 1024 },
  { path: "src/features/projects/CLAUDE.md", max: 3 * 1024 },
  { path: "src/features/terminal/CLAUDE.md", max: 2 * 1024 },
  { path: "mobile/CLAUDE.md", max: 3 * 1024 },
  { path: "src/features/palette/CLAUDE.md", max: 1.5 * 1024 },
  { path: "src/features/snippets/CLAUDE.md", max: 1.5 * 1024 },
  // 末尾の「決めたこと（測った数）」に、CLAUDE.md から移す測った数を書き足すため一時に緩める
  { path: "docs/architecture.md", max: 68 * 1024 },
];
