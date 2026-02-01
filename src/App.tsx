import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import katex from "katex";
import "katex/dist/katex.min.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import "./App.css";
import Sidebar, { SearchResult } from './components/Sidebar';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const pdfOptions = {
  cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
  cMapPacked: true,
};

interface Annotation {
  id: number;
  page: number;
  x: number;
  y: number;
  content: string;
  isNew?: boolean;
  fontSize?: number; // 👈 追加
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

  useEffect(() => {
    if (!isEditing && containerRef.current) {
      try {
        katex.render(text, containerRef.current, { throwOnError: false });
      } catch (e) {
        containerRef.current.innerText = "Error";
      }
    }
  }, [text, isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    onUpdate(data.id, text);
  };

  const fontSize = data.fontSize || 20;

  return (
    <div
      style={{
        position: "absolute",
        left: data.x * scale,
        top: data.y * scale,
        transform: "translate(0, -50%)",
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
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => { 
            if (e.ctrlKey || e.metaKey) {
              return; 
            }
            e.stopPropagation();
            if(e.key === 'Enter') handleBlur(); 
          }}
          style={{ fontSize: `${fontSize * scale}px`, padding: "4px" }}
        />
      ) : (
        <div
          className="latex-annotation"
          ref={containerRef}
          style={{
            backgroundColor: isSelected ? "rgba(230, 240, 255, 0.9)" : "rgba(255, 255, 255, 0.85)",
            padding: "4px 8px",
            border: isSelected ? "2px solid #007bff" : "1px solid rgba(0,0,0,0.1)",
            borderRadius: "4px",
            fontSize: `${fontSize * scale}px`,
            boxShadow: isSelected ? "0 4px 8px rgba(0,0,0,0.2)" : "0 2px 4px rgba(0,0,0,0.1)",
            userSelect: "none"
          }}
        />
      )}
    </div>
  );
};

