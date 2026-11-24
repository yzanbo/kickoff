// 文書の検査（scripts/check-docs.mjs）の上限の差し替え。ここの DOC_LIMITS を scripts/docs.config.mjs の limits より先に当てる。
// 一時に緩めるものはいまはない（緩めるときは理由をコメントに書く）
/** 上限の差し替え（{ path | glob, max }。上から最初に合ったものを当てる） */
export const DOC_LIMITS = [];
