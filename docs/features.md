# Kickoff 機能の一覧

最後に一覧を確かめたコミット: ecb7d718
列: ID・機能・持ち主（機能のフォルダの名前。土台は `土台:core` / `土台:ui` / `土台:desktop` / `土台:shared`、組み立ては `app`、スマホは `mobile`、道具は `道具`）・確かめ方（`T:<テストのファイルの名前>` / `E:<通しの確かめの名前>` / `M`（手で見る））。（一部）は一部だけ作ってあるもの。

## PRJ プロジェクト

### 作る・取り込む
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| PRJ-001 | 新しいプロジェクトを作る | projects | M |
| PRJ-002 | 既存のフォルダを取り込む | projects | M |
| PRJ-003 | プロジェクトがないときの案内 | projects | M |

### プロジェクトの画面
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| PRJ-004 | タブ（ボード・チャット・ファイルなど）で切り替える | projects | M |
| PRJ-005 | タブの置き方・並びを変える | projects | M |
| PRJ-006 | 見出しの行の出し方を選ぶ | projects | M |
| PRJ-007 | 見出しの名前でプロジェクトを切り替える | projects | M |
| PRJ-008 | 状態ごとの数からチャットの一覧を開く | projects | M |

### 整理
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| PRJ-009 | プロジェクトを固定・アーカイブする | projects | T:projectOrder |
| PRJ-010 | プロジェクトの右クリックメニュー | projects | M |
| PRJ-011 | タグを付け外し・名前変更・削除する | projects | M |
| PRJ-012 | タグでプロジェクトを絞り込む | sidebar | M |

### プロジェクトの設定
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| PRJ-013 | 名前・概要・色・ノートのフォルダを変える | projects | M |
| PRJ-014 | プロジェクトのフォルダを変える | projects | M |
| PRJ-015 | git の管理を始める | projects | M |
| PRJ-016 | 参照資料（AI が読むフォルダ・ファイル）を足す | projects | M |
| PRJ-017 | 使う AI と既定（モデルなど）を選ぶ | projects | M |
| PRJ-018 | GitHub のアカウント・連携先を選ぶ | projects | M |
| PRJ-019 | プロジェクトを削除する | projects | M |

### プロジェクトにするフォルダ
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| PRJ-020 | Git で管理しないフォルダをプロジェクトにする（ファイル・検索は使える） | projects | M |
| PRJ-021 | リポジトリの中のフォルダをプロジェクトにする（Git の操作はそのフォルダの中だけ） | projects | M |

## LST 一覧と画面の構成

### サイドバー
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| LST-001 | サイドバーを開閉し、幅を変える | sidebar | M |
| LST-002 | 作成先の札付きの「新しいチャット」 | sidebar | M |
| LST-003 | プロジェクトを縦並び・スライドで並べる | sidebar | M |
| LST-004 | スワイプ・丸・キーでプロジェクトを切り替える | sidebar | M |
| LST-005 | プロジェクトの並び順を選び、ドラッグで並べ替える | sidebar | M |
| LST-006 | プロジェクトのカードで開閉し、状態で絞る | sidebar | M |
| LST-007 | チャットを名前と中身で探す | sidebar | M |
| LST-008 | チャットのまとめ方と並び順を選ぶ | chatList | M |
| LST-009 | 行の 1 行 / 2 行・見出しの色を選ぶ | sidebar | M |
| LST-010 | チャットの行で開き、状態と経過時間を見る | sidebar | M |
| LST-011 | アーカイブ済みを出す・ドラッグでアーカイブ | sidebar | M |

### 要対応とビュー
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| LST-012 | 要対応のチャットを上にまとめて出す | sidebar | M |
| LST-013 | ビューのタブで見え方を切り替える | sidebar | M |
| LST-014 | 見え方を調整してビューに保存する | sidebar | M |

### グループ
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| LST-015 | グループを作る・名前を変える・消す | groups | M |
| LST-016 | グループと No Group を並べ替える | groups | T:groups |
| LST-017 | チャットをドラッグでグループへ移す | groups | T:groups,E:sidebar-drag |
| LST-018 | グループを選んで新しいチャットを始める | groups | M |

### チャットの操作
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| LST-019 | 右クリックで同じ場所に新しいチャット | chat | M |
| LST-020 | チャットの名前をその場で変える | chat | M |
| LST-021 | チャットの名前を自動で付ける | chat | M |
| LST-022 | 既読 / 未読・固定・セッション ID のコピー | chatList | M |
| LST-023 | グループを変える（新しいグループも） | chatList | M |
| LST-024 | チャットを別のプロジェクトへ移す | chat | M |
| LST-025 | アーカイブ・戻す・削除（必ず確かめる） | chat | M |
| LST-026 | 右・下に分けて開く | chatList | M |
| LST-027 | いくつも選んでまとめて操作する | chatList | E:sidebar-range |

### 状態と未読
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| LST-028 | 作業中・回答待ち・未読・失敗の印 | chat | M |
| LST-029 | いまの作業を短い文で出す | chat | M |
| LST-030 | 返答・完了・失敗で未読にする | chat | M |
| LST-031 | 終わったチャットを自動でアーカイブ | chat | M |

### 下書き
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| LST-032 | 送る前のチャットを下書きとして並べる | chatPanel | M |
| LST-033 | 下書きの名前・固定・グループ・プロジェクトを変える | chatPanel | M |

### ボード
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| LST-034 | 全プロジェクトのボードを見る | board | M |
| LST-035 | プロジェクトのボードをカンバンで見る | board | M |
| LST-036 | ボード・リスト・フィードを切り替える | board | E:board-view |
| LST-037 | 列の分け方（状態・グループ）を選ぶ | board | M |
| LST-038 | 段（スイムレーン）に分ける | board | M |
| LST-039 | カードに出す項目を選ぶ | board | M |
| LST-040 | 並び順を選ぶ | board | M |
| LST-041 | 見え方をビューに保存する | board | M |
| LST-042 | 名前・アーカイブ・作業場所で絞り込む | board | M |
| LST-043 | 既読をまとめてアーカイブする | board | M |
| LST-044 | カードを開く・名前を変える・右クリック | board | M |

### 欄とパネル
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| LST-045 | チャットを開く場所を選ぶ | projects | M |
| LST-046 | ボードの右のパネルを開閉し、幅を変える | chatPanel | M |
| LST-047 | 画面の右端の右サイドバー（ブラウザ） | projects | M |
| LST-048 | 下のパネル（ターミナル） | terminal | M |
| LST-049 | 右上のボタンで欄を開閉する | app | M |
| LST-050 | 欄を全体表示したときも、上の行にプロジェクトの見出しを出す | 土台:ui | M |

