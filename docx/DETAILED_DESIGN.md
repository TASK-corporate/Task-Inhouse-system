# 基本設計書

> 最終更新: 2026-04-10  
> 株式会社A.I.M. → 株式会社TASK 向け車両管理・請求書発行システム

---

## 1. システム概要

株式会社TASKの車両レンタル業務をデジタル化するシステム。  
250台以上の車両を5名の社員で管理する。

### できること

- 車両情報の一元管理（登録・変更・検索・一覧表示）
- 請求書の作成・編集・PDF出力・履歴管理
- 車検・オイル交換の期日を自動でLINE通知
- 社員とクライアントで閲覧範囲を分離
- 車両画像の公開/社内分離管理

---

## 2. 技術スタック

| レイヤー | 技術 | 用途 |
|---|---|---|
| フロントエンド | Cloudflare Pages（HTML/CSS/JS） | 全操作画面。GitHubプライベートリポ連携で自動デプロイ |
| バックエンド | Google Apps Script（1本に統合・約1,150行） | 全API・PDF生成・期日通知 |
| データベース | Google Sheets（5シート） | 車両情報・取引先・請求データ・変更履歴・ユーザー管理 |
| ファイル保存 | Google Drive | 車両画像（公開/社内の2サブフォルダ構成）・請求書PDF |
| 認証 | LINE LIFF（モバイル）+ ID/PW SHA-256二重ハッシュ（PC） | 社員認証。ホワイトリスト方式 |
| 自動化 | Make（旧Integromat） | GAS → webhook → LINE通知 |
| 通知 | LINE公式アカウント | 社員への通知（登録・修正・期日・請求書PDF完了） |

### 設計原則

- Googleエコシステム内で完結させる（外部バックエンドは使わない）
- GASは1プロジェクトに統合する
- Googleフォームは全廃し、HTMLフォームに移行済み
- 請求書データはスプレッドシートに一本化（localStorageは廃止済み）
- Makeの役割は「GASから受け取ったテキストをLINEに流すだけ」に限定

---

## 3. 本番URL・識別子

| 項目 | 値 |
|---|---|
| フロントエンド | `https://task-inhouse-system.pages.dev` |
| LIFF経由 | `https://liff.line.me/2009586016-jVAW7J74?page=xxx` |
| LIFF ID | `2009586016-jVAW7J74` |
| GAS URL | config.jsで設定（再デプロイで変更あり） |
| API_KEY_EMPLOYEE | `a997e291429bbf3553591f3e9541b9bf` |
| API_KEY_CLIENT | `beccdd36ab6c29b2c1f8ef94834786bc` |
| スプレッドシートID | `1wAfgpOuhMXWciuxr7aKCEHtI6qNbFbRE2CSzytFMr4M` |
| 車両画像 親フォルダID | `1I7HEtBykOviIb5iVXBc4sh66YdKlIoFj` |
| 請求書PDF 親フォルダID | main.gsの`INVOICE_PARENT_FOLDER_ID`に設定 |
| Make webhook | `https://hook.eu2.make.com/my8kvc5qb6n56of4denemgr9q5r8rpb1` |

---

## 4. ファイル構成

```
root/
├── config.js                  ← GAS URL, APIキー, LIFF IDの一元管理
├── auth.js                    ← 全employeeページ共通の認証チェック（LIFF + sessionStorage）
├── employee/
│   ├── login.html             ← LIFF自動認証 + PC ID/PWログイン + アクセス申請
│   ├── index.html             ← 車両一覧 + 詳細（閲覧/編集）+ 画像管理（公開/社内）
│   ├── register.html          ← 車両登録（画像圧縮アップロード対応）
│   ├── modify.html            ← 車両修正（全車両一覧+リアルタイム検索+画像管理）
│   ├── clients.html           ← 取引先管理（詳細+車両一覧+編集リンク+請求書履歴）
│   └── invoice.html           ← 請求書（作成/編集/先月コピー/エリア区分/PDF生成）
├── customer/
│   └── index.html             ← 顧客向け車両一覧（公開画像のみ）
└── GAS/
    └── main.gs                ← 参照用（GASエディタに直接貼り付け）
```

---

## 5. スプレッドシート構成（5シート）

### シート1：マスターデータ（22列）

