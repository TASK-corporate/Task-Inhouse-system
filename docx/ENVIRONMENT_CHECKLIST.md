# 環境変更チェックリスト

> 環境やアカウントが変わった時に更新が必要な箇所のチェックリスト

---

## A. GASを再デプロイした場合

| # | 作業 | 場所 | 備考 |
|---|---|---|---|
| A-1 | 新しいデプロイURLを取得 | GASエディタ | 「デプロイを管理」→既存を更新ならURL不変 |
| A-2 | config.jsの`GAS_URL`を更新 | config.js | 新規デプロイの場合のみ |
| A-3 | GitHubにpush | — | config.jsを変更した場合のみ |
| A-4 | 動作確認：車両一覧が表示されるか | employee/index.html | API疎通確認 |

> **ポイント：** 「デプロイを管理」→ 鉛筆アイコン → バージョンを「新バージョン」→「デプロイ」で既存URLのまま更新できます。新規デプロイすると新URLになるので注意。

---

## B. Googleアカウントを変更した場合

| # | 作業 | 場所 | 備考 |
|---|---|---|---|
| B-1 | main.gsを新アカウントのGASプロジェクトに貼り付け | GASエディタ | |
| B-2 | GASを「ウェブアプリ」としてデプロイ | GASエディタ | アクセス権は「全員」 |
| B-3 | config.jsの`GAS_URL`を新URLに更新 | config.js | |
| B-4 | スプレッドシートの共有設定 | Google Sheets | 新アカウントに編集権限 |
| B-5 | Driveフォルダの共有設定（車両画像親） | Google Drive | 新アカウントに編集権限 |
| B-6 | Driveフォルダの共有設定（請求書親） | Google Drive | 新アカウントに編集権限 |
| B-7 | main.gsの`SPREADSHEET_ID`確認 | main.gs | 同じスプシなら変更不要 |
| B-8 | main.gsの`PARENT_FOLDER_ID`確認 | main.gs | 同じフォルダなら変更不要 |
| B-9 | main.gsの`INVOICE_PARENT_FOLDER_ID`確認 | main.gs | 同じフォルダなら変更不要 |
| B-10 | GASのトリガー再設定 | GASエディタ | `setupTriggers()`を1回実行 |
| B-11 | GitHubにpush | — | |
| B-12 | 全ページの動作確認 | ブラウザ | |

> **ポイント：** Driveの共有設定は「リンクを知っている人に編集権限」ではなく、新アカウントのメールアドレスを直接「編集者」として追加するのが確実です。

---

## C. スプレッドシートを新規作成した場合

| # | 作業 | 場所 | 備考 |
|---|---|---|---|
| C-1 | 5シートを作成しヘッダー行を設定 | Google Sheets | 下記参照 |
| C-2 | main.gsの`SPREADSHEET_ID`を新IDに更新 | main.gs | |
| C-3 | GASを再デプロイ | GASエディタ | |
| C-4 | 許可ユーザーシートに管理者を登録 | Google Sheets | E列をTRUEに |
| C-5 | 動作確認 | ブラウザ | |

**各シートのヘッダー行**（main.gsのCOL定数と完全一致させること）：

| シート名 | 列数 | ヘッダー |
|---|---|---|
| マスターデータ | 22列 | 自動車ナンバー / 車種 / 車台番号 / 状態 / エリア / 管理場所 / 貸出先 / 使用者 / 所有者 / 任意保険 / レンタル料金 / 車検満了日 / オイル交換日 / 駆動方式 / リモコンキー / スモークガラス / 仕入時走行距離 / 現走行距離 / 備考 / 車両画像(公開) / 車両画像(社内) / 登録日時 |
| 修正シート | 6列 | 修正日時 / 自動車ナンバー / 変更項目 / 変更前 / 変更後 / 操作者 |
| 取引先マスター | 12列 | 取引先ID / 会社名 / 担当者名 / 郵便番号 / 住所 / 支払条件 / メンテナンスプラン / ドライバー名 / 備考 / 種別 / 請求タイプ / 請求書フォルダID |
| 請求明細 | 16列 | 請求ID / 取引先ID / 年月 / 行番号 / 月日 / 項目名 / 数量 / 単価 / 備考 / 請求日 / 支払実行日 / 集計開始日 / 集計終了日 / 全体備考 / 最終更新日時 / 区分 |
| 許可ユーザー | 7列 | LINE UserID / 表示名 / プロフィール画像URL / 申請日時 / 承認 / ログインID / パスワードハッシュ |

---

## D. Driveフォルダを変更した場合

| # | 作業 | 場所 | 備考 |
|---|---|---|---|
| D-1 | 新フォルダIDを取得 | Google Drive | URLの `/folders/` の後ろの文字列 |
| D-2 | main.gsの`PARENT_FOLDER_ID`を更新 | main.gs | 車両画像用 |
| D-3 | main.gsの`INVOICE_PARENT_FOLDER_ID`を更新 | main.gs | 請求書PDF用 |
| D-4 | GASを再デプロイ | GASエディタ | |
| D-5 | 共有設定確認 | Google Drive | GASアカウントに編集権限 |

> **ポイント：** 既存車両のスプシに記録されている画像フォルダIDは旧フォルダを指しています。旧フォルダが存在する限り既存画像は表示されます。新しく登録する車両から新フォルダ配下に作成されます。

