/**
 * Rich Text Editor Component
 * 
 * A comprehensive text editor with formatting options for the Help Center.
 * Features:
 * - Bold, italic, underline, strikethrough
 * - Text size changing
 * - Text color and background color
 * - Bullet lists and numbered lists
 * - Indentation controls
 * - Text alignment
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Indent,
  Outdent,
  Type,
  Palette,
  Highlighter,
  Undo,
  Redo,
  Link,
  Image,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
  readOnly?: boolean;
}

const FONT_SIZES = [
  { label: 'Small', value: '12px' },
  { label: 'Normal', value: '16px' },
  { label: 'Large', value: '20px' },
  { label: 'X-Large', value: '24px' },
  { label: 'Heading', value: '32px' },
];

const FONT_FAMILIES = [
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: 'Times New Roman, serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier New', value: 'Courier New, monospace' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Calibri', value: 'Calibri, sans-serif' },
];

const TEXT_COLORS = [
  '#000000', '#374151', '#6B7280', '#DC2626', '#EA580C', '#F59E0B',
  '#16A34A', '#0891B2', '#2563EB', '#7C3AED', '#DB2777', '#FFFFFF',
];

const HIGHLIGHT_COLORS = [
  'transparent', '#FEF3C7', '#DCFCE7', '#DBEAFE', '#EDE9FE', '#FCE7F3',
  '#FEE2E2', '#FFEDD5', '#CFFAFE', '#E0E7FF', '#F3E8FF', '#FDF2F8',
];

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Start typing...',
  minHeight = '200px',
  className = '',
  readOnly = false,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showFontSizeMenu, setShowFontSizeMenu] = useState(false);
  const [showFontFamilyMenu, setShowFontFamilyMenu] = useState(false);
  const [showTextColorMenu, setShowTextColorMenu] = useState(false);
  const [showHighlightMenu, setShowHighlightMenu] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  // Execute formatting command
  const execCommand = useCallback((command: string, value: string | boolean = false) => {
    document.execCommand(command, false, value as string);
    editorRef.current?.focus();
  }, []);

  // Handle content change (user typing) — only report to parent; do NOT re-apply value or cursor is lost
  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  // Sync value into the div only when it changes from outside (e.g. initial load, different block).
  // Do not overwrite on every keystroke or the cursor jumps and typing appears backwards.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const next = value ?? '';
    if (el.innerHTML !== next) {
      el.innerHTML = next;
    }
  }, [value]);

  // Format button component
  const FormatButton: React.FC<{
    icon: React.ReactNode;
    command?: string;
    value?: string;
    onClick?: () => void;
    active?: boolean;
    title: string;
  }> = ({ icon, command, value, onClick, active, title }) => (
    <button
      type="button"
      onClick={() => {
        if (onClick) {
          onClick();
        } else if (command) {
          execCommand(command, value || false);
        }
      }}
      className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-dark-100 transition-colors ${
        active ? 'bg-gray-200 dark:bg-dark-200' : ''
      }`}
      title={title}
      disabled={readOnly}
    >
      {icon}
    </button>
  );

  // Handle pasting plain text
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  // Handle link insertion
  const insertLink = () => {
    if (linkUrl) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const text = selection.toString() || linkUrl;
        execCommand('insertHTML', `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer" class="text-[#f26722] hover:underline">${text}</a>`);
      }
    }
    setShowLinkInput(false);
    setLinkUrl('');
  };

  return (
    <div className={`border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden ${className}`}>
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-0.5 p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
          {/* Undo/Redo */}
          <FormatButton icon={<Undo className="w-4 h-4" />} command="undo" title="Undo" />
          <FormatButton icon={<Redo className="w-4 h-4" />} command="redo" title="Redo" />
          
          <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
          
          {/* Font Size Dropdown */}
          {/* Font Family Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowFontFamilyMenu(!showFontFamilyMenu);
                setShowFontSizeMenu(false);
                setShowTextColorMenu(false);
                setShowHighlightMenu(false);
              }}
              className="flex items-center gap-1 px-2 py-1 text-sm rounded hover:bg-gray-100 dark:hover:bg-dark-100"
              title="Font"
            >
              <Type className="w-4 h-4" />
              <span className="text-xs">Font</span>
            </button>
            {showFontFamilyMenu && (
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-dark-150 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-10 min-w-[160px]">
                {FONT_FAMILIES.map(font => (
                  <button
                    key={font.value}
                    type="button"
                    onClick={() => {
                      execCommand('fontName', font.value);
                      setShowFontFamilyMenu(false);
                    }}
                    className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-dark-100"
                    style={{ fontFamily: font.value }}
                  >
                    {font.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowFontSizeMenu(!showFontSizeMenu);
                setShowFontFamilyMenu(false);
                setShowTextColorMenu(false);
                setShowHighlightMenu(false);
              }}
              className="flex items-center gap-1 px-2 py-1 text-sm rounded hover:bg-gray-100 dark:hover:bg-dark-100"
              title="Font Size"
            >
              <Type className="w-4 h-4" />
              <span className="text-xs">Size</span>
            </button>
            {showFontSizeMenu && (
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-dark-150 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-10">
                {FONT_SIZES.map(size => (
                  <button
                    key={size.value}
                    type="button"
                    onClick={() => {
                      execCommand('fontSize', '7');
                      // Apply custom font size via style
                      const selection = window.getSelection();
                      if (selection && selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        const span = document.createElement('span');
                        span.style.fontSize = size.value;
                        range.surroundContents(span);
                      }
                      setShowFontSizeMenu(false);
                    }}
                    className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-dark-100"
                    style={{ fontSize: size.value }}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
          
          {/* Basic Formatting */}
          <FormatButton icon={<Bold className="w-4 h-4" />} command="bold" title="Bold (Ctrl+B)" />
          <FormatButton icon={<Italic className="w-4 h-4" />} command="italic" title="Italic (Ctrl+I)" />
          <FormatButton icon={<Underline className="w-4 h-4" />} command="underline" title="Underline (Ctrl+U)" />
          <FormatButton icon={<Strikethrough className="w-4 h-4" />} command="strikeThrough" title="Strikethrough" />
          
          <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
          
          {/* Text Color */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowTextColorMenu(!showTextColorMenu);
                setShowFontSizeMenu(false);
                setShowFontFamilyMenu(false);
                setShowHighlightMenu(false);
              }}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-dark-100"
              title="Text Color"
            >
              <Palette className="w-4 h-4" />
            </button>
            {showTextColorMenu && (
              <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-dark-150 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-10">
                <div className="grid grid-cols-6 gap-1">
                  {TEXT_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => {
                        execCommand('foreColor', color);
                        setShowTextColorMenu(false);
                      }}
                      className="w-6 h-6 rounded border border-gray-300 dark:border-gray-600 hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Highlight Color */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowHighlightMenu(!showHighlightMenu);
                setShowFontSizeMenu(false);
                setShowFontFamilyMenu(false);
                setShowTextColorMenu(false);
              }}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-dark-100"
              title="Highlight"
            >
              <Highlighter className="w-4 h-4" />
            </button>
            {showHighlightMenu && (
              <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-dark-150 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-10">
                <div className="grid grid-cols-6 gap-1">
                  {HIGHLIGHT_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => {
                        execCommand('hiliteColor', color);
                        setShowHighlightMenu(false);
                      }}
                      className="w-6 h-6 rounded border border-gray-300 dark:border-gray-600 hover:scale-110 transition-transform"
                      style={{ backgroundColor: color === 'transparent' ? '#fff' : color }}
                      title={color === 'transparent' ? 'Remove highlight' : color}
                    >
                      {color === 'transparent' && <span className="text-xs">×</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
          
          {/* Lists */}
          <FormatButton icon={<List className="w-4 h-4" />} command="insertUnorderedList" title="Bullet List" />
          <FormatButton icon={<ListOrdered className="w-4 h-4" />} command="insertOrderedList" title="Numbered List" />
          
          <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
          
          {/* Indentation */}
          <FormatButton icon={<Outdent className="w-4 h-4" />} command="outdent" title="Decrease Indent" />
          <FormatButton icon={<Indent className="w-4 h-4" />} command="indent" title="Increase Indent" />
          
          <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
          
          {/* Alignment */}
          <FormatButton icon={<AlignLeft className="w-4 h-4" />} command="justifyLeft" title="Align Left" />
          <FormatButton icon={<AlignCenter className="w-4 h-4" />} command="justifyCenter" title="Align Center" />
          <FormatButton icon={<AlignRight className="w-4 h-4" />} command="justifyRight" title="Align Right" />
          
          <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
          
          {/* Link */}
          <div className="relative">
            <FormatButton 
              icon={<Link className="w-4 h-4" />} 
              onClick={() => setShowLinkInput(!showLinkInput)}
              title="Insert Link" 
            />
            {showLinkInput && (
              <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-dark-150 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-10 flex gap-2">
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      insertLink();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={insertLink}
                  className="px-2 py-1 text-sm bg-[#f26722] text-white rounded hover:bg-[#e55611]"
                >
                  Add
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Editor Area — content synced from value in useEffect only when value changes externally; not on every keystroke */}
      <div
        ref={editorRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        className={`p-4 focus:outline-none bg-white dark:bg-dark-100 text-gray-900 dark:text-white prose prose-sm dark:prose-invert max-w-none ${
          readOnly ? 'cursor-default' : ''
        }`}
        style={{ minHeight }}
        data-placeholder={placeholder}
      />
      
      <style>{`
        [data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: #9CA3AF;
          pointer-events: none;
        }
        .prose ul {
          list-style-type: disc;
          padding-left: 1.5rem;
        }
        .prose ol {
          list-style-type: decimal;
          padding-left: 1.5rem;
        }
        .prose a {
          color: #f26722;
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
};

export default RichTextEditor;