### タブ
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| LST-051 | チャットのタブをサイドバーと連動させる | chatPanel | T:linkedTabs |
| LST-052 | 新しいタブ（チャット・ブラウザ・ターミナル） | panel | M |
| LST-053 | タブの ✕ で閉じ方を選ぶ | chat | M |
| LST-054 | タブの右クリック・名前の変更 | panel | M |
| LST-055 | 「表示」のメニューでタブの見せ方を選ぶ | panel | M |
| LST-056 | タブをグループ別・作業場所別にまとめる | chatPanel | M |
| LST-057 | まとまりの札から一覧・畳む・隠す | chatPanel | M |
| LST-058 | ペインに分けて並べる | panel | E:pane-split |

### 右の欄と別ウィンドウ
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| LST-059 | チャットの右の欄にタブを開く | chatPanel | M |
| LST-060 | 右の欄のタブの中を探す | chatPanel | M |
| LST-061 | 右の欄のタブを別ウィンドウで開く | app | M |
| LST-062 | 別ウィンドウから元のチャットへ足す | 土台:ui | M |
| LST-063 | タブをウィンドウの外へドラッグして別ウィンドウで開く | panel | T:tabDragOut |
| LST-064 | チャットのパネルのチャットを別ウィンドウ（タブの列つき）で開く | panel | T:tabTransfer |
| LST-065 | ブラウザ・ターミナルのタブを別ウィンドウで開く | panel | M |
| LST-066 | 左のサイドバーを別ウィンドウで開く | 土台:ui | T:popoutNavigation |

### 探す・移る
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| LST-067 | ⌘K でプロジェクト・チャット・ノートへ移る | palette | E:palette-open |
| LST-068 | ⌘K でチャット・ノートの文言を探す | palette | M |
| LST-069 | やり取りを全文検索する | palette | M |
| LST-070 | ⌘⇧A で作業中・回答待ちのチャットを一覧する | chatList | M |
| LST-071 | 前に見た画面・チャットへ戻る・進む | 土台:ui | M |
| LST-072 | ⌘F・⌘⇧F・⌘L で探す・ピントを移す | app | E:board-find |
| LST-073 | ドラッグ中に欄の端でスクロールする | 土台:ui | M |

### 右サイドバー
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| LST-074 | 右端のアイコンの列で、ブラウザ・ノート・ファイル・検索・変更・履歴・GitHub・CI・DB・Docker・ゴミ箱を切り替える | projects | M |
| LST-075 | 開いている中身のアイコンを押し直して閉じる（閉じても列は残る） | projects | M |
| LST-076 | 列の並びをプロジェクトのタブの並びに合わせる | projects | M |
| LST-077 | 見ていた中身をプロジェクトごとに、開いたもの・選んだものを中身ごとに覚える | projects | M |
| LST-078 | ファイル・検索・変更・履歴が、真ん中のチャットの作業場所に付いていく（開いたファイルのタブは作業場所ごとに覚える） | projects | M |
| LST-079 | 右サイドバーを列ごと別ウィンドウへ移し、メインの窓の列から中身を切り替える | projects | M |
| LST-080 | ほかから開くとき、右サイドバーがその中身を出していれば右サイドバーで開く | projects | M |
| LST-081 | チャットの右の欄で CI・Docker・ゴミ箱を開く | chatPanel | M |

## CHT チャットの画面

### 見出しと表示
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| CHT-001 | 見出しのバッジ（プロジェクト・グループ・作業場所） | conversation | M |
| CHT-002 | 親のないチャットの見出しに名前を出す | conversation | M |
| CHT-003 | 見出しに出す項目を選んで並べ替える | conversation | T:chatHeaderItems |
| CHT-004 | タブの列・見出しの行・指示の帯を隠す | conversation | M |
| CHT-005 | 会話の横幅を広げる | conversation | M |
| CHT-006 | 会話の文字の大きさを 5 段階で変える | conversation | M |
| CHT-007 | チャット欄をコンパクトにする | composer | M |

### 流れ
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| CHT-008 | 書いている途中の返答を少しずつ出す | conversation | M |
| CHT-009 | 長いチャットは見えている所だけ描く | conversation | M |
| CHT-010 | 開くときは最新の分だけ読み、上へ戻ると前を読み足す | chat | T:chatStore |
| CHT-011 | 最近のチャットを先読みする | chat | T:chatStore |
| CHT-012 | 極端に長い作業の変更カードを、頭を読み終えてから出す | conversation | T:timelineItems |
| CHT-013 | 返答のコードブロックに文法の色を付ける | 土台:ui | T:highlightPool |
| CHT-014 | 一番下へ戻るボタン（いまの様子つき） | conversation | M |
| CHT-015 | 一番下まで見たら既読にする | conversation | M |
| CHT-016 | 思考の行（考えた時間と中身） | conversation | M |
| CHT-017 | 作業の終わりの行（かかった時間・失敗） | conversation | M |
| CHT-018 | 発言へなめらかに移って強調する | conversation | M |
| CHT-019 | 自分の発言のたたみ・時刻・コピー | conversation | M |
| CHT-020 | 質問への回答・圧縮前後の指示に札を付ける | conversation | M |
| CHT-021 | 費用・ターン数・コンテキスト量を記録する | chat | M |

### ツールの表示
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| CHT-022 | ツールの呼び出しをまとめて文で出す | conversation | M |
| CHT-023 | コマンドと出力を色付きで出す | conversation | M |
| CHT-024 | 読む・検索・編集の中身を見やすく出す | conversation | M |
| CHT-025 | ツールの結果の画像を出す（一部） | conversation | M |
| CHT-026 | 作業ごとの変更カード（ファイル・行数） | conversation | M |
| CHT-027 | 返答のファイルを押して開く | files | M |
| CHT-028 | ファイルの右クリック（外で開く・コピー） | files | M |

### 作業中の様子
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| CHT-029 | 作業中の行（段階の文と経過時間） | conversation | M |
| CHT-030 | 作業中の行に今回の実行の選択を出す | conversation | M |
| CHT-031 | 長く動きのない作業を知らせる | chat | T:stall |
| CHT-032 | ToDo のピルと一覧 | conversation | M |
| CHT-033 | コンテキストの使用率メーター | compact | M |

### 指示
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| CHT-034 | 読んでいる返答の元の指示を上に出す | conversation | M |
| CHT-035 | 指示の履歴から移る・入力欄に入れる | conversation | M |
| CHT-036 | 前後の指示へ移る | conversation | M |

