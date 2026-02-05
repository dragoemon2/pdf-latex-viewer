import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import "./App.css";

// 分割したコンポーネントをインポート
import Sidebar from './components/Sidebar';
import { Annotation, SearchResult, SidebarTab } from "./types";

interface ContextMenuState {
  mouseX: number;
  mouseY: number;
  pdfX: number;
  pdfY: number;
  page: number; 
}

interface DragState {
  id: number;
  startX: number;
  startY: number;
  initialAnnotX: number;
  initialAnnotY: number;
}

// Base64をBlobに変換するヘルパー関数
const base64ToBlob = (base64: string, type = "application/pdf") => {
  const binStr = window.atob(base64);
  const len = binStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return new Blob([bytes], { type });
};

const LatexAnnotation = ({ 
  data, 
  scale, 
  isSelected, 
  onUpdate,
  onMouseDown,
  onSelect
}: { 
  data: Annotation, 
  scale: number, 
  isSelected: boolean,
  onUpdate: (id: number, newText: string) => void,
  onMouseDown: (e: React.MouseEvent) => void,
  onSelect: () => void
}) => {
  const [isEditing, setIsEditing] = useState(data.isNew);
  const [text, setText] = useState(data.content);
  const containerRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isComposing, setIsComposing] = useState(false);

  useEffect(() => {
    if (!isEditing && containerRef.current) {
      containerRef.current.textContent = text;
      try {
        renderMathInElement(containerRef.current, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\(", right: "\\)", display: false },
            { left: "\\[", right: "\\]", display: true }
          ],
          throwOnError: false
        });
      } catch (e) {
        containerRef.current.innerText = t('ui.error');
      }
    }
  }, [text, isEditing, t]);

  const handleBlur = () => {
    if (inputRef.current) {
      const newText = inputRef.current.value;
      setText(newText);
      onUpdate(data.id, newText);
    }
    setIsEditing(false);
  };

  const fontSize = data.fontSize || 20;

  return (
    <div
      style={{
        position: "absolute",
        left: data.x * scale,
        top: data.y * scale,
        zIndex: isSelected ? 20 : 10,
        cursor: isEditing ? "text" : "move",
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onMouseDown={(e) => {
        if (!isEditing) {
          onMouseDown(e);
        }
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
    >


      {isEditing ? (
        <input
          ref={inputRef}
          autoFocus
          value={text}

          onChange={(e) => {
            if (!isComposing) {
              setText(e.target.value);
            }
          }}

          onCompositionStart={() => {
            setIsComposing(true);
          }}

          onCompositionEnd={(e) => {
            setIsComposing(false);
            setText(e.currentTarget.value); // 確定文字列をここで反映
          }}

          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.ctrlKey || e.metaKey) return;
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
        />
      ) : (
        <div
          className="latex-annotation"
          ref={containerRef}
          style={{
            backgroundColor: isSelected ? "rgba(230, 240, 255, 1)" : "#ffffff",
            padding: "4px 8px",
            border: isSelected ? "2px solid #007bff" : "1px solid rgba(0,0,0,0.1)",
            borderRadius: "4px",
            fontSize: `${fontSize * scale}px`,
            boxShadow: isSelected ? "0 4px 8px rgba(0,0,0,0.2)" : "0 2px 4px rgba(0,0,0,0.1)",

            userSelect: "text",
            WebkitUserSelect: "text",
            MozUserSelect: "text",
          }}
        />
      )}
    </div>
  );
};

function App() {
  const { t, i18n } = useTranslation();

  // State Management
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0); 
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [scale, setScale] = useState(1.0);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  
  // Sidebar State
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("thumbs");
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const isDirtyRef = useRef(false);

  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);

  // Load Logic
  const loadPdfFromPath = async (path: string) => {
    try {
      setPdfPath(path);
      setAnnotations([]);
      setNumPages(0);
      const count = await invoke<number>("get_pdf_page_count", { path });
      setNumPages(count);
      virtuosoRef.current?.scrollToIndex({ index: 0 });

      try {
        const loadedAnnots = await invoke<Annotation[]>("load_annotations", { path });
        const formatted = loadedAnnots.map((a, i) => ({...a, id: Date.now() + i}));
        setAnnotations(formatted);
      } catch { setAnnotations([]); }
    } catch (e) { console.error("Failed to load PDF:", e); }
  };

  // Initial Load
  useEffect(() => {
    invoke<string | null>("get_startup_file").then(path => {
      if (path) loadPdfFromPath(path);
    });
  }, []);

  // Window Title
  useEffect(() => {
    const title = pdfPath ? pdfPath.split(/[/\\]/).pop() : "PDF Viewer";
    getCurrentWindow().setTitle(title || "PDF Viewer");
  }, [pdfPath]);

  // Actions
  const handleOpenFile = async () => {
    if (isDirty && !await ask(t('dialog.unsavedChanges'), { title: t('dialog.warning'), kind: 'warning' })) return;
    const selected = await open({ multiple: false, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (typeof selected === 'string') await loadPdfFromPath(selected);
  };

  const handleSave = useCallback(async () => {
    if (!pdfPath) return;
    try {
      await invoke("save_pdf_with_annotations", { path: pdfPath, annotations });
      setIsDirty(false);
    } catch { alert(t('dialog.saveFailed')); }
  }, [pdfPath, annotations, t]);

  const handleSaveAs = useCallback(async () => {
    try {
      const newPath = await save({ filters: [{ name: 'PDF', extensions: ['pdf'] }], defaultPath: 'annotated.pdf' });
      if (newPath) {
        await invoke("save_pdf_with_annotations", { path: newPath, annotations });
        setPdfPath(newPath); 
        alert(`${t('dialog.saveSuccess')}\n${newPath}`);
      }
    } catch { alert(t('dialog.saveCancelled')); }
  }, [annotations, t]);

  // Keyboard Events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId !== null) {
        if (!["input", "textarea"].includes(document.activeElement?.tagName.toLowerCase() || "")) {
          setAnnotations(prev => prev.filter(a => a.id !== selectedId));
          setSelectedId(null);
          setIsDirty(true);
        }
      }
      if ((e.ctrlKey || e.metaKey)) {
        if (e.key === 's') { e.preventDefault(); e.shiftKey ? handleSaveAs() : (pdfPath ? handleSave() : handleSaveAs()); }
        if (e.key === '+' || e.key === '=') { e.preventDefault(); setScale(s => s + 0.2); }
        if (e.key === '-') { e.preventDefault(); setScale(s => Math.max(0.4, s - 0.2)); }
        if (e.key === 'p') { e.preventDefault(); if(pdfPath) openPath(pdfPath); }
        if (e.key === 'o') { e.preventDefault(); handleOpenFile(); }
      }
      if (e.key === "Escape") { setContextMenu(null); setSelectedId(null); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, pdfPath, handleSave, handleSaveAs]);

  // Drag Logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState) return;
      const deltaX = (e.clientX - dragState.startX) / scale;
      const deltaY = (e.clientY - dragState.startY) / scale;
      setAnnotations(prev => prev.map(a => a.id === dragState.id ? 
        { ...a, x: dragState.initialAnnotX + deltaX, y: dragState.initialAnnotY + deltaY } : a));
    };
    const handleMouseUp = () => { if (dragState) { setDragState(null); setIsDirty(true); } };
    if (dragState) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, scale]);

  // Handlers for Child Components
  const handleContextMenu = (e: React.MouseEvent, page: number) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setContextMenu({
      mouseX: e.clientX, mouseY: e.clientY,
      pdfX: (e.clientX - rect.left) / scale,
      pdfY: (e.clientY - rect.top) / scale,
      page
    });
  };

  const handleAddAnnotation = () => {
    if (!contextMenu) return;
    const newAnnot: Annotation = {
      id: Date.now(), page: contextMenu.page,
      x: contextMenu.pdfX, y: contextMenu.pdfY,
      content: "", isNew: true
    };
    setAnnotations([...annotations, newAnnot]);
    setIsDirty(true);
    setSelectedId(newAnnot.id);
    setContextMenu(null);
  };

  const updateAnnotation = (id: number, text: string) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, content: text, isNew: false } : a));
    setIsDirty(true);
  };

  return (
    <div className="app-layout" onMouseDown={() => setContextMenu(null)}>
      <div className="sidebar-container">
        <Sidebar 
          pdfPath={pdfPath}
          numPages={numPages}
          annotations={annotations}
          onJumpToPage={(p) => virtuosoRef.current?.scrollToIndex({ index: p - 1, align: 'start' })}
          activeTab={sidebarTab}
          onTabChange={setSidebarTab}
          // Search params (placeholder)
          searchText={searchText} onSearchChange={setSearchText}
          searchResults={searchResults} onResultClick={() => {}}
          pdfFile={null} pdfDocument={null} pdfOptions={null}
        />
      </div>

      <div className="main-content">
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
          {/* 左側: ファイル名 */}
          <div style={{ fontWeight: "bold", fontSize: "16px", color: "#333" }}>
            {pdfPath ? pdfPath.split(/[/\\]/).pop() : t('ui.noFile')}
            {isDirty && <span style={{color: "red", marginLeft: "5px"}}>*</span>}
          </div>

          {/* 右側: ボタン */}
          <div style={{ display: "flex", gap: "8px" }}>
            

            <button onClick={handleOpenFile}>{t('ui.open')}</button>
            <button onClick={handleSave} disabled={!pdfPath}>{t('ui.save')}</button>
            <button onClick={handleSaveAs} disabled={!pdfPath}>{t('ui.saveAs')}</button>
            <button onClick={() => setScale(s => s + 0.2)}>{t('ui.zoomIn')}</button>
            <button onClick={() => setScale(s => Math.max(0.4, s - 0.2))}>{t('ui.zoomOut')}</button>

            <select
              value={i18n.language} // 現在の言語を選択状態にする
              onChange={handleLanguageChange}
              style={{ 
                padding: "5px", 
                borderRadius: "4px", 
                border: "1px solid #999",
                cursor: "pointer",
                marginRight: "8px" // 少し間隔を空ける
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

        <div 
          className="pdf-scroll-container" 
          onClick={handleBackgroundClick}
          style={{ height: "100%", width: "100%", overflow: "hidden" }}
        >
          {pdfData && (
             <div style={{ display: 'none' }}>
                <Document 
                   file={pdfData} 
                   options={pdfOptions} 
                   onLoadSuccess={onDocumentLoadSuccess}
                />
             </div>
          )}

          {pdfDocument ? (
            <Virtuoso
              ref={virtuosoRef}
              style={{ height: "100%", width: "100%" }}
              totalCount={numPages}
              overscan={1000}
              onScroll={() => setContextMenu(null)}
              itemContent={(index) => {
                const pageNumber = index + 1;
                return (
                  <div 
                    key={pageNumber}
                    id={`page-${pageNumber}`} 
                    className="pdf-page-container"
                    style={{ 
                      position: "relative", 
                      marginBottom: "20px", 
                      border: "1px solid #999",
                      width: "fit-content", 
                      margin: "0 auto 20px auto" 
                    }}
                    onContextMenu={(e) => handleContextMenu(e, pageNumber)}
                    onClick={(e) => e.stopPropagation()} 
                  >
                    <Page 
                       pdf={pdfDocument}
                       pageNumber={pageNumber} 
                       scale={scale}
                       renderAnnotationLayer={false}
                       renderTextLayer={false}
                       devicePixelRatio={1} // 画質を制限して負荷を下げる
                       renderMode="canvas"
                       loading={<div style={{height: 1000 * scale, width: 700 * scale, background: "white"}}>{t('ui.loading')}</div>}
                       onRenderError={(e) => console.error("Render Error:", e)}
                    />
                    
                    {annotations
                      .filter(ann => ann.page === pageNumber)
                      .map((ann) => (
                        <LatexAnnotation 
                          key={ann.id} 
                          data={ann} 
                          scale={scale}
                          isSelected={selectedId === ann.id}
                          onUpdate={updateAnnotation}
                          onSelect={() => setSelectedId(ann.id)}
                          onMouseDown={(e) => {
                            setDragState({
                              id: ann.id,
                              startX: e.clientX,
                              startY: e.clientY,
                              initialAnnotX: ann.x,
                              initialAnnotY: ann.y
                            });
                          }}
                        />
                    ))}
                  </div>
                );
              }}
            />
          ) : (
            pdfData && <div style={{ color: "#fff", padding: "20px" }}>{t('ui.loading')}</div>
          )}
        </div>
      </div>

      {contextMenu && (
        <div
          style={{
            position: "fixed", top: contextMenu.mouseY, left: contextMenu.mouseX,
            background: "white", border: "1px solid #ccc", zIndex: 1000,
            padding: "5px 0", borderRadius: "4px", boxShadow: "2px 2px 5px rgba(0,0,0,0.2)"
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div onClick={handleAddAnnotation} style={{ padding: "8px 20px", cursor: "pointer" }}>
            {t('ui.addAnnotation')}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;