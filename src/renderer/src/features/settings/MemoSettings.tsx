import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import { settingsStore, useAppSettings } from "@/stores/settings";
import { MemoFolderField } from "@/features/memo/MemoFolderField";

/** 設定: メモの保存先（親フォルダ。この下にプロジェクトごとのフォルダを作る） */
export function MemoSettings() {
  const settings = useAppSettings().data;
  const defaults = useAsync(() => api.memoDefaults());
  if (!settings) return null;
  return (
    <section className="section">
      <h2>メモ</h2>
      <p className="muted small">
        プロジェクトの「メモ」タブのメモは、プロジェクトの外のこのフォルダに Markdown で保存します。この下に、プロジェクトごとのフォルダを自動で作ります（初めてメモを使ったときのプロジェクト名。あとでプロジェクト名を変えてもフォルダは同じ）。Finder やほかのアプリ（Obsidian など）でも開けます。
      </p>
      <div className="form">
        <MemoFolderField
          label="メモの保存先"
          help="変えても、いまあるメモは動かしません（必要なら Finder で新しい場所へ移してください）。iCloud Drive の中にすると、ほかの Mac・iPhone と同期できます。"
          value={settings.memos_dir}
          fallback={defaults.data?.default_dir ?? ""}
          onSave={async (next) => settingsStore.set(await api.updateSettings({ memos_dir: next }))}
        />
      </div>
    </section>
  );
}
