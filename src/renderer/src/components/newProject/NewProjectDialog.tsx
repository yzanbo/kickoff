import { useEffect, useRef, useState } from "react";
import type { Project } from "../../../../core/types";
import { CreateForm } from "./CreateForm";
import { ImportForm } from "./ImportForm";

interface Props {
  defaultParentDir: string;
  onClose: () => void;
  onCreated: (project: Project) => void;
}

type Mode = "create" | "import";

/** 新しいプロジェクト（新規作成 / 既存フォルダの取り込み） */
export function NewProjectDialog({ defaultParentDir, onClose, onCreated }: Props) {
  const [mode, setMode] = useState<Mode>("create");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const close = () => dialogRef.current?.close();

  return (
    <dialog ref={dialogRef} className="dialog" onClose={onClose}>
      <div className="dialog-body">
        <h2>新しいプロジェクト</h2>
        <div className="segmented" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "create"}
            className={mode === "create" ? "active" : ""}
            onClick={() => setMode("create")}
          >
            新しく作る
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "import"}
            className={mode === "import" ? "active" : ""}
            onClick={() => setMode("import")}
          >
            既存のフォルダを取り込む
          </button>
        </div>
        {mode === "create" ? (
          <CreateForm defaultParentDir={defaultParentDir} onCancel={close} onCreated={onCreated} />
        ) : (
          <ImportForm onCancel={close} onCreated={onCreated} />
        )}
      </div>
    </dialog>
  );
}

export interface FormProps {
  onCancel: () => void;
  onCreated: (project: Project) => void;
}
