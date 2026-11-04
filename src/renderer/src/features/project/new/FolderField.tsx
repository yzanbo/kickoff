/** フォルダのパスの入力欄（アプリでは「選択…」で Finder から選べる） */
export function FolderField({
  label,
  value,
  onChange,
  pickerTitle,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  pickerTitle: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="input-row">
        <input
          type="text"
          aria-label={label}
          value={value}
          required
          autoFocus={autoFocus}
          placeholder="/Users/you/projects/my-app"
          onChange={(e) => onChange(e.target.value)}
        />
        {window.kickoff && (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const picked = await window.kickoff?.pickFolder(pickerTitle);
              if (picked) onChange(picked);
            }}
          >
            選択…
          </button>
        )}
      </div>
    </div>
  );
}