### 検索と文の操作
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| CHT-037 | チャットの中を探す | conversation | M |
| CHT-038 | 文の右クリック（コピー・追加・ノート・issue） | conversation | M |

### 動き
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| CHT-039 | すべてのエージェントの動きを時系列で見る | conversation | M |
| CHT-040 | 動きを絞る・あるエージェントを強調する | conversation | M |

### 図と数式
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| CHT-041 | 返答の数式を KaTeX で描く | 土台:ui | M |
| CHT-042 | 返答の中に図を描く（SVG・HTML・Mermaid） | visuals | M |
| CHT-043 | 図の中のボタンからチャットに送る | visuals | M |
| CHT-044 | 返答の途中でも書き終えた Mermaid の図を描く | 土台:ui | M |

### 画像とリンク
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| CHT-045 | 返答の手元の画像を表示する | remoteImages | M |
| CHT-046 | 外の画像をホストごとのボタンで表示する | remoteImages | T:server.chatImages |
| CHT-047 | 画像の表示を許可したサイトを外す | remoteImages | M |
| CHT-048 | リンクの開き先を選ぶ | remoteImages | M |
| CHT-049 | 外部リンクを開く前に確かめる | 土台:ui | M |
| CHT-050 | 地図を Kickoff のブラウザで開く案内 | browser | M |

## RUN 送る・実行する

### 送る
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| RUN-001 | 指示を送ってすぐ動かす | chat | T:runner |
| RUN-002 | Enter で送る・書きかけを残す | composer | M |
| RUN-003 | ↑↓ で前に送った発言を呼び出す | composer | M |
| RUN-004 | / でコマンド・@ でファイルの候補 | composer | M |
| RUN-005 | もう一度送る（同じ文と添付） | conversation | M |
| RUN-006 | 新しいチャットで作成先を選んで始める | chatPanel | M |
| RUN-007 | 選んだ文を新しいチャットで聞く | conversation | M |

### 選択
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| RUN-008 | モデル・推論の深さを選ぶ | ai | M |
| RUN-009 | 権限モード・ファストモードを選ぶ | ai | M |
| RUN-010 | チャットごとに AI を選ぶ | ai | T:ProviderChips |
| RUN-011 | チャットの途中で AI を替えて会話を続ける | providerSwitch | T:providerSwitch |
| RUN-012 | AI を替えた区切りと、返答ごとの担当 AI を出す | providerSwitch | T:ProviderSwitchRecord |
| RUN-013 | AI ごとのセッションを持ち、前の AI に戻したら続きから | chat | T:chatProviderSessions |
| RUN-014 | 引き継ぎに失敗したら元の指示を残して直す | providerSwitch | M |
| RUN-015 | その AI にない機能を理由付きで押せない形にする | ai | T:server.providerAuth |

### 作業中
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| RUN-016 | 作業中は いま / あとで を選んで送る | composer | M |
| RUN-017 | 作業を中断する | chat | T:runner |
| RUN-018 | 裏の作業の一覧から 1 つずつ止める | conversation | M |

### 承認と質問
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| RUN-019 | ツールの実行を承認・拒否する | conversation | M |
| RUN-020 | AI からの質問に答える | conversation | M |
| RUN-021 | 「その他」に文・添付・音声で答える | conversation | M |
| RUN-022 | 止まった作業を再開するか確かめる | conversation | M |

### 送信待ち
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| RUN-023 | 「あとで」で送信待ちに入れる | chat | M |
| RUN-024 | 送信待ちの一覧を入力欄の上に出す | queue | E:queue-list |
| RUN-025 | 1 件をすぐ送る・消す・上下へ動かす | queue | M |
| RUN-026 | 送信待ちを書き直す | queue | M |
| RUN-027 | ドラッグで並べ替える | queue | M |
| RUN-028 | 選んだ指示をまとめて送る・消す・1 つにまとめる | queue | M |
| RUN-029 | 自動で送る / 止めています を切り替える | chat | T:outbox |
| RUN-030 | すべて送る（まとめて 1 件 / 1 件ずつ順に） | queue | M |
| RUN-031 | 一時停止の印を挟む | chat | T:outbox,E:queue-list |
| RUN-032 | 質問として送る（答えのあと一時停止） | chat | M |
| RUN-033 | 会話の圧縮・コンテキストの消去を挟む | chat | T:outbox |
| RUN-034 | 新しいチャット・子チャットで聞く / 移す | queue | M |
| RUN-035 | 再起動しても送信待ちを残す | chat | T:outbox |
| RUN-036 | 起動したときに、前回の終了で止まったチャットを確かめる（再開の確かめ） | queue | M |

### 圧縮と消去
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| RUN-037 | 会話を圧縮する | chat | T:runner |
| RUN-038 | 自動圧縮を始める使用率を選ぶ | compact | M |
| RUN-039 | 圧縮前指示・圧縮後指示を書く | compact | M |
| RUN-040 | 圧縮の前に圧縮前指示を送る | ai | T:preCompact |
| RUN-041 | 圧縮のあとに圧縮後指示を先に送る | chat | T:runner |
| RUN-042 | 圧縮中に送った指示を預かってあとで送る | compact | M |
| RUN-043 | 圧縮中の行と圧縮の記録 | compact | M |
| RUN-044 | コンテキストを消去する | chat | T:runner |

### 再接続と再開
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| RUN-045 | 通信が切れたら自動で再開する | chat | M |
| RUN-046 | 使用枠が戻ったら再開するか聞く | chat | M |
| RUN-047 | 終了で止まった作業を、起動したときに続けられる | chat | T:restartMoments |
| RUN-048 | 落ちて終わった作業の終わりを、起動したときに記録する | chat | T:result |

### 巻き戻しと分岐
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| RUN-049 | 書き直して送り直す | conversation | M |
| RUN-050 | ファイルだけ発言の前に戻す | chat | T:rewind |
| RUN-051 | ここから分岐する | childChats | M |

### 失敗の直し方
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| RUN-052 | 失敗した作業を続きから再試行 | conversation | M |
| RUN-053 | 深さを下げて再試行 | conversation | M |
| RUN-054 | 別のモデルで再試行 | conversation | M |
| RUN-055 | 巻き戻して再試行 | conversation | M |

### AI への指示と環境
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| RUN-056 | 共通の指示と承認の要らないコマンドを渡す | chat | T:policy |
| RUN-057 | 参照資料・ノートのフォルダを AI に読ませる | chat | M |
| RUN-058 | ポート・GitHub のアカウントを AI の実行に渡す | chat | M |

