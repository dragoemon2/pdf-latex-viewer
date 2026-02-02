// src/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// 辞書データ
const resources = {
  ja: {
    translation: {
      ui: {
        open: "📂 開く",
        save: "💾 保存",
        saveAs: "💾 別名保存",
        zoomIn: "🔍 拡大",
        zoomOut: "🔍 縮小",
        noFile: "ファイル未選択",
        loading: "読み込み中...",
        addAnnotation: "➕ アノテーションを追加",
        error: "エラー"
      },
      dialog: {
        warning: "警告",
        confirmClose: "終了の確認",
        unsavedChanges: "保存されていない変更があります。\n変更を破棄して別のファイルを開きますか？",
        unsavedChangesClose: "保存されていない変更があります。\n変更を破棄して終了しますか？",
        discardAndOpen: "破棄して開く",
        close: "終了する",
        cancel: "キャンセル",
        saveSuccess: "保存しました！",
        saveFailed: "保存に失敗しました",
        saveCancelled: "保存にキャンセルまたは失敗しました"
      }
    }
  },
  en: {
    translation: {
      ui: {
        open: "📂 Open",
        save: "💾 Save",
        saveAs: "💾 Save As",
        zoomIn: "🔍 Zoom In",
        zoomOut: "🔍 Zoom Out",
        noFile: "No file selected",
        loading: "Loading...",
        addAnnotation: "➕ Add Annotation",
        error: "Error"
      },
      dialog: {
        warning: "Warning",
        confirmClose: "Confirm Exit",
        unsavedChanges: "You have unsaved changes.\nDo you want to discard changes and open another file?",
        unsavedChangesClose: "You have unsaved changes.\nDo you want to discard changes and exit?",
        discardAndOpen: "Discard & Open",
        close: "Exit",
        cancel: "Cancel",
        saveSuccess: "Saved successfully!",
        saveFailed: "Failed to save",
        saveCancelled: "Save cancelled or failed"
      }
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: "ja", 
    fallbackLng: "en",
    interpolation: {
      escapeValue: false 
    }
  });

export default i18n;