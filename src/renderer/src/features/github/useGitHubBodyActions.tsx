import type { MouseEvent } from "react";
import { Copy } from "lucide-react";
import type { GitHubIssueDetail } from "@shared/types";
import { selectionToMarkdown } from "@/ui/markdown/selectionMarkdown";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { GitHubChatTargets } from "./GitHubHandoffMenu";
import { selectGitHubItem } from "./GitHubLinkChip";
import { addToChatWith } from "./githubHandoff";
import { githubItemRef } from "./githubLinks";
import { linkOf, quotePrompt } from "./githubPrompt";

/** 右クリックで選んでいた文（Markdown に戻したものと、コピー用の文のまま） */
interface Picked {
  markdown: string;
  plain: string;
}

/** 選んだ範囲を含む GitHub の本文の要素（いくつかの本文にまたがるときは null） */
function htmlRootOf(range: Range): Element | null {
  const node = range.commonAncestorContainer;
  return (node instanceof Element ? node : node.parentElement)?.closest(".github-html") ?? null;
}

/**
 * 中身の本文・コメント（GitHubHtml）への操作（GitHubDetail の本文の入れ物に付ける）:
 * - リンクを押す: このリポジトリの issue・PR（「#12」など）なら Kickoff の中で開く（いま見ている GitHub タブ・右の欄で、そのものに切り替える）。
 *   ほかは今までどおり外のブラウザ。⌘・Shift などを押しながらなら、このリポジトリのものも外のブラウザ（GitHub で見たいとき）
 * - 文を選んで右クリック: 「チャットに追加」（右の欄ではその欄のチャット、プロジェクトのタブでは最近動いたチャットから選ぶ）で、
 *   どの issue・PR の文かを添えた引用を入力欄の後ろに足す（チャットは結び付けない）。コピーも。文を選んでいなければ何もしない
 */
export function useGitHubBodyActions(projectId: number, detail: GitHubIssueDetail) {
  const menu = useContextMenu<Picked>();
  const repo = linkOf(detail).repo;

  const onClick = (e: MouseEvent<HTMLElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = (e.target as Element).closest?.("a[href]");
    if (!link?.closest(".github-html") || !e.currentTarget.contains(link)) return;
    const ref = githubItemRef(link.getAttribute("href") ?? "", repo);
    if (!ref) return;
    e.preventDefault();
    selectGitHubItem(projectId, ref);
  };

  const onContextMenu = (e: MouseEvent<HTMLElement>) => {
    // 書く欄（コメント・返信）の上は、入力欄のふつうのメニューに任せる
    if ((e.target as Element).closest?.("textarea, input")) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!e.currentTarget.contains(range.commonAncestorContainer)) return;
    const plain = range.toString().trim();
    if (!plain) return;
    // 1 つの本文の中なら Markdown に戻す（リスト・コード・リンクを保つ）。本文をまたいだら文のまま
    const root = htmlRootOf(range);
    menu.open(e, { markdown: root ? selectionToMarkdown(range, root) : plain, plain });
  };

  const picked = menu.menu?.value;
  const element = menu.menu && picked && (
    <PopupMenu at={menu.menu.at} label="選んだ文" onClose={menu.close}>
      <div className="menu-label">選んだ文</div>
      <GitHubChatTargets projectId={projectId} what="選んだ文の引用" onAdd={(chat) => addToChatWith(chat, quotePrompt(detail, picked.markdown), null)} />
      <div className="menu-separator" role="separator" />
      <MenuItem onSelect={() => void navigator.clipboard.writeText(picked.plain)}>
        <Copy size={14} /> コピー
      </MenuItem>
    </PopupMenu>
  );

  return { onClick, onContextMenu, menu: element };
}