### ほかの AI と自動化
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| RUN-059 | Codex で動かす | ai | T:provider |
| RUN-060 | GitHub Copilot で動かす（一部） | ai | T:provider |
| RUN-061 | Cursor・Gemini（Antigravity）で動かす（一部） | ai | T:provider |

### 長いチャット
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| RUN-062 | 圧縮した長いチャットを、直近の区切りだけの新しいセッションに乗り換える（画面の会話は残る） | chat | M |

## SUB サブエージェント・子チャット

### サブエージェント
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| SUB-001 | 流れの中のサブエージェントのカード | subagents | M |
| SUB-002 | 「サブエージェント n 件」のピルと一覧 | subagents | M |
| SUB-003 | 右の欄・別ウィンドウで見る | conversation | M |
| SUB-004 | 状態・入れ子・色で見分ける | subagents | T:subagentTree |
| SUB-005 | メインエージェント経由で伝える | subagents | M |
| SUB-006 | サブエージェントのことを子チャットで聞く | childChats | M |
| SUB-007 | 止まったサブエージェントを再開・やり直す | subagents | M |
| SUB-008 | 動きのないサブエージェントを止める | subagents | M |
| SUB-009 | 届かなかった報告を次の指示に添える | subagents | T:reports |
| SUB-010 | 裏で動いたものの終わりを 1 行で出す | subagents | M |

### 子チャット
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| SUB-011 | 選んだ文・発言を新しい子チャットで聞く | conversation | M |
| SUB-012 | 子チャットを作成する（右クリック・＋） | chatList | M |
| SUB-013 | 送信の ▾ から新規の子チャットに送る | conversation | M |
| SUB-014 | 親の会話を引き継ぐか選ぶ | childChats | M |
| SUB-015 | 引き継いで開く（聞かずに作る） | childChats | M |
| SUB-016 | 親子の関係を AI に伝える | childChats | T:context |
| SUB-017 | 子チャットを右の欄・別ウィンドウで開く | chat | M |
| SUB-018 | 上の帯に親までの系譜と深さを出す | childChats | M |
| SUB-019 | 聞いた発言の下に子チャットの札 | childChats | M |
| SUB-020 | 「子チャット n 件」のピルと一覧 | childChats | M |
| SUB-021 | タブ・一覧に子チャットの印と深さの札 | childChats | M |
| SUB-022 | サイドバーで親の下に子チャットを出す | sidebar | M |
| SUB-023 | 子孫ごとアーカイブ・移す・消す | chat | M |
| SUB-024 | 子チャットを親から外す（親なし・先祖の子に） | childChats | M |

### 親に渡す
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| SUB-025 | 作業の答えを親チャットに追加する | childChats | M |
| SUB-026 | 親への依頼文を作ってもらう | childChats | M |
| SUB-027 | 最新の答えを引用して親の入力欄に入れる | childChats | M |
| SUB-028 | 出どころの札と、渡したことの印 | childChats | M |

## ATT 添付・定型文・AI に渡す

### 添付
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| ATT-001 | ファイルを添付する（📎・ドロップ・貼り付け） | composer | M |
| ATT-002 | 添付の画像を大きく見る | attachments | M |
| ATT-003 | ノート・「AI に渡す」の札を開いて見る | attachments | M |
| ATT-004 | 添付を 1 行にまとめて見せる | attachments | M |
| ATT-005 | ほかのチャットを参照して添える | composer | M |

### チャットに追加
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| ATT-006 | 選んだ文を引用でチャット欄に足す | conversation | M |
| ATT-007 | 右の欄・別ウィンドウから足す | composer | M |

### AI に渡す
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| ATT-008 | 押した時点の中身を札にして渡す | attachments | T:uploads |
| ATT-009 | 渡し先を選ぶ | attachments | M |

### 定型文
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| ATT-010 | 帯から定型文を入れる・すぐ送る | snippets | M |
| ATT-011 | 一覧から探して使う（取りやめ: 帯の一覧のボタンをなくし、帯のピルと管理のダイアログで使う） | snippets | M |
| ATT-012 | 足す・直す・並べ替える | snippets | M |

## VOI 音声入力

### マイク
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| VOI-001 | 話して入力欄に入れる | voice | M |
| VOI-002 | 録音中に送ると、起こした文で送る | composer | M |
| VOI-003 | 失敗したら録った音声で起こし直す | voice | M |
| VOI-004 | 使うマイクと話す言語を選ぶ | voice | M |
| VOI-005 | 質問の「その他」・送信待ちの書き直しでも使う | voice | M |

### 音声モード
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| VOI-006 | 話し終えたら送る・入力欄に入れる | voice | M |
| VOI-007 | AI の返答を読み上げる | voice | M |
| VOI-008 | 読み上げに話しかけて止める | voice | M |
| VOI-009 | 新しいチャットから続ける | voice | T:voiceHandoff |

### 設定
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| VOI-010 | 音声入力をオン・オフする | voice | M |
| VOI-011 | 文字起こしの方法を選ぶ | voice | T:server.voice |
| VOI-012 | whisper の準備とモデルを入れる | voice | T:server.voice |
| VOI-013 | macOS の音声認識で起こす | voice | M |
| VOI-014 | OpenAI で起こす | voice | T:server.voice |
| VOI-015 | 読み上げの声と速さを選ぶ | voice | M |

## NOTE ノート

### ノートのタブ
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| NOTE-001 | ノート・フォルダを作る | notes | M |
| NOTE-002 | 名前を変える | notes | M |
| NOTE-003 | ドラッグでフォルダへ動かす | notes | M |
| NOTE-004 | いくつも選んでまとめて扱う | notes | M |
| NOTE-005 | ゴミ箱・パスのコピー | notes | M |
| NOTE-006 | 名前で探す | notes | T:notePaths |
| NOTE-007 | タブで開く・分けて並べる | notes | M |
| NOTE-008 | 一覧を隠す・フォルダをすべて開閉する | notes | M |
| NOTE-009 | 保存先のフォルダを決める | notes | M |

### 書く
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| NOTE-010 | ライブプレビューで書く | notes | T:livePreview |
| NOTE-011 | ⌘S で保存・書きかけを残す | notes | E:note-edit |
| NOTE-012 | ほかで変わったノートを読み直す | notes | T:noteWatcher,server.notes |
| NOTE-013 | 題名を書き換えて名前を変える | notes | M |
| NOTE-014 | ノートの中を探す・置き換える | notes | M |
| NOTE-015 | HTML で書く | notes | M |

### ノートの AI
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| NOTE-016 | ノートの横で AI と話す | notes | M |
| NOTE-017 | ノートの下の入力欄から頼む | notes | M |
| NOTE-018 | AI でフォルダを整理する | notes | M |

