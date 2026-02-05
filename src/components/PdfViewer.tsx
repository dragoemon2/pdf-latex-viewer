import React, { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { Annotation } from "../types";
import LatexAnnotation from "./LatexAnnotations";
import NativePdfPage from "./NativePdfPage";


interface PdfViewerProps {
  pdfPath: string | null;
  numPages: number;
  scale: number;
  annotations: Annotation[];
  selectedId: number | null;
  onContextMenu: (e: React.MouseEvent, page: number) => void;
  onAnnotUpdate: (id: number, text: string) => void;
  onAnnotMouseDown: (e: React.MouseEvent, id: number, x: number, y: number) => void;
  onAnnotSelect: (id: number) => void;
  onBackgroundClick: () => void;
}

const PdfViewer = forwardRef<VirtuosoHandle, PdfViewerProps>(({
  pdfPath,
  numPages,
  scale,
  annotations,
  selectedId,
  onContextMenu,
  onAnnotUpdate,
  onAnnotMouseDown,
  onAnnotSelect,
  onBackgroundClick
}, ref) => {
  const { t } = useTranslation();

  if (!pdfPath || numPages === 0) {
    return <div style={{ padding: 20, color: "white" }}>{t('ui.noFile')}</div>;
  }

  return (
    <div 
      className="pdf-scroll-container" 
      onClick={onBackgroundClick}
      style={{ height: "100%", width: "100%", overflow: "hidden" }}
    >
      <Virtuoso
        ref={ref}
        style={{ height: "100%", width: "100%" }}
        totalCount={numPages}
        overscan={10000}
        itemContent={(index) => {
          const pageNumber = index + 1;
          return (
            <div 
              key={pageNumber}
              className="pdf-page-container"
              style={{ 
                position: "relative", 
                marginBottom: "20px", 
                border: "1px solid #999",
                width: "fit-content",
                margin: "0 auto 20px auto" 
              }}
              onContextMenu={(e) => onContextMenu(e, pageNumber)}
            >
              <NativePdfPage 
                path={pdfPath}
                pageIndex={index}
                scale={scale}
              />
              
              {annotations
                .filter(ann => ann.page === pageNumber)
                .map((ann) => (
                  <LatexAnnotation 
                    key={ann.id} 
                    data={ann} 
                    scale={scale} 
                    isSelected={selectedId === ann.id} 
                    onUpdate={onAnnotUpdate} 
                    onSelect={() => onAnnotSelect(ann.id)}
                    onMouseDown={(e) => onAnnotMouseDown(e, ann.id, ann.x, ann.y)}
                  />
              ))}
            </div>
          );
        }}
      />
    </div>
  );
});

export default PdfViewer;