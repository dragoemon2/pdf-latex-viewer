import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import renderMathInElement from "katex/dist/contrib/auto-render";
import "katex/dist/katex.min.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import "./App.css";
import Sidebar, { SearchResult, SidebarTab } from './components/Sidebar';

const pdfOptions = {
  cMapUrl: new URL('/cmaps/', window.location.origin).toString(),
  cMapPacked: true,
  standardFontDataUrl: new URL('/standard_fonts/', window.location.origin).toString(),
};

const LANGUAGES = [
  { code: 'ja', label: '🇯🇵日本語' },
  { code: 'en', label: '🇺🇸English' },
  // { code: 'zh', label: '🇨🇳中文' }, 
  // { code: 'de', label: '🇩🇪Deutsch' },
];

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

console.log(`PDF.js Version: ${pdfjs.version}`);

// const pdfOptions = {
//   cMapUrl: new URL('/cmaps/', window.location.origin).toString(),
//   cMapPacked: true,
//   standardFontDataUrl: new URL('/standard_fonts/', window.location.origin).toString(),
// };

interface Annotation {
  id: number;
  page: number;
  x: number;
  y: number;
  content: string;
  isNew?: boolean;
  fontSize?: number;
}

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
  // 👇 翻訳フックを使用
  const { t, i18n } = useTranslation();

  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [scale, setScale] = useState(1.0);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [numPages, setNumPages] = useState<number>(0); 
  const [isDirty, setIsDirty] = useState(false);
  const [pdfDocument, setPdfDocument] = useState<any>(null); 
  const [searchText, setSearchText] = useState("");          
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);   
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("thumbs");

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const isDirtyRef = useRef(false);
  const pdfUrlRef = useRef<string | null>(null);

  // const pdfOptions = useMemo(() => ({
  //   cMapUrl: new URL('/cmaps/', window.location.origin).toString(),
  //   cMapPacked: true,
  //   standardFontDataUrl: new URL('/standard_fonts/', window.location.origin).toString(),
  // }), []); // 空の配列を渡すことで、アプリ起動時に1回だけ作成される

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  // 初期化ロード
  useEffect(() => {
    const checkStartupFile = async () => {
      try {
        const path = await invoke<string | null>("get_startup_file");
        if (path) {
          setNumPages(0); 
          setAnnotations([]);
          setPdfPath(path);
          setPdfDocument(null);

          const base64 = await invoke<string>("open_pdf_file", { path });
          
          if (pdfUrlRef.current) {
             URL.revokeObjectURL(pdfUrlRef.current);
          }
          const blob = base64ToBlob(base64);
          const url = URL.createObjectURL(blob);
          pdfUrlRef.current = url;
          setPdfData(url);

          try {
             const loadedAnnots = await invoke<Annotation[]>("load_annotations", { path });
             const formatted = loadedAnnots.map((a, i) => ({...a, id: Date.now() + i}));
             setAnnotations(formatted);
          } catch (e) {
             setAnnotations([]);
          }
        }
      } catch (e) {
        console.error("Failed to check startup file", e);
      }
    };
    checkStartupFile();
  }, []);

  const onDocumentLoadSuccess = (pdf: any) => {
    setNumPages(pdf.numPages);
    setPdfDocument(pdf);
    setSearchResults([]);
    setSearchText("");
  };

  const handleOpenFile = async () => {
    if (isDirty) {
      const confirmed = await ask(t('dialog.unsavedChanges'), {
        title: t('dialog.warning'),
        kind: 'warning',
        okLabel: t('dialog.discardAndOpen'),
        cancelLabel: t('dialog.cancel'),
      });
      if (!confirmed) return;
    }

    try {
      const selectedPath = await open({
        multiple: false,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (selectedPath && typeof selectedPath === 'string') {
        setNumPages(0);
        setAnnotations([]);
        setPdfPath(selectedPath);
        setPdfDocument(null); 
        
        setPdfData(null);
        
        const base64 = await invoke<string>("open_pdf_file", { path: selectedPath });

        if (pdfUrlRef.current) {
          URL.revokeObjectURL(pdfUrlRef.current);
          pdfUrlRef.current = null;
        }

        const blob = base64ToBlob(base64);
        const url = URL.createObjectURL(blob);
        pdfUrlRef.current = url;
        setPdfData(url);

        virtuosoRef.current?.scrollToIndex({ index: 0 });

        try {
           const loadedAnnots = await invoke<Annotation[]>("load_annotations", { path: selectedPath });
           const formatted = loadedAnnots.map((a, i) => ({...a, id: Date.now() + i}));
           setAnnotations(formatted);
        } catch (e) {
           setAnnotations([]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const updateTitle = async () => {
      try {
        const appWindow = getCurrentWindow();
        if (pdfPath) {
          const fileName = pdfPath.split(/[/\\]/).pop() || "PDF Viewer";
          await appWindow.setTitle(fileName);
        } else {
          await appWindow.setTitle("PDF Latex Viewer");
        }
      } catch (e) {
        console.error(e);
      }
    };
    updateTitle();
  }, [pdfPath]);

  const handleSave = useCallback(async () => {
    if (!pdfPath) return;
    try {
      await invoke("save_pdf_with_annotations", { 
        path: pdfPath, 
        annotations: annotations 
      });
      setIsDirty(false);
      // alert(t('dialog.saveSuccess')); // 必要ならコメントアウト解除
    } catch (e) {
      alert(t('dialog.saveFailed'));
    }
  }, [pdfPath, annotations, t]);

  const handleSaveAs = useCallback(async () => {
    try {
      const newPath = await save({
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
        defaultPath: 'annotated.pdf'
      });
      if (newPath) {
        await invoke("save_pdf_with_annotations", { 
          path: newPath, 
          annotations: annotations 
        });
        setPdfPath(newPath); 
        alert(`${t('dialog.saveSuccess')}\n${newPath}`);
      }
    } catch (e) {
      alert(t('dialog.saveCancelled'));
    }
  }, [annotations, t]);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.key === "Delete" || e.key === "Backspace") && selectedId !== null) {
          const activeTag = document.activeElement?.tagName.toLowerCase();
          if (activeTag !== "input" && activeTag !== "textarea") {
            setAnnotations((prev) => prev.filter(a => a.id !== selectedId));
            setSelectedId(null);
            setIsDirty(true);
          }
        }

      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (e.shiftKey) {
          handleSaveAs();
        } else {
          if (pdfPath) handleSave(); else handleSaveAs();
        }
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=' || e.key === ';')) {
        e.preventDefault();
        if (selectedId !== null) {
          setIsDirty(true);
          setAnnotations(prev => prev.map(a => {
            if (a.id === selectedId) return { ...a, fontSize: (a.fontSize || 20) + 2 };
            return a;
          }));
        } else {
          setScale(s => parseFloat((s + 0.2).toFixed(1)));
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        if (selectedId !== null) {
          setIsDirty(true);
          setAnnotations(prev => prev.map(a => {
            if (a.id === selectedId) return { ...a, fontSize: Math.max(10, (a.fontSize || 20) - 2) };
            return a;
          }));
        } else {
          setScale(s => Math.max(0.4, parseFloat((s - 0.2).toFixed(1))));
        }
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        if (pdfPath) openPath(pdfPath).catch(console.error);
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        handleOpenFile();
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setSidebarTab("search");
      }

      if (e.key === "Escape") {
        setContextMenu(null);
        setSelectedId(null);}
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, pdfPath, handleSave, handleSaveAs, handleOpenFile]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState) return;
      const deltaX = (e.clientX - dragState.startX) / scale;
      const deltaY = (e.clientY - dragState.startY) / scale;
      setAnnotations((prev) => prev.map(a => {
        if (a.id === dragState.id) {
          return {
            ...a,
            x: dragState.initialAnnotX + deltaX,
            y: dragState.initialAnnotY + deltaY
          };
        }
        return a;
      }));
    };
    const handleMouseUp = () => {
      setDragState(null);
      setIsDirty(true);
    };
    if (dragState) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, scale]);

  const handleContextMenu = (e: React.MouseEvent, pageNumber: number) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setContextMenu({
      mouseX: e.clientX,
      mouseY: e.clientY,
      pdfX: (e.clientX - rect.left) / scale,
      pdfY: (e.clientY - rect.top) / scale,
      page: pageNumber 
    });
  };

  const executeAddAnnotation = () => {
    if (!contextMenu) return;
    const newAnnot: Annotation = {
      id: Date.now(),
      page: contextMenu.page,
      x: contextMenu.pdfX, 
      y: contextMenu.pdfY, 
      content: "",
      isNew: true
    };
    setAnnotations([...annotations, newAnnot]);
    setIsDirty(true);
    setSelectedId(newAnnot.id);
    setContextMenu(null);
  };

  const handleBackgroundClick = () => {
    setSelectedId(null);
    setContextMenu(null);
  };

  const updateAnnotation = (id: number, newText: string) => {
    setAnnotations(annotations.map(a => a.id === id ? { ...a, content: newText, isNew: false } : a));
    setIsDirty(true);
  };

  const handleJumpToPage = (pageNumber: number) => {
    virtuosoRef.current?.scrollToIndex({
      index: pageNumber - 1, 
      align: 'start'
    });
  };

  const handleSearch = async (query: string) => {
    setSearchText(query);
    if (!query || !pdfDocument) {
      setSearchResults([]);
      return;
    }
    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const fullText = textContent.items.map((item: any) => item.str).join("");
      const lowerFullText = fullText.toLowerCase();

      let startIndex = 0;
      let matchIndex = 0;
      while (true) {
        const index = lowerFullText.indexOf(lowerQuery, startIndex);
        if (index === -1) break;
        const startContext = Math.max(0, index - 20);
        const endContext = Math.min(fullText.length, index + query.length + 20);
        const contextStr = fullText.slice(startContext, endContext);
        results.push({ page: i, matchIndex: matchIndex, context: contextStr });
        startIndex = index + query.length;
        matchIndex++;
      }
    }
    setSearchResults(results);
  };

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const unlistenPromise = appWindow.onCloseRequested(async (event) => {
      if (isDirtyRef.current) {
        event.preventDefault();
        const confirmed = await ask(t('dialog.unsavedChangesClose'), {
          title: t('dialog.confirmClose'),
          kind: 'warning',
          okLabel: t('dialog.close'),
          cancelLabel: t('dialog.cancel'),
        });
        if (confirmed) {
          isDirtyRef.current = false;
          setIsDirty(false); 
          await appWindow.close();
        }
      }
    });
    return () => { unlistenPromise.then(unlisten => unlisten()); };
  }, [t]);

  // アプリ終了時の掃除
  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
      }
    };
  }, []);

  // 言語切り替え関数
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lang = e.target.value;
    i18n.changeLanguage(lang);
  };

  return (
    <div className="app-layout" onMouseDown={() => setContextMenu(null)}>
      <div className="sidebar-container">
        {/* Sidebarも内部で t() を使うべきですが、今回はApp.tsxのみの修正なのでProps等はそのまま */}
        <Sidebar 
          pdfDocument={pdfDocument} 
          pdfData={pdfData}         
          numPages={numPages}
          annotations={annotations}
          onJumpToPage={handleJumpToPage}
          pdfOptions={pdfOptions}
          searchText={searchText}
          onSearchChange={handleSearch}
          searchResults={searchResults}
          onResultClick={(res) => handleJumpToPage(res.page)}
          activeTab={sidebarTab}
          onTabChange={setSidebarTab}
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
            position: "fixed",
            top: contextMenu.mouseY,
            left: contextMenu.mouseX,
            background: "white",
            border: "1px solid #ccc",
            boxShadow: "2px 2px 5px rgba(0,0,0,0.2)",
            zIndex: 1000,
            padding: "5px 0",
            borderRadius: "4px"
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div 
            onClick={executeAddAnnotation}
            style={{ padding: "8px 20px", cursor: "pointer", fontSize: "14px" }}
          >
            {t('ui.addAnnotation')}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;