### チャットとの行き来
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| NOTE-019 | チャットの文をノートにする | notes | M |
| NOTE-020 | 既存のノートに足す・AI で組み込む | notes | T:noteAi,server.notes |
| NOTE-021 | チャットからノートを開く | notes | M |
| NOTE-022 | 入力欄の上のピルからノートを使う | notes | M |
| NOTE-023 | ノートをチャットに追加する | notes | M |
| NOTE-024 | 選んだ文から新しいチャットを始める | notes | M |
| NOTE-025 | ノートを GitHub の issue にする | notes | M |
| NOTE-026 | 全プロジェクトのノートの文言を探す | notes | T:noteSearch,server.notes |

### 図と数式
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| NOTE-027 | ライブ表示で数式と Mermaid を図にする | notes | M |

## CODE コードと Git

### ファイル
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| CODE-001 | ファイルの木を見る | files | M |
| CODE-002 | 新しいファイル・フォルダを作る | files | T:useFileActions |
| CODE-003 | ファイル・フォルダの名前を変える | files | T:useFileActions |
| CODE-004 | ゴミ箱・パスのコピー・Finder で表示 | files | M |
| CODE-005 | いくつも選んでまとめて扱う | files | M |
| CODE-006 | タブで開く・分けて並べる | files | T:fileTabs |

### エディタ
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| CODE-007 | 開いたらすぐ書いて保存する | files | M |
| CODE-008 | ほかで変わったファイルを読み直す | files | M |
| CODE-009 | 行の横に Git との違いの帯 | 土台:ui | T:quickDiff |
| CODE-010 | 行をいつ誰が変えたかを見る | git | T:blame |
| CODE-011 | 差分を見ながら直す | files | M |
| CODE-012 | ファイルの中を探す・置き換える | files | M |
| CODE-013 | 画像・Markdown・HTML をプレビューする | files | M |

### 検索
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| CODE-014 | プロジェクトのファイルの中を探す | files | M |
| CODE-015 | 含める・除くファイルを指定する | files | M |
| CODE-016 | 検索結果を置き換える | files | M |

### 変更とコミット
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| CODE-017 | 変更の一覧と差分を見る | git | E:open-diff |
| CODE-018 | ステージ・取り消し・元に戻す | git | T:server.git |
| CODE-019 | コミットを作る | git | M |
| CODE-020 | 修正・プッシュ・同期つきのコミット | git | M |
| CODE-021 | プル・プッシュ・フェッチ | git | M |
| CODE-022 | マージの衝突を解く | git | M |

### 右の欄
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| CODE-023 | 右の欄で変更を見る・確認済みにする | git | M |
| CODE-024 | 右の欄でファイルを開いて直す | files | M |
| CODE-025 | 右の欄でファイル・検索・履歴を開く | projects | M |
| CODE-026 | 差分・コードの選択をチャットに追加 | files | M |

### 履歴とブランチ
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| CODE-027 | コミットの表とブランチの線 | git | M |
| CODE-028 | 同じコミットの手元とリモートのブランチを別の札で見せる | git | M |
| CODE-029 | コミットの詳細と差分を見る | git | M |
| CODE-030 | ブランチ・タグ・退避の一覧 | git | M |
| CODE-031 | 履歴の帯から Git を操作する | git | M |
| CODE-032 | 履歴を開いた・窓に戻ったときにリモートの最新を取ってくる | git | T:gitAutoFetch |
| CODE-033 | ブランチをチェックアウトする | git | M |
| CODE-034 | ブランチ・タグを作る | git | M |
| CODE-035 | マージ・リベースする | git | T:server.gitBranches |
| CODE-036 | 追跡・名前の変更・削除 | git | M |
| CODE-037 | 変更を退避・戻す・適用する | git | M |
| CODE-038 | チェリーピック・リバート（一部） | git | M |

### ワークツリー
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| CODE-039 | ワークツリーを作る | 土台:core | M |
| CODE-040 | 新しいチャットの作業場所を選ぶ | 土台:ui | M |
| CODE-041 | 見る作業場所を切り替える | 土台:ui | M |
| CODE-042 | チャットに作業場所の札を出す | 土台:ui | M |
| CODE-043 | ブランチの切り替えを見張って、作業場所の一覧をすぐ取り直す | worktrees | T:headWatch |
| CODE-044 | 同じ作業場所の作業中を知らせる | chat | M |
| CODE-045 | ワークツリーから PR を作る | worktrees | M |
| CODE-046 | マージ後にワークツリーを片付ける | worktrees | M |
| CODE-047 | ワークツリーを消す | worktrees | M |
| CODE-048 | チャットの作業場所を途中で変える（本体 ⇄ ワークツリー） | workplaceMove | M |

### 実行環境
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| CODE-049 | ワークツリーごとにポートを分ける | worktrees | T:server.worktreeEnv |
| CODE-050 | AI で実行環境を整える | worktrees | T:server.worktreeEnv |
| CODE-051 | 消すときにコンテナと接続も消す | worktrees | M |

## TERM ターミナル・ブラウザ

### ターミナル
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| TERM-001 | 内蔵ターミナルを使う | terminal | M |
| TERM-002 | ターミナルの文をチャットに追加する | terminal | M |
| TERM-003 | 決まったコマンドを流すタブ | terminal | M |

### ブラウザ
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| TERM-004 | 埋め込みブラウザでページを見る | browser | M |
| TERM-005 | 開発者ツールを開く | browser | M |
| TERM-006 | 拡張機能を入れる | browser | M |
| TERM-007 | 画面とコンソールを AI に渡す | browser | M |

### 外で開く
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| TERM-008 | 外のブラウザ・ターミナルで開く | panel | M |
| TERM-009 | Finder・VS Code で開く | 土台:desktop | M |

## DB DB・Docker・ポート

### DB の接続
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| DB-001 | 接続を登録して試す | database | M |
| DB-002 | 接続を写す・複製する・消す | database | M |
| DB-003 | 接続する・切る | database | T:server.databases |
| DB-004 | プロジェクトから接続を取り込む | database | T:server.databases |
| DB-005 | ワークツリーの SQLite を開く | database | T:server.databases |
| DB-006 | 接続の並びを変える（一部） | database | M |

### つなぎ方と守り
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| DB-007 | SSH トンネルを通す | database | T:server.databases |
| DB-008 | つなぐ前に準備のコマンドを流す | database | T:server.databases |
| DB-009 | 環境ごとの色と書き込みの守り | database | M |
| DB-010 | 読み取り専用の接続で一時的に書く | database | M |
| DB-011 | パスワードをキーチェーンで暗号化する | database | T:secrets,server.databases |

