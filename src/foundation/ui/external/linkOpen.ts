// 外部リンクを開く: 開く前に確認の画面（URL と警告）を出し、設定の開き先（Kickoff のブラウザ / 既定のブラウザ）で開く。
// 「今後確認しない」はドメインごとにアプリ全体で覚える（設定の trusted_link_domains）。警告に当たるリンクは覚えていても毎回確かめる
import { LINK_WARNING_LABELS, linkDomainOf, linkWarnings, webUrlOf } from "@shared/remoteImages/linkWarnings";
import type { AppSettings } from "@shared/foundation/contract/settings";
import { applySettings, settingsStore } from "@/features/settings/ui/stores/settings";
import { confirm } from "@/foundation/ui/kit/ask";
import { open } from "@/foundation/ui/navigation/open";

const TITLE = "外部リンクを開く";

/** 確認の画面の本文（行き先の URL と、当たった警告。国際化ドメイン名は実際の表記を添える） */
function linkConfirmMessage(href: string, text: string): string {
  const url = webUrlOf(href);
  const warnings = linkWarnings(href, text);
  const lines = ["Kickoff の外のサイトを開きます:", href];
  for (const w of warnings) lines.push("", `⚠ ${LINK_WARNING_LABELS[w]}${w === "idn" && url ? `: ${url.hostname}` : ""}`);
  return lines.join("\n");
}

/** 開くかを確かめる（確かめずに開いてよければ true。「今後確認しない」を選んだらドメインを覚える） */
async function confirmOpen(href: string, text: string, settings: AppSettings): Promise<boolean> {
  const domain = linkDomainOf(href);
  const warned = linkWarnings(href, text).length > 0;
  if (!warned && domain !== null && settings.trusted_link_domains.includes(domain)) return true;
  const message = linkConfirmMessage(href, text);
  if (warned || domain === null) return confirm({ title: TITLE, message, confirmLabel: "開く" }).then((r) => r !== null);
  const answer = await confirm({ title: TITLE, message, confirmLabel: "開く", checks: [{ label: `${domain} へのリンクは今後確認しない` }] }).then((r) => r && { checked: r.checked[0] });
  if (!answer) return false;
  if (answer.checked) applySettings({ trusted_link_domains: [...settings.trusted_link_domains, domain] });
  return true;
}

/**
 * 外部リンクを開く。invert（⌘ を押しながら）なら設定と反対の方で開く。Kickoff のブラウザで開くのは、そのプロジェクトのチャット欄に新しいタブ
 * （AI の browser_open と同じ所）。プロジェクトが分からない画面（全プロジェクト・別ウィンドウ）では既定のブラウザ
 */
export async function openWebLink(href: string, text: string, opts: { invert: boolean; projectId: number | undefined }): Promise<void> {
  const settings = settingsStore.get().data ?? (await settingsStore.reload());
  if (!(await confirmOpen(href, text, settings))) return;
  const kickoff = (settings.link_open_in === "kickoff") !== opts.invert;
  if (kickoff && opts.projectId !== undefined) open({ kind: "browser", projectId: opts.projectId, url: href });
  // 新しいウィンドウを開こうとすると、メインプロセスが既定のブラウザで開く（app/externalLinks.ts）
  else window.open(href, "_blank", "noopener,noreferrer");
}
