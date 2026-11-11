// 下の帯の、AI・ツールの CLI が使えないときの札（Claude Code・gh。ふだんは出さない）。React に依らない
import type { GitHubStatus, ProviderStatus } from "@shared/types";

export interface ToolNotice {
  key: "claude" | "github";
  /** 札の文 */
  label: string;
  /** マウスを乗せたときの説明 */
  title: string;
}

/** 使えない CLI の札（まだ確かめていないものは出さない） */
export function toolNotices(providers: ProviderStatus[] | undefined, github: GitHubStatus | undefined): ToolNotice[] {
  const notices: ToolNotice[] = [];
  const claude = providers?.find((p) => p.id === "claude");
  if (claude && !(claude.installed && claude.logged_in)) {
    notices.push({
      key: "claude",
      label: claude.installed ? "Claude Code に未ログイン" : "Claude Code が見つかりません",
      title: `${claude.detail}\nチャットを送れません。押すと設定の「接続」を開きます`,
    });
  }
  if (github && !(github.installed && github.logged_in)) {
    notices.push({
      key: "github",
      label: github.installed ? "gh に未ログイン" : "gh が見つかりません",
      title: `${github.detail}\nPR の見張り・GitHub の操作が使えません。押すと設定の「接続」を開きます`,
    });
  }
  return notices;
}