### 手順ノート
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| DB-012 | 接続の手順ノートを作る・開く | database | M |
| DB-013 | つながらないときの案内 | database | M |
| DB-014 | 直し方を手順ノートに足す | database | M |

### 木と探す
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| DB-015 | DB タブ・右の欄・別ウィンドウで開く | database | M |
| DB-016 | 木で DB・テーブル・列をたどる | database | E:db-table |
| DB-017 | テーブルをピン留めする | database | T:dbPins |
| DB-018 | テーブル・列を名前で探す | database | M |

### テーブル
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| DB-019 | データを見て並べ替える | database | E:db-table |
| DB-020 | 行を絞り込む | database | M |
| DB-021 | 外部キーで参照先の行へ移る | database | M |
| DB-022 | 行の詳細を縦に見る | database | M |
| DB-023 | 構造・DDL・関数の定義を見る | database | M |
| DB-024 | CSV・TSV・JSON で書き出す | database | M |
| DB-025 | 絞り込みのまま SQL のタブで開く | database | M |
| DB-026 | セルを直す・行を足す・消す | database | M |
| DB-027 | CSV を取り込んで行を足す | database | M |

### SQL
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| DB-028 | SQL を書いて流す | database | M |
| DB-029 | 文ごとの結果とメッセージを見る | database | M |
| DB-030 | トランザクションをコミット・取り消す | database | M |
| DB-031 | 流す接続を替える | database | M |
| DB-032 | SQL の履歴から入れ直す | database | M |
| DB-033 | AI に SQL を書いてもらう | database | T:sqlAssist,server.databases |

### ER 図
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| DB-034 | ER 図を見る | database | M |
| DB-035 | ER 図を絞る・位置を覚える | database | M |
| DB-036 | Mermaid・SVG・PNG で書き出す | database | M |

### AI と DB
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| DB-037 | テーブル・ER 図について AI に聞く | database | M |
| DB-038 | チャットの AI が DB を読む | database | T:aiTools |
| DB-039 | AI に見せるかを接続ごとに決める | database | M |
| DB-040 | AI の SQL を承認カードで確かめる | database | M |
| DB-041 | AI の大きな結果を CSV に書き出す | database | T:csvExport |
| DB-042 | AI の SQL を SQL のタブで開く | database | M |
| DB-043 | 見せない DB に AI が直接つなぐのを断る | database | T:hiddenDb |

### Docker
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| DB-044 | compose のサービスを一覧で見る | docker | M |
| DB-045 | 止まっているエンジンを起こす | docker | M |
| DB-046 | まとめて起動・停止・再起動する | docker | T:actions,server.docker |
| DB-047 | 片付ける・作り直して起動する | docker | M |
| DB-048 | サービスごとに起動・停止・再開する | docker | M |
| DB-049 | 失敗をターミナルで流し直す | docker | M |
| DB-050 | 公開ポートをブラウザで開く | docker | M |
| DB-051 | コンテナのシェルを開く | docker | T:dockerView |
| DB-052 | 同じ組の名前を知らせる | docker | T:listing,server.docker |
| DB-053 | DB のサービスを DB で開く | docker | M |
| DB-054 | ほかの作業場所の Docker を止める前に聞く | docker | T:dockerGuard |

### Docker のログ
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| DB-055 | ログを時刻順にまとめて見る | docker | T:server.docker |
| DB-056 | ログを絞る・探す | docker | M |
| DB-057 | ログを AI に渡す | docker | M |

### ポート
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| DB-058 | ポートを使っているプロセスを見る | ports | M |
| DB-059 | プロセスを止める | ports | T:service,server.ports |
| DB-060 | ポートをブラウザで開く | ports | M |
| DB-061 | ポートの取り合いで相手を止めて起動する | docker | T:portConflict,server.docker |
| DB-062 | Docker の外のポートの占有を知らせる | docker | M |

### パスワードと準備の確かめ
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| DB-063 | キーチェーンで開けないパスワードを、その場で聞いて使う | database | M |
| DB-064 | 準備のコマンドを確かめてから流し、次に確かめる日を出す | database | M |

## GH GitHub・CI

### 連携
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| GH-001 | gh のアカウントで GitHub につなぐ | github | T:server.github |

### 一覧
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| GH-002 | issue・PR の一覧を見る | github | M |
| GH-003 | 状態・ラベル・担当などで絞る | github | M |
| GH-004 | 検索の文で絞る | github | T:searchQuery |

### 中身
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| GH-005 | issue の本文と会話を見る | github | M |
| GH-006 | PR の会話とマージできるかを見る | github | M |
| GH-007 | PR の変更を木と差分で見る | github | M |
| GH-008 | PR のチェックの成否を見る | github | M |
| GH-009 | 本文の画像・#番号のリンクを開く | github | T:githubLinks |
| GH-010 | チャットの右の欄で GitHub を開く | chatPanel | M |

### AI に渡す
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| GH-011 | issue・PR を AI に渡す | github | M |
| GH-012 | レビューコメントで直してもらう | github | M |
| GH-013 | 本文の選んだ文をチャットに追加する | github | M |
| GH-014 | チャットと issue・PR を結び付ける | github | M |

### 書く
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| GH-015 | コメントする・閉じる・開き直す | github | T:server.github |
| GH-016 | ラベルを付け替える | github | M |
| GH-017 | 新しい issue を作る | github | M |
| GH-018 | 行にコメントしてレビューを送る | github | M |
| GH-019 | スレッドに返信・解決する | github | M |

### PR
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| GH-020 | プッシュして PR を作る | github | T:github |
| GH-021 | PR をマージする | github | M |
| GH-022 | PR をチェックアウトする | github | M |
| GH-023 | マージ・クローズを知らせて片付ける | github | T:prWatch,server.worktreePrs |

### CI
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| GH-024 | GitHub Actions の実行の一覧 | github | M |
| GH-025 | ジョブとステップを見る | github | M |
| GH-026 | ジョブのログを読む | github | M |
| GH-027 | 失敗したジョブ・すべてをやり直す | github | T:server.ci |
| GH-028 | 落ちた CI のログを AI に渡す | github | M |
| GH-029 | 落ちたブランチの作業場所で直す | github | M |
| GH-030 | PR のチェックから CI のログを開く | github | M |
| GH-031 | CI の失敗を Mac の通知で知らせる | github | T:server.ci,server.notifications |

## AIT AI の Kickoff 操作ツール

