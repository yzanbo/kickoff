// 利用者が見ているものの zod の形（画面の知らせ PUT /api/user-view と、送る指示に添えた送った時点の様子。型は @shared/userView/types）
import { z } from "zod";
import { USER_VIEW_TEXT_MAX, type UserView, type UserViewBody, type UserViewTab } from "@shared/userView/types";

/** 画面の文字（名前・パス・URL など。長すぎるものは断る） */
const viewText = z.string().max(4000);
const viewProject = { project_id: z.number().int().positive().optional() };
/** 画面のタブ 1 つの中身（利用者が見ているもの。AI の get_user_view） */
const userViewTabSchema = z.union([
  z.object({ kind: z.literal("chat"), chat_id: z.number().int().positive(), title: viewText, ...viewProject }),
  z.object({ kind: z.literal("child_chat"), chat_id: z.number().int().positive(), title: viewText, ...viewProject }),
  z.object({ kind: z.literal("new_chat"), ...viewProject }),
  z.object({ kind: z.literal("subagent"), title: viewText, ...viewProject }),
  z.object({
    kind: z.literal("editor"),
    path: viewText,
    worktree: viewText.nullable(),
    line: z.number().int().positive().nullable(),
    selection: z.object({ from_line: z.number().int(), from_column: z.number().int(), to_line: z.number().int(), to_column: z.number().int() }).nullable(),
    ...viewProject,
  }),
  z.object({ kind: z.literal("changes"), worktree: viewText.nullable(), focus: viewText.nullable(), ...viewProject }),
  z.object({ kind: z.literal("note"), path: viewText, selected_text: z.string().max(USER_VIEW_TEXT_MAX * 2).nullable(), ...viewProject }),
  z.object({ kind: z.literal("browser"), url: viewText, title: viewText, ...viewProject }),
  z.object({ kind: z.literal("github"), item: z.object({ kind: z.enum(["issue", "pr"]), number: z.number().int().positive() }).nullable(), ...viewProject }),
  z.object({ kind: z.literal("database"), connection: viewText.nullable(), table: viewText.nullable(), ...viewProject }),
  z.object({ kind: z.literal("terminal"), label: viewText, ...viewProject }),
  z.object({ kind: z.literal("page"), label: viewText, ...viewProject }),
]) satisfies z.ZodType<UserViewTab>;
/** 利用者が見ているもの（1 つのウィンドウ。ペインと右の欄は 30 まで） */
export const userViewSchema = z.object({
  project_id: z.number().int().positive().nullable(),
  panes: z.array(z.object({ area: viewText, tab: userViewTabSchema.nullable() })).max(30),
  side: z.array(userViewTabSchema).max(30),
}) satisfies z.ZodType<UserView>;

/** 見ているものの知らせ（ウィンドウごと。閉じるときは view を null） */
export const userViewBodySchema = z.object({
  window_id: z.string().min(1).max(100),
  view: userViewSchema.nullable(),
  chat_ids: z.array(z.number().int().positive()).max(200),
  focused: z.boolean(),
}) satisfies z.ZodType<UserViewBody>;
