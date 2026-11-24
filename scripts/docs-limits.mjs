// 文書の検査（scripts/check-docs.mjs）の上限の差し替え。ここの DOC_LIMITS を scripts/docs.config.mjs の limits より先に当てる。
// いまの中身は、測った数を書き足す docs/architecture.md の一時の緩めだけ。作り直しの仕上げで最後の上限に書き直す
/** 上限の差し替え（{ path | glob, max }。上から最初に合ったものを当てる） */
export const DOC_LIMITS = [
  // 末尾の「決めたこと（測った数）」に、CLAUDE.md から移す測った数を書き足すため一時に緩める
  { path: "docs/architecture.md", max: 68 * 1024 },
];
