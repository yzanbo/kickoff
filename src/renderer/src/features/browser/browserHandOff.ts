// 埋め込みブラウザのタブの「AI に渡す」: 見えている範囲の画面と、覚えているコンソールのエラー・警告を札にする（要件の添付の共通化の段階 2）
import type { Attachment } from "@shared/types";
import { api } from "@/api";
import { showToast } from "@/ui/toast";
import type { HandOffItem } from "@/features/chat/handoff/handOff";
import { consoleDocument, consoleLabelOf, pageLinkOf, screenLabelOf } from "./consoleDocument";

/** コンソールの時刻（秒まで） */
const clock = (iso: string) => new Date(iso).toLocaleTimeString("ja-JP");

/**
 * 画面とコンソールの札を取る（押した時点のもの）。コンソールにエラー・警告がなければ画面だけ、画面が撮れなければ理由を知らせてコンソールだけ
 * （どちらもなければ失敗にする）
 */
async function captureTab(webContentsId: number, page: { url: string; title: string }): Promise<Attachment[]> {
  const native = window.kickoff?.agentBrowser;
  if (!native) throw new Error("ブラウザの画面はデスクトップアプリでのみ取れます");
  const taken = await native.handOffCapture(webContentsId);
  const url = pageLinkOf(page.url);
  const jobs: Promise<Attachment>[] = [];
  if (taken.screen) {
    jobs.push(api.capture({ name: "browser-screen.jpg", mime: "image/jpeg", image_base64: taken.screen.data, source: { type: "browser_screen", label: screenLabelOf(page, taken.screen), url } }));
  }
  if (taken.console.length > 0) {
    jobs.push(
      api.capture({
        name: "browser-console.md",
        mime: "text/markdown",
        text: consoleDocument(page, taken.console, clock),
        source: { type: "browser_console", label: consoleLabelOf(page, taken.console), url },
        tail_share: 0.8,
      }),
    );
  }
  if (!taken.screen) {
    if (jobs.length === 0) throw new Error(taken.screenError ?? "画面を撮れませんでした");
    showToast(`画面は撮れなかったので、コンソールだけを入れます（${taken.screenError ?? "理由は分かりません"}）`);
  }
  return Promise.all(jobs);
}

/** タブの「AI に渡す」で渡すもの（中身は押したときに取る。新しいチャットは本体で始める） */
export function browserHandOffItem(projectId: number, webContentsId: () => number | null, page: () => { url: string; title: string }): HandOffItem {
  return {
    projectId,
    what: "見えている範囲の画面と、コンソールのエラー・警告",
    text: "",
    capture: () => {
      const id = webContentsId();
      if (id === null) return Promise.reject(new Error("ページの準備ができていません"));
      return captureTab(id, page());
    },
  };
}
