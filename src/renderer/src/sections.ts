import type { ArtifactKind, Phase } from "../../core/types";

/** 各セクションで AI が何をするか（画面の説明文） */
export const SECTION_DESCRIPTIONS: Record<Phase, string> = {
  requirements: "作りたいものを AI と話して、要件定義書にまとめます。タスク分解もここで頼めます。",
  schedule: "マイルストーンや予定日を AI と相談して、スケジュールにまとめます。",
  implementation: "タスクを AI に実装してもらいます。",
  testing: "テストの作成・実行や、受け入れ基準の確認を AI と進めます。",
  deployment: "デプロイ手順を AI と確認して実行します（コマンドはすべて承認制）。",
};

/** 新しいチャットの入力欄に出す例 */
export const SECTION_PLACEHOLDERS: Record<Phase, string> = {
  requirements: "例: アイデアをもとに要件定義を進めて",
  schedule: "例: 要件定義書とタスクをもとに、1 か月で公開するスケジュールを立てて",
  implementation: "例: タスク #1 を実装して",
  testing: "例: 受け入れ基準に沿ってテストを書いて実行して",
  deployment: "例: 要件定義書のデプロイ方法でデプロイして",
};

/** セクションに表示する成果物の種類 */
export const SECTION_ARTIFACTS: Record<Phase, ArtifactKind[]> = {
  requirements: ["requirements", "design"],
  schedule: ["schedule"],
  implementation: ["design", "note"],
  testing: ["test_report"],
  deployment: ["deploy_log"],
};

/** セクションに表示するタスクのフェーズ（要件定義・スケジュールはタスク全体の状況を見たいので全件） */
export const SECTION_TASKS: Record<Phase, Phase[] | "all"> = {
  requirements: "all",
  schedule: "all",
  implementation: ["implementation"],
  testing: ["testing"],
  deployment: ["deployment"],
};
