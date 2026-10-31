import { CalendarDays, Code2, FileText, FlaskConical, Rocket, type LucideIcon } from "lucide-react";
import type { ArtifactKind, Phase } from "../../core/types";

/**
 * セクションの見た目と説明（アイコン・色・ラベル）。
 * 色はセクションの区別用。色だけに頼らないよう、必ずアイコンとラベルと一緒に表示する。
 */
export const SECTION_META: Record<Phase, { label: string; short: string; icon: LucideIcon; description: string; placeholder: string }> = {
  requirements: {
    label: "要件定義",
    short: "要件",
    icon: FileText,
    description: "作りたいものを AI と詰めて、要件定義書にまとめます",
    placeholder: "例: アイデアをもとに要件定義を進めて",
  },
  schedule: {
    label: "スケジュール",
    short: "予定",
    icon: CalendarDays,
    description: "マイルストーンと予定日を AI と相談します",
    placeholder: "例: 1 か月で公開するスケジュールを立てて",
  },
  implementation: {
    label: "実装",
    short: "実装",
    icon: Code2,
    description: "タスクを AI に実装してもらいます",
    placeholder: "例: タスク #1 を実装して",
  },
  testing: {
    label: "テスト",
    short: "テスト",
    icon: FlaskConical,
    description: "テストの作成・実行と受け入れ基準の確認",
    placeholder: "例: 受け入れ基準に沿ってテストを書いて実行して",
  },
  deployment: {
    label: "デプロイ",
    short: "デプロイ",
    icon: Rocket,
    description: "手順を確認しながらデプロイします（コマンドはすべて承認制）",
    placeholder: "例: 要件定義書のデプロイ方法でデプロイして",
  },
};

/** 成果物タブに出す種類 */
export const REPORT_KINDS: ArtifactKind[] = ["test_report", "deploy_log", "design", "note"];
