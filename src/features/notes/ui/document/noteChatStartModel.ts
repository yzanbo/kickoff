// ノートの選んだ文から始める新しいチャットの作成先を決める（そのまま開くか、見ているプロジェクトと共通のどちらにするか聞くか）

/** 作成先: そのプロジェクトに開く（open）か、見ているプロジェクト（viewing）と共通（common）のどちらにするか聞く（ask） */
export type NoteChatStart = { kind: "open"; projectId: number } | { kind: "ask"; viewing: { id: number; name: string }; common: number };

/**
 * プロジェクトのノートはそのプロジェクトに開く。共通のノート（noteProjectId は共通の id。共通のチャットの持ち主と同じ見えないプロジェクト）は、
 * 利用者のプロジェクトを見ていれば（viewing）どちらにするか聞き、見ていなければ（共通の画面・全ノートの画面・別ウィンドウ = null）聞かずに共通に開く
 */
export function noteChatStartOf({
  noteProjectId,
  commonNote,
  viewing,
}: {
  noteProjectId: number;
  commonNote: boolean;
  viewing: { id: number; name: string } | null;
}): NoteChatStart {
  if (!commonNote || viewing === null) return { kind: "open", projectId: noteProjectId };
  return { kind: "ask", viewing, common: noteProjectId };
}

/** 聞くときのダイアログの選択肢（左から: 見ているプロジェクト・共通。キャンセルは土台のダイアログが足す） */
export function noteChatStartChoices(viewingName: string): { value: "viewing" | "common"; label: string; primary?: boolean }[] {
  return [
    { value: "viewing", label: `${viewingName} で始める`, primary: true },
    { value: "common", label: "共通で始める" },
  ];
}
