// 埋め込みブラウザが 1 回の実行に足すもの（contributor "browser"）: システムプロンプトの「ブラウザ」の節（300。埋め込みブラウザがあるとき）
import type { LinkOpenTarget } from "@shared/settings/types";
import type { PromptSection, TurnContributor } from "@/features/chat/core/index";

/** ブラウザのツールの説明を読む前にも、どの AI にも利用者が選んだ開き先を伝える */
export function browserSection(target: LinkOpenTarget): PromptSection {
  return {
    order: 300,
    heading: `## ブラウザ`,
    lines: [
      target === "kickoff"
        ? `- ブラウザの既定の開き先は「Kickoff のブラウザ」です。作業中にページを開く・画面を確かめる・操作するときは、kickoff_browser の browser_tabs・browser_open などを優先してください。利用者が別のブラウザや自動テストを指定した場合を除き、外部のブラウザ・Playwright・Chrome DevTools で別のブラウザを起動しないでください。`
        : `- ブラウザの既定の開き先は「既定のブラウザ」（OS の既定のブラウザ）です。利用者にページを開くときは、そのブラウザで開いてください。利用者が「Kickoff のブラウザ」「開いているページ」と指定したときは、kickoff_browser のツールでそのタブを確かめてください。`,
      `- この開き先は指示を送るたびに設定から読み直します。利用者が開き先を指定したときは、その指定を優先してください。`,
    ],
  };
}

/** ブラウザの contributor（開き先は送るたびに設定から読み直す） */
export function browserTurnParts(linkOpenIn: () => LinkOpenTarget): TurnContributor {
  return { name: "browser", order: 70, contribute: () => ({ promptSections: [browserSection(linkOpenIn())] }) };
}
