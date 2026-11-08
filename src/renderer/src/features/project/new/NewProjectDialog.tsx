import { useState } from "react";
import type { Project } from "@shared/types";
import { useModalDialog } from "@/hooks/useModalDialog";
import { Segmented } from "@/ui/Segmented";
import { CreateForm } from "./CreateForm";
import { ImportForm } from "./ImportForm";
import type { NewProjectMode } from "./openNewProject";

interface Props {
  defaultParentDir: string;
  /** 名前の欄の初めの値 */
  initialName?: string;
  /** 初めに開く作り方（省けば新しく作る） */
  initialMode?: NewProjectMode;
  onClose: () => void;
  onCreated: (project: Project) => void;
}

type Mode = NewProjectMode;

/** 新しいプロジェクト（新規作成 / 既存フォルダの取り込み。作り方を切り替えても、閉じるまでそれぞれの入力を残す） */
export function NewProjectDialog({ defaultParentDir, initialName, initialMode = "create", onClose, onCreated }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
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
        {/* 2 つの作り方は、どちらも置いたまま隠すだけにする（切り替えても、ダイアログを閉じるまで書いたものを残す） */}
        <div hidden={mode !== "create"}>
          <CreateForm defaultParentDir={defaultParentDir} initialName={initialName} onCancel={close} onCreated={onCreated} />
        </div>
        <div hidden={mode !== "import"}>
          <ImportForm onCancel={close} onCreated={onCreated} />
        </div>
      </div>
    </dialog>
  );
}

export interface FormProps {
  onCancel: () => void;
  onCreated: (project: Project) => void;
}
