import renderMathInElement from "katex/dist/contrib/auto-render";
import "katex/dist/katex.min.css";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Annotation } from "../types";

interface Props {
  data: Annotation;
  scale: number;
  isSelected: boolean;
  onUpdate: (id: number, newText: string) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onSelect: () => void;
}

const LatexAnnotation: React.FC<Props> = ({ 
  data, 
  scale, 
  isSelected, 
  onUpdate,
  onMouseDown,
  onSelect
}) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(data.isNew);
  const [text, setText] = useState(data.content);
  const containerRef = useRef<HTMLDivElement>(null);
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
        if (!isEditing) onMouseDown(e);
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
            if (!isComposing) setText(e.target.value);
          }}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={(e) => {
            setIsComposing(false);
            setText(e.currentTarget.value);
          }}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.ctrlKey || e.metaKey) return;
            e.stopPropagation();
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          style={{ fontSize: "16px", padding: "4px" }}
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
          }}
        />
      )}
    </div>
  );
};

export default LatexAnnotation;