| 列 | ヘッダー名 | 型 | 備考 |
|---|---|---|---|
| A | 自動車ナンバー | String | PK |
| B | 車種 | String | |
| C | 車台番号 | String | 社員のみ表示 |
| D | 状態 | String | 貸出中/貸出可/販売可/販売済/修理中/要修理/代車/事故廃車/故障廃車/その他 |
| E | エリア | String | 大阪/名古屋/東京（自由記入も可） |
| F | 管理場所 | String | 自由記入 |
| G | 貸出先 | String | 取引先マスターから選択 |
| H | 使用者 | String | |
| I | 所有者 | String | 株式会社TASK/オリックス/W-FINANCE(TASK)/その他 |
| J | 任意保険 | String | |
| K | レンタル料金 | Number | 数字のみ。表示時に「〇円/月」 |
| L | 車検満了日 | Date | |
| M | オイル交換日 | Date | |
| N | 駆動方式 | String | |
| O | リモコンキー | String | |
| P | スモークガラス | String | |
| Q | 仕入時走行距離 | Number | |
| R | 現走行距離 | Number | |
| S | 備考 | String | |
| T | 車両画像(公開) | String | DriveフォルダID |
| U | 車両画像(社内) | String | DriveフォルダID |
| V | 登録日時 | Date | GAS自動セット |

ステータス変更時のGAS自動処理：
- 「事故廃車」「故障廃車」→ 行背景をグレー（#d9d9d9）
- 「販売済」→ 行背景を薄い緑（#d1fae5）
- その他 → 背景色をデフォルトに戻す

### シート2：修正シート（6列）

| 列 | ヘッダー名 | 備考 |
|---|---|---|
| A | 修正日時 | GAS自動セット |
| B | 自動車ナンバー | |
| C | 変更項目 | カラム名 |
| D | 変更前 | |
| E | 変更後 | |
| F | 操作者 | |

### シート3：取引先マスター（12列）

| 列 | ヘッダー名 | 備考 |
|---|---|---|
| A | 取引先ID | PK（例: C001） |
| B | 会社名 | |
| C | 担当者名 | |
| D | 郵便番号 | |
| E | 住所 | |
| F | 支払条件 | |
| G | メンテナンスプラン | |
| H | ドライバー名 | 複数は「・」区切り |
| I | 備考 | |
| J | 種別 | 法人/個人。請求書の敬称（御中/様）に反映 |
| K | 請求タイプ | 先払い/後払い。集計期間デフォルトと区分欄表示に影響 |
| L | 請求書フォルダID | 初回PDF生成時に自動作成 |

### シート4：請求明細（16列）

| 列 | ヘッダー名 | 備考 |
|---|---|---|
| A | 請求ID | 例: C001-202604 |
| B | 取引先ID | FK → 取引先マスター |
| C | 年月 | 例: 202604 |
| D | 行番号 | |
| E | 月日 | 例: 4/1 |
| F | 項目名 | 車両代/名変/立替/修理代/自由記述 |
| G | 数量 | |
| H | 単価 | 円（消費税なし。入力値＝請求金額） |
| I | 備考 | |
| J | 請求日 | 1行目のみ |
| K | 支払実行日 | 1行目のみ |
| L | 集計開始日 | 1行目のみ |
| M | 集計終了日 | 1行目のみ |
| N | 全体備考 | 1行目のみ |
| O | 最終更新日時 | GAS自動セット |
| P | 区分 | 後払い取引先のエリア区分（自由記入：大阪/名古屋等） |

### シート5：許可ユーザー（7列）

| 列 | ヘッダー名 | 備考 |
|---|---|---|
| A | LINE UserID | LIFF認証時に自動記録 |
| B | 表示名 | |
| C | プロフィール画像URL | |
| D | 申請日時 | |
| E | 承認 | TRUEで承認済み。管理者が手動設定 |
| F | ログインID | PC認証用 |
| G | パスワードハッシュ | SHA-256二重ハッシュ |

---

## 6. 認証フロー

```
ユーザーがページにアクセス
  ↓ auth.js が実行（<head>内）
sessionStorageに有効なセッションがある？（24時間有効）
  ├─ YES → window.AUTH_USERをセット → ページ表示
  └─ NO → LIFF SDK読み込み
           ↓
         LINEブラウザ内？
           ├─ YES → liff.login() 自動実行 → getProfile()
           │         → GAS checkAuth（スプシ照合）
           └─ NO → login.html のPC ID/PWフォームを表示
                    → GAS checkAuthByPassword（SHA-256二重ハッシュ照合）
                    ↓
         許可ユーザーシートで承認チェック
           ├─ 承認済み（E列=TRUE） → sessionStorage保存 → ページ遷移
           ├─ 申請済み → 「承認待ち」画面
           └─ 未登録 → アクセス申請画面（LINE通知で管理者に通知）
```

