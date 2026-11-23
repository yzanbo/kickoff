import { Download, FolderOpen, Puzzle, Trash2, X } from "lucide-react";
import { KNOWN_EXTENSION_KEYS, KNOWN_EXTENSIONS, type BrowserExtensionInfo, type KnownExtensionKey } from "@shared/foundation/ipc";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { ResultMessage } from "@/foundation/ui/kit/SaveActions";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { useQuery } from "@/foundation/ui/query/useQuery";
import { errorMessage } from "@shared/foundation/errors";
import { nativeBrowserExtensions } from "./native";

const SOURCE_LABELS: Record<BrowserExtensionInfo["source"], string> = {
  webstore: "ウェブストアから取得",
  "chrome-profile": "Chrome から取り込み",
  folder: "フォルダを指定",
};

/** 実行中の操作（どの拡張機能のものか分かるように、キー・パスを添える） */
type ExtensionAction = `install:${KnownExtensionKey}` | `import:${KnownExtensionKey}` | `remove:${string}` | "folder";

/** 埋め込みブラウザの拡張機能（設定画面） */
export function BrowserExtensions() {
  const api = nativeBrowserExtensions();
  // 読めなければ空の一覧のまま、読めなかったことを出す
  const query = useQuery(api ? "BrowserExtensions.list" : null, () => api!.list());
  const list = query.data ?? [];
  const action = useAction<ExtensionAction>();
  const busy = action.busy;

  if (!api) return <p className="muted small">ブラウザの拡張機能はデスクトップアプリでのみ設定できます。</p>;

  /** 拡張機能を足す・消す（そのあとの一覧が返る。終わったら結果の文を出す） */
  const run = (name: ExtensionAction, fn: () => Promise<BrowserExtensionInfo[]>, done: string) =>
    action.run(name, async () => query.setData(await fn()), { done });

  const added = new Set(list.map((e) => e.key));
  const addable = KNOWN_EXTENSION_KEYS.filter((k) => !added.has(k));

  return (
    <div className="ext-settings">
      <p className="muted small">
        埋め込みブラウザで使う Chrome の拡張機能です。開発者ツールにパネルを足す拡張（React DevTools など）は動きますが、Bitwarden のようにポップアップや Chrome
        の機能を多く使う拡張は動きません（そのようなページは「Chrome で開く」を使ってください）。足した・消したあとは、ページを読み込み直して開発者ツールを開き直すと反映されます。
      </p>
      <h3>追加した拡張機能</h3>
      <ErrorText message={query.error && `拡張機能の一覧を読み込めませんでした: ${errorMessage(query.error)}`} />
      {list.length === 0 ? (
        <p className="muted small">追加した拡張機能はありません。</p>
      ) : (
        <ul className="ext-list">
          {list.map((e) => (
            <AddedExtension key={e.path} ext={e} busy={busy} onRemove={(detach) => void run(`remove:${e.path}`, () => api.remove(e.path), `${e.name} を${detach ? "外しました" : "削除しました"}`)} />
          ))}
        </ul>
      )}
      {addable.length > 0 && (
        <>
          <h3>よく使う拡張機能</h3>
          <ul className="ext-list">
            {addable.map((key) => {
              const { name, description } = KNOWN_EXTENSIONS[key];
              return (
                <li key={key}>
                  <Puzzle size={14} className="muted" />
                  <span className="ext-name">
                    {name}
                    <span className="ext-description muted small">{description}</span>
                  </span>
                  <button className="btn" data-size="sm" disabled={busy !== null} onClick={() => void run(`install:${key}`, () => api.install(key), `${name} を追加しました`)}>
                    <Download size={13} aria-hidden /> {busy === `install:${key}` ? "取得中…" : "ウェブストアから取得"}
                  </button>
                  <button className="btn" data-size="sm" disabled={busy !== null} onClick={() => void run(`import:${key}`, () => api.importFromChrome(key), `Chrome の ${name} を取り込みました`)}>
                    {busy === `import:${key}` ? "取り込み中…" : "Chrome から取り込む"}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div className="ext-actions">
        <button className="btn" disabled={busy !== null} onClick={() => void run("folder", () => api.addFolder(), "拡張機能を追加しました")}>
          <FolderOpen size={14} /> フォルダを指定…
        </button>
      </div>
      <ResultMessage result={action.result} as="p" className="small" />
    </div>
  );
}

/** 追加した拡張機能の 1 行。指定したフォルダは利用者のものなので一覧から外すだけ、Kickoff が取得・写したものはファイルごと消す */
function AddedExtension({ ext, busy, onRemove }: { ext: BrowserExtensionInfo; busy: ExtensionAction | null; onRemove: (detach: boolean) => void }) {
  const detach = ext.source === "folder";
  const RemoveIcon = detach ? X : Trash2;
  const removing = busy === `remove:${ext.path}`;
  return (
    <li>
      <Puzzle size={14} className="muted" />
      <span className="ext-name">
        {ext.name} {ext.version && <span className="muted small">{ext.version}</span>}
        {ext.error && <span className="ext-error small">読み込めませんでした: {ext.error}</span>}
      </span>
      <span className="badge">{SOURCE_LABELS[ext.source]}</span>
      <button className="btn" data-size="sm" disabled={busy !== null} title={detach ? "一覧から外します（フォルダは消しません）" : "拡張機能のファイルごと消します"} onClick={() => onRemove(detach)}>
        <RemoveIcon size={13} aria-hidden /> {removing ? (detach ? "外しています…" : "削除中…") : detach ? "外す" : "削除"}
      </button>
    </li>
  );
}
