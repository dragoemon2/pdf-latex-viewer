# PDF LaTeX Viewer 📄✨

**PDF LaTeX Viewer** は，PDFファイルに **LaTeX形式の数式** をアノテーションとして追加できる，Tauri製のデスクトップアプリケーションです．
<!-- 
![Screenshot Placeholder](https://via.placeholder.com/800x450?text=App+Screenshot+Here)
*(ここにアプリのスクリーンショットを貼ると見栄えが良くなります)* -->

## インストール



## 特徴

* **LaTeX アノテーション**: `\int`, `\sum`, `\frac` などの数式をPDF上の好きな場所に書き込めます（KaTeX採用）．
* **サイドバー機能**:
    * サムネイル一覧（仮想化対応）
    * 目次（Outline）ジャンプ
    * アノテーション一覧
    * 全文検索（Ctrl + F）
* **ネイティブな保存**: アノテーションはPDFの標準規格（FreeText Annotation）として埋め込まれるため，Adobe Acrobat等でも表示可能です．(注: 外部ビュワーはアノテーションの表示はできますが，Latexによる数式レンダリングはできません．)
* **直感的な操作**: ドラッグ移動，ダブルクリックで編集，ショートカットキー対応．

## キーボードショートカット

| キー操作 | 機能 |
| :--- | :--- |
| `Ctrl` + `O` | ファイルを開く |
| `Ctrl` + `S` | 上書き保存 |
| `Ctrl` + `Shift` + `S` | 名前を付けて保存 |
| `Ctrl` + `F` | 検索タブを開く / フォーカス |
| `Ctrl` + `+` | 拡大（選択中はフォントサイズ拡大） |
| `Ctrl` + `-` | 縮小（選択中はフォントサイズ縮小） |
| `Delete` / `Backspace` | 選択中のアノテーションを削除 |
| `Double Click` | アノテーションの編集モード |

## 技術スタック

* **Frontend**: React, TypeScript, Vite
* **Backend**: Tauri (Rust)
* **PDF Core**: `react-pdf` (PDF.js), `lopdf` (Rust)
* **Math Rendering**: KaTeX
* **Performance**: `react-virtuoso` (List Virtualization)