### チャット
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| AIT-001 | AI がチャット（子・兄弟・親のないチャット）を作って頼む・ワークツリーでも作る | childChats | T:aiCreateChat |
| AIT-002 | チャットの名前を変える・家系のチャットを固定する・グループを変える・親から外す | chat | T:aiChatEdit |
| AIT-003 | チャットをアーカイブする・消す | chat | M |
| AIT-004 | 家系のチャットに下書きを入れる | chat | T:aiOpen |
| AIT-005 | チャットの一覧・会話・使用枠を読む | chat | T:aiChatRead |
| AIT-006 | 利用者に知らせる | notifications | T:server.notifications |
| AIT-007 | 利用者が見ているものを読む | userView | M |
| AIT-008 | AI がチャットの作業場所を移す | workplaceMove | M |

### 開く
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| AIT-009 | ノート・チャット・ファイル・差分を画面に開く | chat | T:aiOpen |
| AIT-010 | SQL のタブに SQL を入れて開く | chat | T:aiOpen |

### プロジェクト
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| AIT-011 | 定型文を足す・ノートを動かす | chat | T:aiProject |
| AIT-012 | ターミナルの出力を読む | terminal | T:aiTerminal |
| AIT-013 | 埋め込みブラウザを見る・操作する | browser | M |
| AIT-014 | ワークツリーを後始末する | worktrees | M |

### 診断
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| AIT-015 | OS の砂場の拒否ログを読む（限定の診断） | guard | T:sandboxDiagnostics |

### つなぎ方
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| AIT-016 | どの AI からもつなげる MCP サーバーで出す | 土台:core | M |

### 表示
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| AIT-017 | ツールの呼び出しを文で見せる | chat | T:toolText |

### 図
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| AIT-018 | 返答に図を描く・描き直す | visuals | T:aiVisual |

## MOB スマホ連携

### つなぐ
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| MOB-001 | スマホからつなぐをオン・オフする | devices | M |
| MOB-002 | QR と番号でペアリングする | devices | T:server.devices |
| MOB-003 | つなぐ頼みを Mac で確かめる | devices | M |
| MOB-004 | Tailscale Serve の始め方を案内する | devices | M |
| MOB-005 | Serve の URL をつなぐ先にする | devices | T:tailscale |
| MOB-006 | アプリと本体の版の違いを断る | 土台:shared | T:version |

### 端末
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| MOB-007 | つないだ端末の一覧を見る | devices | M |
| MOB-008 | 端末を見るだけにする | 土台:core | M |
| MOB-009 | 端末を取り消す | devices | T:server.devices |
| MOB-010 | 端末に開く API を限る | 土台:core | M |

### Mac の常駐
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| MOB-011 | ログイン時に窓を出さずに起動する | 土台:desktop | M |
| MOB-012 | 作業中は Mac を眠らせない | 土台:desktop | M |

### 通知
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| MOB-013 | スマホにプッシュで知らせる | devices | T:push,server.notifications |

### Android のアプリ
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| MOB-014 | QR を読んで本体をつなぐ | mobile | M |
| MOB-015 | いくつもの本体を切り替える | mobile | M |
| MOB-016 | チャットの一覧を見る | mobile | M |
| MOB-017 | チャットを読む | mobile | M |
| MOB-018 | 送る・伝える・止める | mobile | M |
| MOB-019 | 承認・質問に答える | mobile | M |
| MOB-020 | 新しいチャットを始める | mobile | M |
| MOB-021 | ターミナルを使う | mobile | M |
| MOB-022 | 裏から戻ったら抜けた分を取る | mobile | M |
| MOB-023 | APK を作って配る | mobile | M |
| MOB-024 | ノート・子チャット・添付を使う（一部） | 土台:core | M |
| MOB-025 | 実機で通して確かめる（一部） | mobile | M |

### iPhone
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| MOB-026 | iPhone のブラウザから使う（一部） | devices | T:pairing |

### 図と数式
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| MOB-027 | スマホで数式と図を描く | mobile | M |

## SET 設定・使用状況・通知

### 設定
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| SET-001 | 設定のダイアログを開く | settings | E:settings-open |
| SET-002 | テーマ（ダーク・ライト・システム） | 土台:ui | M |
| SET-003 | 見出し・タブの列・チャットを開く場所を選ぶ | settings | M |
| SET-004 | サブエージェント・子チャット・ノートを開く場所 | ai | M |
| SET-005 | 新しいチャットの AI の既定を決める | ai | T:AiDefaultsSettings |
| SET-006 | 新しいチャットの制限（コマンドの砂場・編集先の制限）の既定を選ぶ | ai | T:AiDefaultsSettings |
| SET-007 | ✕ と、作業中の作業場所での扱いを選ぶ | chat | M |
| SET-008 | 下の帯の出し方を選ぶ | 土台:ui | M |

### AI の接続
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| SET-009 | サーバー・AI・gh の様子を見る | ai | M |
| SET-010 | Claude Code のログイン状態とプラン | ai | T:server.providerAuth |
| SET-011 | AI ごとにログインの仕方（サブスク / API キー）を選ぶ・API キーを置く | ai | M |

### 下の帯と使用枠
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| SET-012 | 接続の切断・CLI の不調を札で出す | ai | M |
| SET-013 | 本体のブランチを出す | app | M |
| SET-014 | 使用枠とプランを出す | ai | M |
| SET-015 | 使用枠の詳細を開く | ai | M |
| SET-016 | 前に出しているチャットの AI の使用状況を出す（取りやめ: 下の帯に AI ごとに並べる形に替えた。SET-026） | ai | M |
| SET-017 | サービスごとの使用状況を見る | ai | T:server.usage |

### 通知
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| SET-018 | Mac の通知で知らせる | notifications | T:server.notifications |
| SET-019 | 見ている人には通知しない | notifications | T:server.notifications |
| SET-020 | 通知を押してそのチャットを開く | 土台:desktop | M |
| SET-021 | Dock のアイコンに要対応の数を出す | notifications | T:dockBadge |
| SET-022 | ntfy でスマホに知らせる（取りやめ: 欄を保存するだけで知らせていなかった。スマホへはプッシュで知らせる。MOB-013） | notifications | M |

### 診断
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| SET-023 | 性能の記録を 10 秒取る | diagnostics | M |
| SET-024 | 記録の様子と保存先を出す | diagnostics | M |
| SET-025 | 詰まりと起動の時刻を見る | diagnostics | M |

### 使用状況
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| SET-026 | 下の帯に、ログインしている AI ごとの使用状況を並べ、押して詳細を開く | ai | M |
| SET-027 | 超過分（追加の使用枠）・Codex のクレジットで動いているかを出し、動き始めたらチャットに知らせる | ai | M |

