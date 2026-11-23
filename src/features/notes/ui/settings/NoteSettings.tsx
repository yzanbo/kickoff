import { notesApi } from "@/features/notes/ui/api";
import { useQuery } from "@/foundation/ui/query";
import { saveSettings, useAppSettings } from "@/features/settings/ui";
import { NoteFolderField } from "./NoteFolderField";

/** 設定: ノートの保存先（親フォルダ。この下にプロジェクトごとのフォルダを作る） */
export function NoteSettings() {
  const settings = useAppSettings().data;
  const defaults = useQuery("NoteSettings.defaults", () => notesApi("GET /api/notes/defaults"));
  if (!settings) return null;
  return (
    <section className="section">
      <h2>ノート</h2>
      <p className="muted small">
        プロジェクトの「ノート」タブのノートは、プロジェクトの外のこのフォルダに Markdown で保存します。この下に、プロジェクトごとのフォルダを自動で作ります（初めてノートを使ったときのプロジェクト名。あとでプロジェクト名を変えてもフォルダは同じ）。Finder やほかのアプリ（Obsidian など）でも開けます。
      </p>
      <div className="form">
        <NoteFolderField
          label="ノートの保存先"
          help="変えても、いまあるノートは動かしません（必要なら Finder で新しい場所へ移してください）。iCloud Drive の中にすると、ほかの Mac・iPhone と同期できます。"
          value={settings.notes_dir}
          fallback={defaults.data?.default_dir ?? ""}
          onSave={(next) => saveSettings({ notes_dir: next })}
        />
      </div>
    </section>
  );
}
