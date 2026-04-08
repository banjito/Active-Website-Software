import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';

export interface LetterImageHandlerRef {
  insertImage: () => void;
  handlePaste: (e: React.ClipboardEvent) => boolean;
}

interface Props {
  editorRef: React.RefObject<HTMLDivElement | null>;
  onContentChange: () => void;
}

export const LetterImageHandler = forwardRef<LetterImageHandlerRef, Props>(
  ({ editorRef, onContentChange }, ref) => {
    const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
    const [imgRect, setImgRect] = useState<DOMRect | null>(null);
    const [isResizing, setIsResizing] = useState<string | null>(null);
    const [dropLineY, setDropLineY] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const resizeStartRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
    const aspectRef = useRef(1);
    const dragImgRef = useRef<HTMLImageElement | null>(null);
    const lastDropClientY = useRef(0);

    // ── Insert image as HTML ──
    const insertImageHtml = useCallback((dataUrl: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }

      const html = `<img src="${dataUrl}" style="max-width:100%;height:auto;cursor:pointer;" />`;
      document.execCommand('insertHTML', false, html);
      onContentChange();
    }, [editorRef, onContentChange]);

    // ── File picker ──
    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file?.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => insertImageHtml(reader.result as string);
      reader.readAsDataURL(file);
      e.target.value = '';
    }, [insertImageHtml]);

    // ── Imperative API (insert + paste) ──
    useImperativeHandle(ref, () => ({
      insertImage: () => fileInputRef.current?.click(),
      handlePaste: (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return false;

        let hasHtml = false;
        let imageItem: DataTransferItem | null = null;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type === 'text/html') hasHtml = true;
          if (items[i].type.startsWith('image/')) imageItem = items[i];
        }
        if (hasHtml) return false;

        if (imageItem) {
          e.preventDefault();
          const file = imageItem.getAsFile();
          if (!file) return false;
          const reader = new FileReader();
          reader.onload = () => insertImageHtml(reader.result as string);
          reader.readAsDataURL(file);
          return true;
        }
        return false;
      },
    }), [insertImageHtml]);

    // ── Click to select image ──
    useEffect(() => {
      const editor = editorRef.current;
      if (!editor) return;

      const handleClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'IMG' && editor.contains(target)) {
          e.preventDefault();
          const img = target as HTMLImageElement;
          setSelectedImg(img);
          aspectRef.current = (img.naturalWidth || img.offsetWidth) / (img.naturalHeight || img.offsetHeight || 1);
          setImgRect(img.getBoundingClientRect());
        }
      };

      editor.addEventListener('click', handleClick);
      return () => editor.removeEventListener('click', handleClick);
    }, [editorRef]);

    // ── Deselect on outside click ──
    useEffect(() => {
      if (!selectedImg) return;

      const handleMouseDown = (e: MouseEvent) => {
        if (isResizing) return;
        const target = e.target as HTMLElement;
        if (
          target.tagName === 'IMG' ||
          target.closest('[data-image-resize-handle]') ||
          target.closest('[data-image-resize-toolbar]')
        ) return;
        setSelectedImg(null);
      };

      document.addEventListener('mousedown', handleMouseDown);
      return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [selectedImg, isResizing]);

    // ── Keep overlay position in sync ──
    useEffect(() => {
      if (!selectedImg) return;
      const update = () => {
        if (document.body.contains(selectedImg)) {
          setImgRect(selectedImg.getBoundingClientRect());
        } else {
          setSelectedImg(null);
        }
      };
      window.addEventListener('scroll', update, true);
      window.addEventListener('resize', update);
      const interval = setInterval(update, 200);
      return () => {
        window.removeEventListener('scroll', update, true);
        window.removeEventListener('resize', update);
        clearInterval(interval);
      };
    }, [selectedImg]);

    // ── Grab cursor on selected image ──
    useEffect(() => {
      if (!selectedImg) return;
      const prev = selectedImg.style.cursor;
      selectedImg.style.cursor = 'grab';
      return () => {
        if (document.body.contains(selectedImg)) selectedImg.style.cursor = prev || 'pointer';
      };
    }, [selectedImg]);

    // ── Corner drag-to-RESIZE ──
    const handleCornerMouseDown = useCallback((corner: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!selectedImg) return;
      setIsResizing(corner);
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        w: selectedImg.offsetWidth,
        h: selectedImg.offsetHeight,
      };
    }, [selectedImg]);

    useEffect(() => {
      if (!isResizing || !selectedImg) return;

      const handleMouseMove = (e: MouseEvent) => {
        const dx = e.clientX - resizeStartRef.current.x;
        const { w } = resizeStartRef.current;
        let newWidth: number;
        if (isResizing === 'se' || isResizing === 'ne') {
          newWidth = Math.max(30, w + dx);
        } else {
          newWidth = Math.max(30, w - dx);
        }
        selectedImg.style.width = `${Math.round(newWidth)}px`;
        selectedImg.style.height = 'auto';
        setImgRect(selectedImg.getBoundingClientRect());
      };

      const handleMouseUp = () => {
        setIsResizing(null);
        onContentChange();
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }, [isResizing, selectedImg, onContentChange]);

    // ── Preset width buttons ──
    const setImageWidthPercent = useCallback((percent: number) => {
      if (!selectedImg || !editorRef.current) return;
      const containerWidth = editorRef.current.clientWidth - 64;
      const newWidth = Math.round(containerWidth * percent / 100);
      selectedImg.style.width = `${newWidth}px`;
      selectedImg.style.height = 'auto';
      setImgRect(selectedImg.getBoundingClientRect());
      onContentChange();
    }, [selectedImg, editorRef, onContentChange]);

    const deleteImage = useCallback(() => {
      if (!selectedImg) return;
      selectedImg.remove();
      setSelectedImg(null);
      onContentChange();
    }, [selectedImg, onContentChange]);

    // ── Drag-to-REPOSITION ──
    useEffect(() => {
      const editor = editorRef.current;
      if (!editor) return;

      const onDragStart = (e: DragEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'IMG' || !editor.contains(target)) return;
        if (target.closest('.scope-notes-section')) return;

        dragImgRef.current = target as HTMLImageElement;
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('application/amp-image-move', '1');
        }
        setSelectedImg(null);
      };

      const findDropLine = (clientX: number, clientY: number): number | null => {
        const letterRoot = (editor.querySelector('#letter-proposal') || editor) as HTMLElement;
        const children = Array.from(letterRoot.children).filter(c => c !== dragImgRef.current);
        if (children.length === 0) return letterRoot.getBoundingClientRect().top;

        let bestY = (children[0] as HTMLElement).getBoundingClientRect().top;
        let bestDist = Math.abs(clientY - bestY);

        for (const child of children) {
          const bottom = (child as HTMLElement).getBoundingClientRect().bottom;
          const dist = Math.abs(clientY - bottom);
          if (dist < bestDist) {
            bestDist = dist;
            bestY = bottom;
          }
        }
        return bestY;
      };

      const onDragOver = (e: DragEvent) => {
        if (!dragImgRef.current) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        lastDropClientY.current = e.clientY;

        const lineY = findDropLine(e.clientX, e.clientY);
        setDropLineY(lineY);
      };

      const onDrop = (e: DragEvent) => {
        const img = dragImgRef.current;
        if (!img) return;
        e.preventDefault();
        e.stopPropagation();

        const letterRoot = (editor.querySelector('#letter-proposal') || editor) as HTMLElement;
        const children = Array.from(letterRoot.children).filter(c => c !== img);
        const clientY = lastDropClientY.current;

        // Find which boundary (top of first child, or bottom of any child) is closest
        let insertBefore: Node | null = null;
        if (children.length > 0) {
          let bestDist = Math.abs(clientY - (children[0] as HTMLElement).getBoundingClientRect().top);
          insertBefore = children[0];

          for (let i = 0; i < children.length; i++) {
            const bottom = (children[i] as HTMLElement).getBoundingClientRect().bottom;
            const dist = Math.abs(clientY - bottom);
            if (dist < bestDist) {
              bestDist = dist;
              insertBefore = children[i + 1] || null;
            }
          }
        }

        if (img.parentNode) img.parentNode.removeChild(img);
        if (insertBefore) {
          letterRoot.insertBefore(img, insertBefore);
        } else {
          letterRoot.appendChild(img);
        }

        setSelectedImg(img);
        aspectRef.current = (img.naturalWidth || img.offsetWidth) / (img.naturalHeight || img.offsetHeight || 1);
        requestAnimationFrame(() => setImgRect(img.getBoundingClientRect()));
        onContentChange();

        dragImgRef.current = null;
        setDropLineY(null);
      };

      const onDragEnd = () => {
        dragImgRef.current = null;
        setDropLineY(null);
      };

      editor.addEventListener('dragstart', onDragStart);
      editor.addEventListener('dragover', onDragOver);
      editor.addEventListener('drop', onDrop);
      editor.addEventListener('dragend', onDragEnd);

      return () => {
        editor.removeEventListener('dragstart', onDragStart);
        editor.removeEventListener('dragover', onDragOver);
        editor.removeEventListener('drop', onDrop);
        editor.removeEventListener('dragend', onDragEnd);
      };
    }, [editorRef, onContentChange]);

    // ── Render ──
    const HANDLE_SIZE = 10;
    const handles = imgRect ? [
      { id: 'nw', top: imgRect.top - HANDLE_SIZE / 2, left: imgRect.left - HANDLE_SIZE / 2, cursor: 'nw-resize' as const },
      { id: 'ne', top: imgRect.top - HANDLE_SIZE / 2, left: imgRect.right - HANDLE_SIZE / 2, cursor: 'ne-resize' as const },
      { id: 'sw', top: imgRect.bottom - HANDLE_SIZE / 2, left: imgRect.left - HANDLE_SIZE / 2, cursor: 'sw-resize' as const },
      { id: 'se', top: imgRect.bottom - HANDLE_SIZE / 2, left: imgRect.right - HANDLE_SIZE / 2, cursor: 'se-resize' as const },
    ] : [];

    const editorRect = editorRef.current?.getBoundingClientRect();

    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />

        {/* Drop indicator line during drag-to-reposition */}
        {dropLineY != null && editorRect && (
          <div style={{
            position: 'fixed',
            top: dropLineY - 1.5,
            left: editorRect.left + 32,
            width: editorRect.width - 64,
            height: 3,
            backgroundColor: '#3b82f6',
            zIndex: 10001,
            pointerEvents: 'none',
            borderRadius: 2,
            boxShadow: '0 0 4px rgba(59,130,246,0.5)',
          }} />
        )}

        {selectedImg && imgRect && (
          <>
            {/* Blue selection border */}
            <div style={{
              position: 'fixed',
              top: imgRect.top - 2,
              left: imgRect.left - 2,
              width: imgRect.width + 4,
              height: imgRect.height + 4,
              border: '2px solid #3b82f6',
              pointerEvents: 'none',
              zIndex: 9999,
              borderRadius: 2,
            }} />

            {/* Corner resize handles */}
            {handles.map(h => (
              <div
                key={h.id}
                data-image-resize-handle
                onMouseDown={(e) => handleCornerMouseDown(h.id, e)}
                style={{
                  position: 'fixed',
                  top: h.top,
                  left: h.left,
                  width: HANDLE_SIZE,
                  height: HANDLE_SIZE,
                  backgroundColor: '#3b82f6',
                  border: '1.5px solid white',
                  borderRadius: 2,
                  cursor: h.cursor,
                  zIndex: 10000,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                }}
              />
            ))}

            {/* Toolbar below image */}
            <div
              data-image-resize-toolbar
              style={{
                position: 'fixed',
                top: imgRect.bottom + 8,
                left: Math.max(imgRect.left, 8),
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                backgroundColor: 'white',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                padding: '4px 8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 10000,
                fontSize: 12,
                userSelect: 'none',
              }}
            >
              {[25, 50, 75, 100].map(pct => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setImageWidthPercent(pct)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 4,
                    border: '1px solid #d1d5db',
                    backgroundColor: '#f9fafb',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 500,
                    lineHeight: '16px',
                  }}
                  onMouseOver={(e) => { (e.target as HTMLElement).style.backgroundColor = '#e5e7eb'; }}
                  onMouseOut={(e) => { (e.target as HTMLElement).style.backgroundColor = '#f9fafb'; }}
                >
                  {pct}%
                </button>
              ))}

              <span style={{ color: '#6b7280', margin: '0 4px', fontSize: 11, whiteSpace: 'nowrap' }}>
                {Math.round(imgRect.width)} × {Math.round(imgRect.height)}
              </span>

              <button
                type="button"
                onClick={deleteImage}
                style={{
                  padding: '3px 10px',
                  borderRadius: 4,
                  border: '1px solid #fca5a5',
                  backgroundColor: '#fef2f2',
                  color: '#dc2626',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 500,
                  lineHeight: '16px',
                }}
                onMouseOver={(e) => { (e.target as HTMLElement).style.backgroundColor = '#fee2e2'; }}
                onMouseOut={(e) => { (e.target as HTMLElement).style.backgroundColor = '#fef2f2'; }}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </>
    );
  }
);

LetterImageHandler.displayName = 'LetterImageHandler';