---

## 7. GASエンドポイント一覧

### doGet

| action | 機能 | 認証キー |
|---|---|---|
| （なし）role=employee | 全車両データ取得（画像含む） | API_KEY_EMPLOYEE |
| （なし）role=client | 顧客用車両データ（公開画像のみ） | API_KEY_CLIENT |
| checkAuth | LINE UserIDでホワイトリスト照合 | API_KEY_EMPLOYEE |
| clients | 取引先一覧（貸出車両台数集計付き） | API_KEY_EMPLOYEE |
| clientDetail | 取引先詳細（車両リスト+請求書履歴） | API_KEY_EMPLOYEE |
| invoice | 請求書明細取得 | API_KEY_EMPLOYEE |
| invoices | 請求書履歴一覧 | API_KEY_EMPLOYEE |

### doPost

| action | 機能 |
|---|---|
| registerVehicle | 車両登録（Driveフォルダ自動作成+LINE通知） |
| modifyVehicle | 車両修正（差分更新+修正ログ+ステータス色変更+LINE通知） |
| deleteVehicle | 車両削除 |
| registerClient | 取引先登録（請求書フォルダ自動作成） |
| modifyClient | 取引先修正 |
| deleteClient | 取引先削除 |
| saveInvoice | 請求書明細をスプシに保存（区分含む16列） |
| generateInvoicePDF | HTML→PDF変換→Drive保存→LINE通知 |
| uploadImage | 画像アップロード（folderIdキャッシュ対応） |
| deleteImage | 画像削除 |
| applyAccess | アクセス申請 |
| checkAuthByPassword | PC ID/PWログイン認証 |

### 自動実行トリガー

| 関数 | タイミング | 内容 |
|---|---|---|
| checkDueDates | 毎日9時 | 車検満了日（60/30/21日前）、オイル交換日（7日前/当日）→ LINE通知 |

---

## 8. 請求書の仕様

- **消費税なし**：入力値がそのまま請求金額
- **敬称**：種別が「個人」→「様」、「法人」→「御中」で自動切替
- **先払い/後払い**：取引先の請求タイプに基づき集計期間を自動設定
  - 先払い：翌月1日〜翌月末を集計、当月末に請求
  - 後払い：前月1日〜前月末を集計、当月15日までに請求
- **エリア区分**：後払い取引先のみ明細行に「区分」欄が表示。自由記入。プレビューとPDFで区分ごとにテーブル分割
- **日割り上限**：数量×単価が月額を超えた場合に自動調整
- **PDF生成**：GASでHTML→PDF変換 → Driveに保存 → Make → LINE通知

---

## 9. 画像管理の仕様

- **Drive構造**：親フォルダ → 車両フォルダ（車種_ナンバー） → 公開/社内サブフォルダ
- **公開画像上限**：30枚、**社内画像上限**：20枚
- **圧縮**：最大800px、JPEG品質60%
- **folderIdキャッシュ**：GASがfolderIdをレスポンスで返し、フロントが保持。2回目以降はスプシ検索スキップ
- **削除ボタン**：各画像右上に×ボタン（opacity:0.7で常時表示）

---

## 10. LINEリッチメニューURL

| ボタン | URL |
|---|---|
| 車両登録 | `https://liff.line.me/2009586016-jVAW7J74?page=register` |
| 車両一覧 | `https://liff.line.me/2009586016-jVAW7J74?page=index` |
| 取引先 | `https://liff.line.me/2009586016-jVAW7J74?page=clients` |
| 変更 | `https://liff.line.me/2009586016-jVAW7J74?page=modify` |
| 請求書 | `https://liff.line.me/2009586016-jVAW7J74?page=invoice` |

---

## 11. 外部サービス連携

### Google Drive フォルダ構造

```
車両画像親フォルダ/
├── {車種}_{ナンバー}/
│   ├── 公開/
│   └── 社内/
└── ...

請求書親フォルダ/
├── 請求書_{取引先ID}_{会社名}/
│   ├── 請求書_{会社名}_202604.pdf
│   └── ...
└── ...
```

### Make webhook

ペイロード形式：`{ "text": "通知メッセージ", "timestamp": "ISO8601" }`
