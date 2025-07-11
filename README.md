# Raspberry Pi サイネージシステム

Raspberry Pi上でDockerを使用してフルスクリーンWebサイネージシステムを構築するプロジェクトです。

## 機能

### 基本機能
- フルスクリーン表示: 指定したWebページを全画面で表示
- 余計な機能の排除: ブラウザのUI、メニュー、ナビゲーションバーなど不要な要素を隠す
- Docker化: すべてのコンポーネントをDockerコンテナとして実行

### 管理機能
- 管理画面: Web UIでサイネージの設定を管理
- 2画面分割: 左右または上下に画面を分割して異なるコンテンツを表示
- 時間制御: 指定した時間に自動的に表示内容を切り替え

### 認証対応
- Grafana対応: ログインが必要なページ（Grafanaなど）に対応
- 認証情報管理: 管理画面でログイン情報を設定・保存

## アーキテクチャ

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   管理画面      │    │   サイネージ    │    │   設定DB       │
│   (Web UI)      │────│   表示システム  │────│   (SQLite)     │
│                 │    │   (Chromium)    │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 使用技術

- **フロントエンド**: HTML/CSS/JavaScript
- **バックエンド**: Node.js/Express
- **データベース**: SQLite
- **ブラウザ**: Chromium (Puppeteer)
- **コンテナ**: Docker & Docker Compose

## ファイル構成

```
imahan/
├── compose.yaml           # Docker Compose設定
├── manager/              # 管理画面アプリケーション
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js
│   └── public/
│       └── index.html
├── display/              # 表示システム
│   ├── Dockerfile
│   ├── package.json
│   └── display.js
├── shared/               # 共通設定
│   └── database.sql
└── README.md
```

## セットアップ

### 前提条件
- Docker & Docker Compose がインストール済み
- Raspberry Pi OS (推奨)
- X Window System (GUI表示用)

### 起動手順

1. **リポジトリをクローン**
   ```bash
   git clone <repository-url>
   cd imahan
   ```

2. **Docker Composeでサービスを起動**
   ```bash
   docker-compose up -d
   ```

3. **管理画面にアクセス**
   ```
   http://localhost:3000
   ```

4. **表示システムの確認**
   ```
   http://localhost:8080/api/status
   ```

## 使用方法

### 1. 基本設定
1. 管理画面（http://localhost:3000）にアクセス
2. 「設定管理」タブで新しい設定を追加
3. 表示モードを選択（単一画面、左右分割、上下分割）
4. URLを設定し、「設定を保存」をクリック

### 2. 認証情報の設定
1. 「認証情報」タブにアクセス
2. ログインが必要なサイトのドメイン、ユーザー名、パスワードを入力
3. 「認証情報を保存」をクリック

### 3. 表示制御
1. 「表示制御」タブで現在の設定を確認
2. 「画面を再読み込み」で表示を更新
3. 「ステータス確認」でシステムの状態を確認

## API エンドポイント

### 管理画面 API (Port 3000)
- `GET /api/configs` - 設定一覧の取得
- `POST /api/configs` - 新しい設定の追加
- `PUT /api/configs/:id` - 設定の更新
- `DELETE /api/configs/:id` - 設定の削除
- `GET /api/current-config` - 現在の設定の取得
- `POST /api/set-current-config` - 現在の設定の変更
- `GET /api/auth-credentials` - 認証情報一覧の取得
- `POST /api/auth-credentials` - 認証情報の追加
- `DELETE /api/auth-credentials/:id` - 認証情報の削除

### 表示システム API (Port 8080)
- `GET /api/status` - システムステータス
- `GET /api/reload` - 表示の再読み込み

## データベース構造

### signage_configs テーブル
```sql
CREATE TABLE signage_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    display_mode TEXT NOT NULL,
    primary_url TEXT NOT NULL,
    secondary_url TEXT,
    refresh_interval INTEGER DEFAULT 300,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### auth_credentials テーブル
```sql
CREATE TABLE auth_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## トラブルシューティング

### よくある問題

1. **表示システムが起動しない**
   - X Window Systemが起動していることを確認
   - `xhost +local:docker` でDockerからのアクセスを許可

2. **認証が失敗する**
   - 認証情報が正しく設定されているか確認
   - 対象サイトのログインフォームが変更されていないか確認

3. **画面が更新されない**
   - 「表示制御」タブで「画面を再読み込み」を実行
   - ネットワーク接続を確認

### ログの確認
```bash
# 管理画面のログ
docker logs signage-manager

# 表示システムのログ
docker logs signage-display
```

## 今後の拡張予定

- スケジュール機能の実装
- 複数画面対応
- リモート管理機能
- 統計・レポート機能
- セキュリティ強化（HTTPS、認証）

## ライセンス

MIT License

## 作者

Claude Code で生成されたプロジェクト