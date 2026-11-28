// updates が window.kickoff を読む所（Mac のアプリの中だけ: 版の情報・更新の様子と操作）
import type { UpdatesSnapshot } from "@shared/updates/types";

/** 更新の口（Mac のアプリの外なら何もしない・null） */
export const updatesNative = {
  snapshot: async (): Promise<UpdatesSnapshot | null> => (await window.kickoff?.updates.snapshot()) ?? null,
  check: () => void window.kickoff?.updates.check(),
  install: () => void window.kickoff?.updates.install(),
  cancelInstall: () => void window.kickoff?.updates.cancelInstall(),
  skip: () => void window.kickoff?.updates.skip(),
  /** リリースの説明・ダウンロードのページを既定のブラウザで開く（決まった GitHub の URL だけ） */
  openPage: (url: string) => void window.kickoff?.externalApps.openWebUrl(url),
  /** 様子の知らせを受ける（やめるときは返り値を呼ぶ） */
  onState: (fn: (snapshot: UpdatesSnapshot) => void) => window.kickoff?.updates.onState(fn),
  /** メニューの「アップデートを確認…」の知らせを受ける */
  onOpenRequested: (fn: () => void) => window.kickoff?.updates.onOpenRequested(fn),
};