function App() {
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [scale, setScale] = useState(1.0);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [numPages, setNumPages] = useState<number>(0); 
  const [isDirty, setIsDirty] = useState(false);
  const [pdfDocument, setPdfDocument] = useState<any>(null); // PDFオブジェクト本体(検索用)
  const [searchText, setSearchText] = useState("");          // 検索ボックスの文字
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]); // ヒットした結果リスト  

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  // 起動時に引数（ファイルパス）があるかチェックする
  useEffect(() => {
    const checkStartupFile = async () => {
      try {
        const path = await invoke<string | null>("get_startup_file");
        if (path) {
          setNumPages(0); 
          setAnnotations([]);
          setPdfPath(path);
          const base64 = await invoke<string>("open_pdf_file", { path });
          setPdfData(`data:application/pdf;base64,${base64}`);
          
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
  }, []); // 初回のみ実行

  const onDocumentLoadSuccess = (pdf: any) => {
    setNumPages(pdf.numPages);
    setPdfDocument(pdf); // 👈 【追加】検索用にこれを保存しておく必要があります！
    
    // ファイルが変わったら検索状態リセット
    setSearchResults([]);
    setSearchText("");
  };

  // ファイルオープン
  const handleOpenFile = async () => {
    if (isDirty) {
      const confirmed = await ask('保存されていない変更があります。\n変更を破棄して別のファイルを開きますか？', {
        title: '警告',
        kind: 'warning',
        okLabel: '破棄して開く',
        cancelLabel: 'キャンセル',
      });
      if (!confirmed) return; // キャンセルなら何もしない
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
        const base64 = await invoke<string>("open_pdf_file", { path: selectedPath });
        setPdfData(`data:application/pdf;base64,${base64}`);

        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = 0;
        }

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

  // ファイルパスが変わったらウィンドウタイトルを更新する
  useEffect(() => {
    const updateTitle = async () => {
      
      try {
        const appWindow = getCurrentWindow();
        
        if (pdfPath) {
          const fileName = pdfPath.split(/[/\\]/).pop() || "PDF Viewer";
          console.log("Updating window title to:", fileName);
          await appWindow.setTitle(fileName);
        } else {
          await appWindow.setTitle("PDF Latex Viewer");
        }
      } catch (e) {
        // もしここでエラーが出る場合は、権限設定が反映されていません
        console.error("ウィンドウタイトルの変更に失敗しました:", e);
      }
    };
    updateTitle();
  }, [pdfPath]);

  // 【上書き保存】 (Ctrl + S)
  const handleSave = useCallback(async () => {
    if (!pdfPath) return;
    try {
      await invoke("save_pdf_with_annotations", { 
        path: pdfPath, 
        annotations: annotations 
      });
      setIsDirty(false);
    } catch (e) {
      alert("保存に失敗しました");
    }
  }, [pdfPath, annotations]);

  // 【名前を付けて保存】 (Ctrl + Shift + S)
  const handleSaveAs = useCallback(async () => {
    try {
      // ダイアログを出して保存先パスを取得
      const newPath = await save({
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
        defaultPath: 'annotated.pdf'
      });
      
      if (newPath) {
        // 新しいパスに保存を実行
        await invoke("save_pdf_with_annotations", { 
          path: newPath, 
          annotations: annotations 
        });
        
        // 作業対象を新しいファイルに切り替えるなら以下を実行
        setPdfPath(newPath); 
        
        alert(`保存しました！\n${newPath}`);
      }
    } catch (e) {
      alert("保存にキャンセルまたは失敗しました");
    }
  }, [annotations]);


  // キーボードショートカットの監視 (Delete & Save)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // --- 削除機能 (Delete) ---
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId !== null) {
        if (document.activeElement === document.body) {
           setAnnotations((prev) => prev.filter(a => a.id !== selectedId));
           setSelectedId(null);
           setIsDirty(true);
        }
      }

      // --- 保存機能 (Ctrl + S / Ctrl + Shift + S) ---
      // metaKeyはMacのCommandキー対応
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault(); // ブラウザのデフォルト保存ダイアログを抑制

        if (e.shiftKey) {
          // Ctrl + Shift + S -> 名前を付けて保存
          handleSaveAs();
        } else {
          // Ctrl + S -> 上書き保存
          if (pdfPath) {
            handleSave();
          } else {
            // パスがない（未保存）場合は名前を付けて保存へ誘導
            handleSaveAs();
          }
        }
      }

      // ------- 拡大・縮小 -------
      // Ctrl + '+' or Ctrl + '=' -> 拡大
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=' || e.key === ';')) {
        e.preventDefault();
        
        // アノテーション選択中なら「そのアノテーション」を大きく
        if (selectedId !== null) {
        setIsDirty(true);
        setAnnotations(prev => prev.map(a => {
            if (a.id === selectedId) {
              // fontSizeがない場合はデフォルト20からスタート (+2ずつ)
              return { ...a, fontSize: (a.fontSize || 20) + 2 };
            }
            return a;
          }));
        } 
        // 選択してなければ「画面全体のズーム」
        else {
          setScale(s => parseFloat((s + 0.2).toFixed(1)));
        }
      }

      // 縮小 (Ctrl + -)
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();

        // アノテーション選択中なら「そのアノテーション」を小さく
        if (selectedId !== null) {
        setIsDirty(true);
        setAnnotations(prev => prev.map(a => {
            if (a.id === selectedId) {
              // 最小サイズは 10 とする
              return { ...a, fontSize: Math.max(10, (a.fontSize || 20) - 2) };
            }
            return a;
          }));
        } 
        // 選択してなければ「画面全体のズーム」
        else {
          setScale(s => Math.max(0.4, parseFloat((s - 0.2).toFixed(1))));
        }
      }

      // ------- システムのPDFビューアで開く -------
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        if (pdfPath) {
          openPath(pdfPath).catch(console.error);
        }
      }

      // ------- ファイルを開く -------
      if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        handleOpenFile();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, pdfPath, handleSave, handleSaveAs, handleOpenFile]); // 依存配列に保存関数を含める


  // ドラッグ処理
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

  // 【追加】ページジャンプ機能
  const handleJumpToPage = (pageNumber: number) => {
    // 該当するページの要素を探す
    const element = document.getElementById(`page-${pageNumber}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  // 検索
  const handleSearch = async (query: string) => {
    setSearchText(query);
    
    // クエリが空 or PDF未ロードなら結果を空にする
    if (!query || !pdfDocument) {
      setSearchResults([]);
      return;
    }

    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    // 1ページ目から全ページ走査
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      
      // ページ内のテキストを結合
      const fullText = textContent.items.map((item: any) => item.str).join("");
      const lowerFullText = fullText.toLowerCase();

      // ヒット箇所を探す
      let startIndex = 0;
      let matchIndex = 0;
      
      while (true) {
        const index = lowerFullText.indexOf(lowerQuery, startIndex);
        if (index === -1) break;

        // コンテキスト（前後の文字）を抽出
        const startContext = Math.max(0, index - 20);
        const endContext = Math.min(fullText.length, index + query.length + 20);
        const contextStr = fullText.slice(startContext, endContext);

        results.push({
          page: i,
          matchIndex: matchIndex,
          context: contextStr // サイドバーに表示する文字
        });

        startIndex = index + query.length;
        matchIndex++;
      }
    }
    setSearchResults(results);
  };

  // ウィンドウ閉じる前の確認ダイアログ
  useEffect(() => {
    const appWindow = getCurrentWindow();

    // 閉じるリクエスト（×ボタンやAlt+F4）を監視
    const unlistenPromise = appWindow.onCloseRequested(async (event) => {
      // 最新の状態をRefから取得
      if (isDirtyRef.current) {
        // 一旦閉じるのを阻止する
        event.preventDefault();

        const confirmed = await ask('保存されていない変更があります。\n変更を破棄して終了しますか？', {
          title: '終了の確認',
          kind: 'warning',
          okLabel: '終了する',
          cancelLabel: 'キャンセル',
        });

        if (confirmed) {
          // ユーザーが「終了」を選んだら
          // フラグを折ってから（ループ防止）再度閉じる
          isDirtyRef.current = false;
          setIsDirty(false); 
          await appWindow.close();
        }
      }
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, []); // 初回のみ登録

  return (
    <div className="app-layout"> {/* コンテナ変更 */}
      
      {/* 左側: サイドバー */}
      <div className="sidebar-container">
        <Sidebar 
          pdfData={pdfData}
          numPages={numPages}
          annotations={annotations}
          onJumpToPage={handleJumpToPage}
          pdfOptions={pdfOptions}
          searchText={searchText}
          onSearchChange={handleSearch}
          searchResults={searchResults}
          onResultClick={(res) => handleJumpToPage(res.page)}
        />
      </div>

      {/* 右側: メインコンテンツ */}
      <div className="main-content">
        {/* ツールバー */}
        <div className="toolbar">
          <button onClick={handleOpenFile}>📂 開く</button>
          <button onClick={handleSave} disabled={!pdfPath}>💾 保存</button>
          <button onClick={handleSaveAs} disabled={!pdfPath}>💾 別名保存</button>
          <button onClick={() => setScale(s => s + 0.2)}>🔍 拡大</button>
          <button onClick={() => setScale(s => Math.max(0.4, s - 0.2))}>🔍 縮小</button>
        </div>

        {/* PDF表示エリア (コンテナの onClick で選択解除) */}
        <div 
          className="pdf-scroll-container" 
          onClick={handleBackgroundClick}
          ref={scrollContainerRef}
        >
          {pdfData && (
            <div 
              style={{ position: "relative", width: "fit-content" }}
            >
              <Document 
                file={pdfData} 
                options={pdfOptions} 
                onLoadSuccess={onDocumentLoadSuccess}
              >
                {Array.from(new Array(numPages), (_, index) => {
                  const pageNumber = index + 1;
                  return (
                    <div 
                      key={pageNumber}
                      id={`page-${pageNumber}`} 
                      className="pdf-page-container"
                      style={{ 
                        position: "relative", 
                        marginBottom: "10px", 
                        border: "1px solid #999" 
                      }}
                      onContextMenu={(e) => handleContextMenu(e, pageNumber)}
                      onClick={(e) => e.stopPropagation()} 
                    >
                      <Page pageNumber={pageNumber} scale={scale} />
                      
                      {/* アノテーション表示 (フィルタリング) */}
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
                })}
              </Document>
            </div>
          )}
        </div>
      </div>

      {/* 右クリックメニュー (position: fixed なのでどこに置いてもOK) */}
      {contextMenu && (
        <div
           /* ... contextMenuのスタイルはそのまま ... */
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
        >
          <div 
            onClick={executeAddAnnotation}
            /* ... スタイルそのまま ... */
            style={{ padding: "8px 20px", cursor: "pointer", fontSize: "14px" }}
          >
            ➕ アノテーションを追加
          </div>
        </div>
      )}
    </div>
  );
}


export default App;