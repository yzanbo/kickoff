// 利用者が見ている画面の中身を AI に説明する口（AI の get_user_view が集める）: 画面の持ち主が ui/contributes.ts で viewDescribers.item({ view, describe }) を出し、
// 集める側（userView）が viewDescriber(view) で引く。説明の形は集める側が declare module "@/foundation/ui/shell/viewDescribers" で ViewDescriptionMap に足す
import { definePoint } from "@/foundation/ui/points";

/** 説明の形の表（集める側が足す。値の型が説明の形） */
export interface ViewDescriptionMap {}
/** 画面 1 つの説明 */
export type ViewDescription = ViewDescriptionMap[keyof ViewDescriptionMap];

/** どこに開いている画面か（surface は画面の置き場所の名前: プロジェクトのタブ project-<ID>・チャットの右の欄と別ウィンドウ chat-<ID>） */
export interface ViewAt {
  projectId: number;
  surface: string;
}

/** 画面 1 つの説明の作り方（view はプロジェクトの画面の名前: "db"・"github"） */
export interface ViewDescriber {
  view: string;
  describe(at: ViewAt): ViewDescription;
}

/** 画面の説明の拡張点（key は view） */
export const viewDescribers = definePoint<ViewDescriber>("viewDescribers", { key: (d) => d.view });

/** 画面の説明（説明の持ち主がいなければ null） */
export const describeView = (view: string, at: ViewAt): ViewDescription | null => viewDescribers.items().find((d) => d.view === view)?.describe(at) ?? null;
