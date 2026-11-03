import { useState } from "react";
import type { Project } from "../../../../core/types";
import { useModalDialog } from "../../hooks/useModalDialog";
import { Segmented } from "../Segmented";
import { CreateForm } from "./CreateForm";
import { ImportForm } from "./ImportForm";

interface Props {
  defaultParentDir: string;
  /** 名前の欄の初めの値 */
  initialName?: string;
  onClose: () => void;
  onCreated: (project: Project) => void;
}

type Mode = "create" | "import";

/** 新しいプロジェクト（新規作成 / 既存フォルダの取り込み） */
export function NewProjectDialog({ defaultParentDir, initialName, onClose, onCreated }: Props) {
  const [mode, setMode] = useState<Mode>("create");
  // 入力の途中で閉じないよう、背景を押しても閉じない
  const { ref, close } = useModalDialog({ closeOnBackdrop: false });

  return (
    <dialog ref={ref} className="dialog" onClose={onClose}>
      <div className="dialog-body">
        <h2>新しいプロジェクト</h2>
        <Segmented<Mode>
          className="segmented"
          label="作り方"
          value={mode}
          onChange={setMode}
          options={[
            { value: "create", label: "新しく作る" },
            { value: "import", label: "既存のフォルダを取り込む" },
          ]}
        />
        {mode === "create" ? (
          <CreateForm defaultParentDir={defaultParentDir} initialName={initialName} onCancel={close} onCreated={onCreated} />
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
