import { Field } from "@/foundation/ui/kit/Field";
import { inDesktopApp } from "@/foundation/ui/lib/desktopApp";
import { pickFolder } from "@/features/projects/ui/native";

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
    <Field as="div" label={label}>
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
        {inDesktopApp() && (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const picked = await pickFolder(pickerTitle);
              if (picked) onChange(picked);
            }}
          >
            選択…
          </button>
        )}
      </div>
    </Field>
  );
}
