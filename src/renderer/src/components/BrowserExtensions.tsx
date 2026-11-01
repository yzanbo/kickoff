import { Download, FolderOpen, Puzzle, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { BrowserExtensionInfo } from "../../../preload/index";
import { errorMessage } from "../errors";
import type { ResultText } from "../hooks/useSave";
import { ResultMessage } from "./SaveActions";

const SOURCE_LABELS: Record<BrowserExtensionInfo["source"], string> = {
  webstore: "ウェブストアから取得",
  "chrome-profile": "Chrome から取り込み",
  folder: "フォルダを指定",
};

/** 埋め込みブラウザの拡張機能（設定画面） */
export function BrowserExtensions() {
  const api = window.kickoff?.browserExtensions;
  const [list, setList] = useState<BrowserExtensionInfo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<ResultText>();

  useEffect(() => {
    void api?.list().then(setList);
  }, [api]);

  if (!api) return <p className="muted small">ブラウザの拡張機能はデスクトップアプリでのみ設定できます。</p>;

  async function run(label: string, fn: () => Promise<BrowserExtensionInfo[]>, done: string) {
    setBusy(label);
    setMessage(undefined);
    try {
      setList(await fn());
      setMessage({ kind: "ok", text: done });
    } catch (e) {
      setMessage({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  const hasReact = list.some((e) => /react developer tools/i.test(e.name));

  return (
    <div className="ext-settings">
      <p className="muted small">
        埋め込みブラウザで使う Chrome の拡張機能です。開発者ツール向けの拡張（React DevTools など）は動きますが、Bitwarden のようにポップアップや Chrome
        の機能を多く使う拡張は動きません（そのようなページは「Chrome で開く」を使ってください）。
      </p>
      {list.length === 0 ? (
        <p className="muted small">読み込んでいる拡張機能はありません。</p>
      ) : (
        <ul className="ext-list">
          {list.map((e) => (
            <li key={e.path}>
              <Puzzle size={14} className="muted" />
              <span className="ext-name">
                {e.name} <span className="muted small">{e.version}</span>
              </span>
              <span className="badge">{SOURCE_LABELS[e.source]}</span>
              <button className="icon-button" aria-label={`${e.name} を外す`} title="外す" disabled={busy !== null} onClick={() => void run("remove", () => api.remove(e.path), `${e.name} を外しました`)}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="ext-actions">
        {!hasReact && (
          <>
            <button className="btn" disabled={busy !== null} onClick={() => void run("install", () => api.install("react-devtools"), "React DevTools を追加しました")}>
              <Download size={14} /> {busy === "install" ? "取得中…" : "React DevTools をウェブストアから取得"}
            </button>
            <button className="btn" disabled={busy !== null} onClick={() => void run("import", () => api.importFromChrome("react-devtools"), "Chrome の React DevTools を取り込みました")}>
              Chrome から取り込む
            </button>
          </>
        )}
        <button className="btn" disabled={busy !== null} onClick={() => void run("folder", () => api.addFolder(), "拡張機能を追加しました")}>
          <FolderOpen size={14} /> フォルダを指定…
        </button>
      </div>
      <ResultMessage result={message} as="p" className="small" />
    </div>
  );
}
