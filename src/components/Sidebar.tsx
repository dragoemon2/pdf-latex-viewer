import katex from "katex";
import React, { useEffect, useRef } from "react";
import { Document, Outline, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// 検索結果の型定義
export interface SearchResult {
  page: number;
  matchIndex: number;
  context: string; // 前後の文字列
}

// タブの種類の型定義（App.tsxでも使うのでexport）
export type SidebarTab = "thumbs" | "outline" | "annots" | "search";

// 親から受け取るデータの型
interface SidebarProps {
  pdfData: string | null;
  numPages: number;
  annotations: any[];
  onJumpToPage: (pageNumber: number, y?: number) => void;
  pdfOptions: any;
  
  // 検索用プロパティ
  searchText: string;
  onSearchChange: (text: string) => void;
  searchResults: SearchResult[];
  onResultClick: (result: SearchResult) => void;

  // ▼▼▼ 追加: タブ制御を親から受け取る ▼▼▼
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  pdfData, 
  numPages, 
  annotations, 
  onJumpToPage,
  pdfOptions,
  searchText,
  onSearchChange,
  searchResults,
  onResultClick,
  activeTab,   // 親から受け取る
  onTabChange  // 親から受け取る
}) => {
  
  // 内部の useState は削除しました

  // 検索入力欄への参照（フォーカス用）
  const searchInputRef = useRef<HTMLInputElement>(null);

  // activeTab が "search" に変わったら自動フォーカスする
  useEffect(() => {
    if (activeTab === "search" && searchInputRef.current) {
      // タブ切り替えの描画完了を少し待ってからフォーカス
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select(); // 入力済みなら全選択
      }, 50);
    }
  }, [activeTab]);

  // 数式のプレビュー生成
  const renderMathPreview = (latex: string) => {
    try {
      return { __html: katex.renderToString(latex, { throwOnError: false }) };
    } catch {
      return { __html: latex };
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", borderRight: "1px solid #ccc", background: "#f8f9fa", width: "280px" }}>
      {/* --- タブ切り替えヘッダー --- */}
      <div style={{ display: "flex", borderBottom: "1px solid #ccc", background: "#fff" }}>
        {/* onClick で onTabChange を呼ぶように修正 */}
        <TabButton label="📄" active={activeTab === "thumbs"} onClick={() => onTabChange("thumbs")} title="Thumbnails" />
        <TabButton label="📑" active={activeTab === "outline"} onClick={() => onTabChange("outline")} title="Outline" />
        <TabButton label="📝" active={activeTab === "annots"} onClick={() => onTabChange("annots")} title="Annotations" />
        <TabButton label="🔍" active={activeTab === "search"} onClick={() => onTabChange("search")} title="Search" />
      </div>

      {/* --- コンテンツエリア (スクロール可能) --- */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px", display: "flex", flexDirection: "column" }}>
        
        {/* 1. Thumbnails (サムネイル) */}
        {activeTab === "thumbs" && pdfData && (
          <Document file={pdfData} options={pdfOptions}>
            {Array.from(new Array(numPages), (_, index) => {
              const pageNum = index + 1;
              return (
                <div 
                  key={pageNum} 
                  onClick={() => onJumpToPage(pageNum)}
                  style={{ marginBottom: "15px", cursor: "pointer", textAlign: "center" }}
                >
                  <div style={{ border: "1px solid #ddd", display: "inline-block", boxShadow: "0 2px 5px rgba(0,0,0,0.1)" }}>
                    <Page pageNumber={pageNum} width={100} renderTextLayer={false} renderAnnotationLayer={false} />
                  </div>
                  <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>Page {pageNum}</div>
                </div>
              );
            })}
          </Document>
        )}

        {/* 2. Outline (目次) */}
        {activeTab === "outline" && pdfData && (
          <Document file={pdfData} options={pdfOptions}>
            <Outline 
              onItemClick={({ pageNumber }) => {
                const num = typeof pageNumber === 'number' ? pageNumber : parseInt(pageNumber as string);
                if (!isNaN(num)) onJumpToPage(num);
              }} 
              className="custom-outline"
            />
          </Document>
        )}

        {/* 3. Annotations (アノテーション一覧) */}
        {activeTab === "annots" && (
          <div>
            {annotations.length === 0 && <div style={{color: "#999", textAlign: "center", marginTop: "20px"}}>No annotations</div>}
            {annotations.map((ann) => (
              <div 
                key={ann.id}
                onClick={() => onJumpToPage(ann.page, ann.y)}
                style={{ 
                  padding: "10px", 
                  border: "1px solid #eee", 
                  cursor: "pointer",
                  background: "white",
                  marginBottom: "8px",
                  borderRadius: "4px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                }}
              >
                <div style={{ fontSize: "11px", color: "#007bff", marginBottom: "4px", fontWeight: "bold" }}>
                  Page {ann.page}
                </div>
                <div 
                  dangerouslySetInnerHTML={renderMathPreview(ann.content)} 
                  style={{ fontSize: "14px", overflowWrap: "break-word" }}
                />
              </div>
            ))}
          </div>
        )}

        {/* 4. Search (検索) */}
        {activeTab === "search" && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* 検索ボックス */}
            <div style={{ marginBottom: "10px", position: "sticky", top: 0, background: "#f8f9fa", paddingBottom: "5px" }}>
              <input
                ref={searchInputRef} // Refをセット
                autoFocus
                type="text"
                placeholder="Search text..."
                value={searchText}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()} // 親へのイベント伝播を防ぐ
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                  boxSizing: "border-box"
                }}
              />
              <div style={{ fontSize: "12px", color: "#666", marginTop: "5px", textAlign: "right" }}>
                {searchText ? `${searchResults.length} matches` : "Enter text to search"}
              </div>
            </div>

            {/* 結果リスト */}
            <div style={{ flex: 1 }}>
              {searchResults.map((result, idx) => (
                <div
                  key={`${result.page}-${result.matchIndex}-${idx}`}
                  onClick={() => onResultClick(result)}
                  style={{
                    padding: "8px",
                    background: "white",
                    borderBottom: "1px solid #eee",
                    cursor: "pointer",
                    fontSize: "13px",
                    borderRadius: "4px",
                    marginBottom: "4px"
                  }}
                  className="search-result-item"
                >
                  <div style={{ fontSize: "11px", fontWeight: "bold", color: "#666" }}>
                    Page {result.page}
                  </div>
                  <div style={{ color: "#333", lineHeight: "1.4" }}>
                    {/* 文脈を表示 */}
                    ...{result.context}...
                  </div>
                </div>
              ))}
              {searchText && searchResults.length === 0 && (
                <div style={{ textAlign: "center", color: "#999", marginTop: "20px" }}>
                  Not found
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// 小さなボタンコンポーネント
const TabButton = ({ label, active, onClick, title }: any) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      flex: 1,
      padding: "12px 0",
      border: "none",
      background: active ? "#f8f9fa" : "white",
      borderBottom: active ? "3px solid #007bff" : "1px solid #ccc",
      color: active ? "#007bff" : "#999",
      cursor: "pointer",
      fontSize: "20px",
      transition: "all 0.2s"
    }}
  >
    {label}
  </button>
);

export default Sidebar;