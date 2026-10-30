import React, { useState, useEffect, useRef } from 'react';
import { getLiveTextOverrides, saveLiveTextOverride } from '../utils/storage';

interface EditableTextProps {
  id: string;
  defaultText: string;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span' | 'div';
  className?: string;
  isLiveEditMode?: boolean;
}

export const EditableText: React.FC<EditableTextProps> = ({
  id,
  defaultText,
  as: Component = 'span',
  className = '',
  isLiveEditMode = false,
}) => {
  const [text, setText] = useState<string>(() => {
    const overrides = getLiveTextOverrides();
    return overrides[id] ?? defaultText;
  });

  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const overrides = getLiveTextOverrides();
    if (overrides[id] !== undefined) {
      setText(overrides[id]);
      if (ref.current && ref.current.innerText !== overrides[id]) {
        ref.current.innerText = overrides[id];
      }
    }
  }, [id, defaultText]);

  const handleBlur = (e: React.FocusEvent<HTMLElement>) => {
    const newText = e.currentTarget.innerText;
    setText(newText);
    saveLiveTextOverride(id, newText);
  };

  const editClasses = isLiveEditMode
    ? 'outline-dashed outline-2 outline-amber-400 bg-amber-50/50 hover:bg-amber-100/60 rounded px-1 cursor-text transition-all relative'
    : '';

  return (
    <Component
      ref={ref as any}
      contentEditable={isLiveEditMode}
      suppressContentEditableWarning={true}
      onBlur={handleBlur}
      title={isLiveEditMode ? 'Quyền sửa chữ đang bật: Nhấp để viết, sửa hoặc xóa text' : undefined}
      className={`${className} ${editClasses}`}
    >
      {text}
    </Component>
  );
};
