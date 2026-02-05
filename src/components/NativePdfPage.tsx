import { invoke } from "@tauri-apps/api/core";
import React, { useEffect, useState } from "react";

interface NativePdfPageProps {
  path: string;
  pageIndex: number; // 0-indexed
  scale: number;
  width?: number | string;
  onLoad?: () => void;
}

const NativePdfPage: React.FC<NativePdfPageProps> = React.memo(({ path, pageIndex, scale, width, onLoad }) => {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    // Rustの render_pdf_page コマンドを呼び出す
    // 引数: path, page_index (u16), scale (f32)
    invoke<string>("render_pdf_page", { 
      path, 
      pageIndex, 
      scale 
    })
    .then((base64) => {
      if (isMounted) {
        setImgSrc(base64); // data:image/png;base64,... が返ってくる想定
        setLoading(false);
        onLoad?.();
      }
    })
    .catch((err) => {
      console.error(`Failed to render page ${pageIndex}:`, err);
      if (isMounted) setLoading(false);
    });

    return () => { isMounted = false; };
  }, [path, pageIndex, scale]);

  return (
    <div style={{ position: "relative", minHeight: "200px", width: width || "100%" }}>
      {imgSrc ? (
        <img 
          src={imgSrc} 
          alt={`Page ${pageIndex + 1}`}
          style={{ 
            width: "100%", 
            height: "auto", 
            display: "block",
            boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
            backgroundColor: "white"
          }} 
          draggable={false}
        />
      ) : (
        // ローディング中のプレースホルダー
        <div style={{ 
          height: 800 * scale, // 仮の高さ
          width: "100%", 
          background: "#f0f0f0", 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center",
          color: "#888"
        }}>
          Loading Page {pageIndex + 1}...
        </div>
      )}
    </div>
  );
});

export default NativePdfPage;