import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { saveSettings, useAppSettings } from "@/foundation/ui/settings/appSettings";
import { useNoteDefaults } from "@/features/notes/ui/commonNotes";
import { NoteFolderField } from "./NoteFolderField";

/** 設定: ノートの保存先（親フォルダ。この下にプロジェクトごとのフォルダを作る）と、共通のノートのフォルダ */
export function NoteSettings() {
  const settings = useAppSettings().data;
  // 既定の場所と共通のノートの様子（設定を保存すると知らせで読み直すので、使えない理由もそろう）
  const defaults = useNoteDefaults();
  if (!settings) return null;
  const commonDefault = defaults?.common_default_dir ?? "";
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
          fallback={defaults?.default_dir ?? ""}
          onSave={(next) => saveSettings({ notes_dir: next })}
        />
        <NoteFolderField
          label="共通のノートのフォルダ"
          help={`どのプロジェクトにも属さないノート（全ノートの画面の「共通のノート」）を置くフォルダです。空のときは既定の場所（${commonDefault || "ノートの保存先の下の _common"}）を使います。変えても、いまある共通のノートは動かしません（必要なら Finder で新しい場所へ移してください）。`}
          value={settings.common_notes_dir}
          fallback={commonDefault}
          onSave={(next) => saveSettings({ common_notes_dir: next })}
        />
        {/* 使えない理由（ほかのプロジェクトのフォルダと重なったなど）は、ここで場所を選び直せば直せるので、この節にも出す */}
        <ErrorText message={defaults?.common_unavailable?.message} />
      </div>
    </section>
  );
}
