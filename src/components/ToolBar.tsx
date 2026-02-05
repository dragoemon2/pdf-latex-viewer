import React from "react";
import { useTranslation } from "react-i18next";

interface ToolbarProps {
  fileName: string | null;
  isDirty: boolean;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  currentLang: string;
  onLangChange: (lang: string) => void;
}

const LANGUAGES = [
  { code: 'ja', label: '🇯🇵日本語' },
  { code: 'en', label: '🇺🇸English' },
];

const Toolbar: React.FC<ToolbarProps> = ({
  fileName,
  isDirty,
  onOpen,
  onSave,
  onSaveAs,
  onZoomIn,
  onZoomOut,
  currentLang,
  onLangChange
}) => {
  const { t } = useTranslation();

  return (
    <div 
      className="toolbar" 
      style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between", 
        padding: "10px",
        background: "#f0f0f0", 
        borderBottom: "1px solid #ccc"
      }}
    >
      <div style={{ fontWeight: "bold", fontSize: "16px", color: "#333" }}>
        {fileName || t('ui.noFile')}
        {isDirty && <span style={{color: "red", marginLeft: "5px"}}>*</span>}
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <button onClick={onOpen}>{t('ui.open')}</button>
        <button onClick={onSave} disabled={!fileName}>{t('ui.save')}</button>
        <button onClick={onSaveAs} disabled={!fileName}>{t('ui.saveAs')}</button>
        <button onClick={onZoomIn}>{t('ui.zoomIn')}</button>
        <button onClick={onZoomOut}>{t('ui.zoomOut')}</button>

        <select
          value={currentLang} 
          onChange={(e) => onLangChange(e.target.value)}
          style={{ 
            padding: "5px", 
            borderRadius: "4px", 
            border: "1px solid #999",
            cursor: "pointer",
            marginRight: "8px" 
          }}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default Toolbar;