## BASE 土台（保存・守り・OS）

### 起動と終了
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| BASE-001 | 1 つだけ起動し、窓を閉じても残る | app | M |
| BASE-002 | 片付けてから終える | 土台:desktop | M |
| BASE-003 | 作業中のチャットがあれば、終える前に確かめる | 土台:desktop | T:quitConfirm |
| BASE-004 | コアを別のプロセスで動かし、落ちたら作り直す | 土台:desktop | M |
| BASE-005 | 起動直後に地の色と骨組みをすぐ描く | 道具 | M |
| BASE-006 | 起動の記録を残す | 土台:desktop | M |
| BASE-007 | 詰まりを見張り、起動の時刻とメモリを記録する | 土台:desktop | M |

### 保存
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| BASE-008 | 製品版と開発版を分けて同時に動かす | 土台:core | M |
| BASE-009 | DB を版ごとに引き継ぐ | 土台:core | M |
| BASE-010 | ⌘⇧S で書きかけをすべて保存する | app | M |
| BASE-011 | DB を作り直したら ID 付きの表示の設定を捨てる | 土台:ui | T:prepareStorage |
| BASE-012 | 削除したチャットの会話記録をゴミ箱へ | chat | T:sessionCleanup |

### ゴミ箱
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| BASE-013 | 消したものを 3 日取っておき、元に戻す（Kickoff のゴミ箱） | trash | T:server.trash |
| BASE-014 | プロジェクトの「ゴミ箱」タブで見て戻す | trash | M |
| BASE-015 | 消した直後の知らせから元に戻す | trash | M |
| BASE-016 | AI が消すときもゴミ箱へ（kickoff-trash） | trash | T:command,server.trash |
| BASE-017 | ゴミ箱のプロジェクトを設定から戻す | trash | M |
| BASE-018 | アーカイブ済みの古いチャットをまとめてゴミ箱へ | chat | T:archiveCleanup |
| BASE-019 | どのチャットも使っていない会話記録を探してゴミ箱へ | chat | M |
| BASE-020 | 3 日を待たずに 1 件ずつ完全に消す | trash | M |
| BASE-021 | ゴミ箱をまとめて空にする | trash | M |

### 守り
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| BASE-022 | トークンで API を守る | 土台:core | T:auth |
| BASE-023 | 秘密の値を分けて守る | 土台:core | M |
| BASE-024 | AI が Kickoff 自身を壊す呼び出しを断る | guard | T:selfProtection |
| BASE-025 | 参照資料・作業場所の外への書き込みを断る | guard | T:scope |
| BASE-026 | Git 管理外だけ書けるチャット | guard | T:scope |
| BASE-027 | AI のファイルの書き込みを作業場所・ノート・例外だけにする | guard | T:writeScope |
| BASE-028 | AI の Bash を砂場に入れ、書ける場所を絞る | guard | M |
| BASE-029 | 砂場で断られた書き込みを AI に説明する | guard | T:sandboxDenied |
| BASE-030 | AI に会話ごと作業場所を移させない（Claude Code の EnterWorktree） | ai | T:policy |
| BASE-031 | AI に git のフックを飛ばさせない | guard | T:gitHookGuard |
| BASE-032 | AI に NODE_COMPILE_CACHE を設定させない | guard | T:compileCacheGuard |
| BASE-033 | 製品版の中に入る道を閉じる | 道具 | M |
| BASE-034 | 画面の権限を Kickoff の画面に限る | 土台:desktop | M |
| BASE-035 | 画面とファイルを安全に配る | 土台:core | M |

### 通信
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| BASE-036 | 変更をその場で画面とスマホに届ける | 土台:core | T:server |

### OS
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| BASE-037 | ログインシェルの PATH を取り込む | 土台:core | M |
| BASE-038 | Windows で動かす（一部） | 土台:core | M |

### 性能
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| BASE-039 | 長いチャット・作業中の表示と入力を軽くする | chat | T:chatStore |
| BASE-040 | サブエージェントのカードの手順を、そのサブエージェントの記録だけから作る | subagents | T:subagentEvents |
| BASE-041 | 裏のタブのチャットは描くのを止める | conversation | M |
| BASE-042 | 長い一覧は画面に入る分から描く | 土台:ui | E:sidebar-keys,sidebar-range,sidebar-drag,board-find |
| BASE-043 | 画面のビルドと配信を速くする | 道具 | M |

### 開発と配布
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| BASE-044 | 製品版を入れ替える | 道具 | M |
| BASE-045 | コアだけ動かしてブラウザで使う | app | M |
| BASE-046 | 開発版に製品版のデータを写す | 土台:core | T:devData |
| BASE-047 | 開発版を Kickoff Dev として見分ける | 道具 | M |
| BASE-048 | Claude Code・Codex の新しい版を知らせる | 道具 | M |
| BASE-049 | 確かめ用のスクリプト | 道具 | M |
| BASE-050 | テストを軽くする（Vitest・4 つのコマンド） | 道具 | M |
| BASE-051 | 表示の重さを測るスクリプト | 道具 | M |
| BASE-052 | コミット時・push 時に git のフックで確かめる | 道具 | M |

### 会話記録の片付け
| ID | 機能 | 持ち主 | 確かめ方 |
|---|---|---|---|
| BASE-053 | 巻き戻しなどで使われなくなった、Kickoff が作った会話記録をゴミ箱へ入れる | chat | M |

## NF 非機能
| ID | 要件 | 確かめ方 |
|---|---|---|
| NF-01 | ローカル完結: データは Mac の中（SQLite）に置く。外へ送るのは AI のプロバイダーとの通信と、有効にした通知だけ | M |
| NF-02 | セキュリティ: 外からのアクセスにはトークンが要る。デプロイ・リポジトリの外への書き込みなど、影響の大きい操作は承認制 | M |
| NF-03 | 使用量: サブスクリプションの上限を意識する（API に換算した推定の費用を出す） | M |
| NF-04 | 拡張性: プロバイダーを足しやすくする。HTTP API はデスクトップの画面・スマホのブラウザ・ネイティブのアプリで共通 | M |
| NF-05 | 復旧性: アプリが落ちても、止まった実行を続きから再開できる | M |
| NF-06 | 前提: 開発するアプリのリポジトリは利用者が GitHub に作り、remote（origin）を設定しておく（Kickoff はリポジトリを作らない） | M |
| NF-07 | 前提: Mac に `claude`（Claude Code）と `gh`（GitHub CLI）が入っていて、ログインしてある | M |
