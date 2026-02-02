import katex from "katex";
import React, { useEffect, useRef } from "react";
import { Document, Outline, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Virtuoso } from "react-virtuoso";


export interface SearchResult {
  page: number;
  matchIndex: number;
  context: string;
}

export type SidebarTab = "thumbs" | "outline" | "annots" | "search";

interface SidebarProps {
  // 親で読み込んだPDFオブジェクト（サムネイル用）
  pdfDocument: any;
  // ファイルパスまたはデータ（目次用）
  pdfData: string | null;
  
  numPages: number;
  annotations: any[];
  onJumpToPage: (pageNumber: number, y?: number) => void;
  pdfOptions: any;
  searchText: string;
  onSearchChange: (text: string) => void;
  searchResults: SearchResult[];
  onResultClick: (result: SearchResult) => void;
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  pdfDocument,
  pdfData,
  numPages, 
  annotations, 
  onJumpToPage,
  pdfOptions,
  searchText,
  onSearchChange,
  searchResults,
  onResultClick,
  activeTab,
  onTabChange
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeTab === "search" && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 50);
    }
  }, [activeTab]);

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
        <TabButton label="📑" active={activeTab === "outline"} onClick={() => onTabChange("outline")} title="Outline" />
        <TabButton label="📝" active={activeTab === "annots"} onClick={() => onTabChange("annots")} title="Annotations" />
        <TabButton label="🔍" active={activeTab === "search"} onClick={() => onTabChange("search")} title="Search" />
      </div>

      {/* メインエリア */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        
        {/* 1. Thumbnails (仮想化 + PDFオブジェクト直渡し) */}
        {activeTab === "thumbs" && pdfDocument && (
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
                      <div style={{ border: "1px solid #ddd", display: "inline-block", boxShadow: "0 2px 5px rgba(0,0,0,0.1)", background: "white", minHeight: "130px" }}>
                        
                        {/* ▼▼▼ 親から貰った pdfDocument を直接渡す ▼▼▼ */}
                        <Page 
                          pdf={pdfDocument}
                          pageNumber={pageNum} 
                          width={100} 
                          renderTextLayer={false} 
                          renderAnnotationLayer={false} 
                          loading={<div style={{height: 140, width: 100, background: "#f8f9fa"}}></div>}
                        />

                      </div>
                      <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>Page {pageNum}</div>
                    </div>
                  );
                }}
              />
          </div>
        )}

        {/* 2. Outline (Documentコンポーネントを使用) */}
        {activeTab === "outline" && pdfData && (
          <div style={{ padding: "10px", overflowY: "auto", height: "100%" }}>
            {/* Outlineには <Document> が必須なので、ここだけ Document を使う */}
            {/* activeTabで切り替えているので、Thumbsと同時にレンダリングされず競合しにくい */}
            <Document file={pdfData} options={pdfOptions}>
              <Outline 
                onItemClick={({ pageNumber }) => {
                  const num = typeof pageNumber === 'number' ? pageNumber : parseInt(pageNumber as string);
                  if (!isNaN(num)) onJumpToPage(num);
                }} 
                className="custom-outline"
              />
            </Document>
          </div>
        )}
        
        {/* 3. Annotations */}
        {activeTab === "annots" && (
           <div style={{ padding: "10px", overflowY: "auto", height: "100%" }}>
             {annotations.length === 0 && <div style={{color: "#999", textAlign: "center", marginTop: "20px"}}>No annotations</div>}
             {annotations.map((ann) => (
               <div key={ann.id} onClick={() => onJumpToPage(ann.page, ann.y)} style={{ padding: "10px", border: "1px solid #eee", cursor: "pointer", background: "white", marginBottom: "8px", borderRadius: "4px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                 <div style={{ fontSize: "11px", color: "#007bff", marginBottom: "4px", fontWeight: "bold" }}>Page {ann.page}</div>
                 <div dangerouslySetInnerHTML={renderMathPreview(ann.content)} style={{ fontSize: "14px", overflowWrap: "break-word" }} />
               </div>
             ))}
           </div>
        )}

        {/* 4. Search */}
        {activeTab === "search" && (
           <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "10px", boxSizing: "border-box" }}>
            <div style={{ marginBottom: "10px", flexShrink: 0 }}>
              <input
                ref={searchInputRef}
                autoFocus
                type="text"
                placeholder="Search..."
                value={searchText}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                style={{ width: "100%", padding: "8px", border: "1px solid #ccc", borderRadius: "4px", boxSizing: "border-box" }}
              />
              <div style={{ fontSize: "12px", color: "#666", marginTop: "5px", textAlign: "right" }}>
                {searchText ? `${searchResults.length} matches` : "Enter text to search"}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {searchResults.map((result, idx) => (
                 <div key={`${result.page}-${result.matchIndex}-${idx}`} onClick={() => onResultClick(result)} className="search-result-item" style={{ padding: "8px", background: "white", borderBottom: "1px solid #eee", cursor: "pointer", fontSize: "13px", borderRadius: "4px", marginBottom: "4px" }}>
                    <div style={{ fontSize: "11px", fontWeight: "bold", color: "#666" }}>Page {result.page}</div>
                    <div style={{ color: "#333", lineHeight: "1.4" }}>...{result.context}...</div>
                 </div>
              ))}
              {searchText && searchResults.length === 0 && <div style={{ textAlign: "center", color: "#999", marginTop: "20px" }}>Not found</div>}
            </div>
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