---

## E. LINE / LIFF設定を変更した場合

| # | 作業 | 場所 | 備考 |
|---|---|---|---|
| E-1 | 新LIFF IDを取得 | LINE Developers | |
| E-2 | config.jsの`LIFF_ID`を更新 | config.js | |
| E-3 | LINE Loginチャネルが「公開」状態か確認 | LINE Developers | 「開発中」だとLIFF認証が動かない |
| E-4 | コールバックURLを設定 | LINE Developers | `https://task-inhouse-system.pages.dev` |
| E-5 | リッチメニューのURL更新 | LINE公式アカウント管理 | 下記参照 |
| E-6 | GitHubにpush | — | |

**リッチメニューURL形式：**

| ボタン | URL |
|---|---|
| 車両登録 | `https://liff.line.me/{LIFF_ID}?page=register` |
| 車両一覧 | `https://liff.line.me/{LIFF_ID}?page=index` |
| 取引先 | `https://liff.line.me/{LIFF_ID}?page=clients` |
| 変更 | `https://liff.line.me/{LIFF_ID}?page=modify` |
| 請求書 | `https://liff.line.me/{LIFF_ID}?page=invoice` |

> **注意：** LIFF IDが変わったらリッチメニューの全ボタンのURLを更新する必要があります。

---

## F. Cloudflare Pages / GitHubを変更した場合

| # | 作業 | 場所 | 備考 |
|---|---|---|---|
| F-1 | 新リポジトリをCloudflare Pagesに連携 | Cloudflare | 「Looking to deploy Pages?」フロー |
| F-2 | 新ドメインを確認 or カスタムドメイン設定 | Cloudflare | |
| F-3 | LINE DevelopersのコールバックURLを更新 | LINE Developers | 新URLに変更 |
| F-4 | リッチメニューURLを更新 | LINE公式アカウント管理 | ドメインが変わった場合 |
| F-5 | config.jsがリポジトリに含まれているか確認 | GitHub | APIキーが含まれるためリポジトリはprivate必須 |

> **注意：** Cloudflare PagesへのデプロイはWorkersフローではなく「Pages」フローを使うこと。

---

## G. Make webhookを変更した場合

| # | 作業 | 場所 | 備考 |
|---|---|---|---|
| G-1 | 新webhook URLを取得 | Make | |
| G-2 | main.gsの`WEBHOOK_URL`を更新 | main.gs | |
| G-3 | GASを再デプロイ | GASエディタ | |
| G-4 | テスト通知 | GASエディタ | `testFolder()`等で手動送信して確認 |

**Make側のペイロード形式：** `{ "text": "メッセージ", "timestamp": "ISO8601" }`

---

## H. APIキーを変更した場合

| # | 作業 | 場所 | 備考 |
|---|---|---|---|
| H-1 | main.gsの`API_KEY_EMPLOYEE`と`API_KEY_CLIENT`を更新 | main.gs | |
| H-2 | config.jsの`API_KEY_EMPLOYEE`と`API_KEY_CLIENT`を更新 | config.js | main.gsと完全一致させること |
| H-3 | GASを再デプロイ | GASエディタ | |
| H-4 | GitHubにpush | — | |
| H-5 | 全ページの動作確認 | ブラウザ | 不一致だと「Unauthorized」エラー |

> **注意：** config.jsとmain.gsのAPIキーが1文字でも違うと全機能が「Unauthorized」エラーになります。コピー&ペーストで統一してください。

---

## クイックリファレンス：「何を変えたら何を更新」

| 変更したもの | 更新が必要なファイル/場所 |
|---|---|
| GAS再デプロイ（既存更新） | 何もしなくてOK |
| GAS再デプロイ（新規） | config.js → GitHub push |
| スプレッドシートID | main.gs → GAS再デプロイ |
| DriveフォルダID | main.gs → GAS再デプロイ |
| APIキー | main.gs + config.js → GAS再デプロイ + GitHub push |
| LIFF ID | config.js → GitHub push + LINE Developers + リッチメニュー |
| Make webhook URL | main.gs → GAS再デプロイ |
| Cloudflare Pagesドメイン | LINE Developers コールバック + リッチメニューURL |
| Googleアカウント | 全部（GAS + スプシ共有 + Drive共有 + トリガー） |

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| 全画面で「Unauthorized」 | config.jsとmain.gsのAPIキー不一致 | 両方のキーを確認し一致させる → GAS再デプロイ |
| LIFF認証が動かない | LIFF IDの不一致 or チャネルが「開発中」 | config.jsのLIFF_IDを確認、LINE Developersで「公開」に変更 |
| 画像が表示されない | Driveの共有設定 | フォルダの共有設定でGASアカウントに編集権限があるか確認 |
| 請求書PDFが作れない | INVOICE_PARENT_FOLDER_IDが未設定 or 権限なし | main.gsの値を確認、Driveフォルダの共有設定を確認 |
| 車両一覧が空 | GAS URLが古い or スプシIDが違う | config.jsのGAS_URLとmain.gsのSPREADSHEET_IDを確認 |
| LINE通知が届かない | Make webhookのURLが古い or シナリオが停止 | main.gsのWEBHOOK_URLを確認、Makeでシナリオがアクティブか確認 |
| スプシに書き込めない | GASアカウントにスプシの編集権限がない | スプレッドシートの共有設定を確認 |
