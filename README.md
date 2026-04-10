# 車両管理・請求書発行システム

株式会社TASK向けの車両レンタル業務DXシステム。
250+台の車両を5名の社員で管理。

## 技術スタック
- フロントエンド: Cloudflare Pages（HTML/CSS/JS）
- バックエンド: Google Apps Script
- DB: Google Sheets（5シート）
- 画像: Google Drive
- 認証: LINE LIFF + ID/PW（SHA-256）
- 通知: Make → LINE

## セットアップ

### 1. config.js を設定
GAS_URL, API_KEY_EMPLOYEE, API_KEY_CLIENT, LIFF_ID を設定。
GASを再デプロイするたびにURLが変わるので注意。

### 2. GASデプロイ
GASエディタで main.gs を貼り付け → デプロイ → 「ウェブアプリ」として公開。
アクセスは「全員」に設定。
INVOICE_PARENT_FOLDER_ID を実際のDriveフォルダIDに変更。

### 3. スプレッドシート
5シート（マスターデータ/修正シート/取引先マスター/請求明細/許可ユーザー）を作成。
取引先マスターはJ列（種別）、K列（請求タイプ）、L列（フォルダID）の12列構成。
請求明細はP列（区分）の16列構成。

### 4. Cloudflare Pages
GitHubプライベートリポと連携。pushで自動デプロイ。

### 5. LINE
LIFF IDをLINE Developersで取得。チャネルは「公開」状態にすること。
コールバックURLにCloudflare PagesのURLを設定。

## ファイル構成
config.js / auth.js / employee/(login|index|register|modify|clients|invoice).html / customer/index.html

## 注意事項
- config.jsはGitHubにpushしない（APIキーが含まれるため）
- GAS再デプロイ時はconfig.jsのURLも更新
- 許可ユーザーシートのE列（承認）はTRUEを手動設定
