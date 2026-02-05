import katex from "katex";
import React from "react";
import { Virtuoso } from "react-virtuoso";
// ★画像コンポーネントをインポート
import NativePdfPage from "./NativePdfPage";

export type SidebarTab = "thumbs" | "outline" | "annots" | "search";

interface SidebarProps {
  pdfPath: string | null; // Documentオブジェクトではなくパスを受け取る
  numPages: number;
  annotations: any[];
  onJumpToPage: (pageNumber: number) => void;
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  searchText: string; // IGNORE
  onSearchChange: (text: string) => void; // IGNORE
  searchResults?: any[]; // IGNORE
  onResultClick?: (result: any) => void; // IGNORE
  pdfFile?: File | null; // IGNORE
  pdfDocument?: any | null; // IGNORE
  pdfOptions?: any | null; // IGNORE
}

const Sidebar: React.FC<SidebarProps> = ({ 
  pdfPath,
  numPages, 
  annotations, 
  onJumpToPage,
  activeTab,
  onTabChange,
  searchText,
  onSearchChange,
  searchResults,
  onResultClick,
  pdfFile,
  pdfDocument,
  pdfOptions
}) => {
  const renderMathPreview = (latex: string) => {
    try {
      return { __html: katex.renderToString(latex, { throwOnError: false }) };
    } catch {
      return { __html: latex };
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", borderRight: "1px solid #ccc", background: "#f8f9fa", width: "280px" }}>
      
      {/* タブヘッダー */}
      <div style={{ display: "flex", borderBottom: "1px solid #ccc", background: "#fff", flexShrink: 0 }}>
        <TabButton label="📄" active={activeTab === "thumbs"} onClick={() => onTabChange("thumbs")} title="Thumbnails" />
        <TabButton label="📝" active={activeTab === "annots"} onClick={() => onTabChange("annots")} title="Annotations" />
        {/* 目次と検索はRust側実装待ちのため一旦無効化、あるいは非表示 */}
        {/* <TabButton label="📑" ... /> */}
        {/* <TabButton label="🔍" ... /> */}
      </div>

      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        
        {/* 1. Thumbnails: 画像コンポーネントを使用 */}
        {activeTab === "thumbs" && pdfPath && numPages > 0 && (
          <div style={{ height: "100%", width: "100%" }}>
             <Virtuoso
                style={{ height: "100%" }}
                totalCount={numPages}
                itemContent={(index) => {
                  const pageNum = index + 1;
                  return (
                    <div 
                      key={pageNum}
                      onClick={() => onJumpToPage(pageNum)}
                      style={{ cursor: "pointer", textAlign: "center", paddingTop: "15px", paddingBottom: "5px" }}
                    >
                      <div style={{ border: "1px solid #ddd", display: "inline-block", background: "white", width: "100px", minHeight: "130px" }}>
                        <NativePdfPage 
                          path={pdfPath}
                          pageIndex={index}
                          scale={0.2} // サムネイル用に低解像度でリクエスト
                        />
                      </div>
                      <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>Page {pageNum}</div>
                    </div>
                  );
                }}
              />
          </div>
        )}

        {/* 2. Annotations: 既存ロジックそのまま */}
        {activeTab === "annots" && (
           <div style={{ padding: "10px", overflowY: "auto", height: "100%" }}>
             {annotations.length === 0 && <div style={{color: "#999", textAlign: "center", marginTop: "20px"}}>No annotations</div>}
             {annotations.map((ann) => (
               <div key={ann.id} onClick={() => onJumpToPage(ann.page)} style={{ padding: "10px", border: "1px solid #eee", cursor: "pointer", background: "white", marginBottom: "8px", borderRadius: "4px" }}>
                 <div style={{ fontSize: "11px", color: "#007bff", marginBottom: "4px", fontWeight: "bold" }}>Page {ann.page}</div>
                 <div dangerouslySetInnerHTML={renderMathPreview(ann.content)} style={{ fontSize: "14px", overflowWrap: "break-word" }} />
               </div>
             ))}
           </div>
        )}
      </div>
    </div>
  );
};

const TabButton = ({ label, active, onClick, title }: any) => (
  <button onClick={onClick} title={title} style={{ flex: 1, padding: "12px 0", border: "none", background: active ? "#f8f9fa" : "white", borderBottom: active ? "3px solid #007bff" : "1px solid #ccc", color: active ? "#007bff" : "#999", cursor: "pointer", fontSize: "20px", transition: "all 0.2s" }}>
    {label}
  </button>
);

export default Sidebar;