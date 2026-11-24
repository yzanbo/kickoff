// グループ（チャットを自分でまとめる。プロジェクトごと）

/** チャットを自分でまとめるグループ（プロジェクトごと） */
export interface ChatGroup {
  id: number;
  project_id: number;
  name: string;
  /** 並び順（小さいほど上・左） */
  position: number;
  /** 色（色相。プロジェクトの色と同じ 10 色から、同じプロジェクトのほかのグループと被らない色を作ったときに選ぶ。右のパネルのタブのまとまりの色） */
  hue: number;
  created_at: string;
}
