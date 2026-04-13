/**
 * Guide Builder Component
 * 
 * Main interface for creating and editing help center guides.
 * Features:
 * - Drag & drop content blocks
 * - Rich text editing
 * - Image uploads
 * - Tables
 * - Live preview
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { isSuperUser } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Save,
  Eye,
  EyeOff,
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  Copy,
  ChevronDown,
  Heading,
  Type,
  List,
  ListOrdered,
  Image,
  Table,
  MessageSquare,
  Code,
  Video,
  Minus,
  CircleDot,
  Upload,
  X,
  Settings,
  Loader2,
  Link,
  Pencil,
  Check,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { RichTextEditor } from './RichTextEditor';

import {
  HelpGuide,
  ContentBlock,
  ContentBlockType,
  PortalCategory,
  PORTAL_CATEGORY_LABELS,
  CONTENT_BLOCK_LIBRARY,
  createEmptyBlock,
  TextBlockConfig,
  HeadingBlockConfig,
  ImageBlockConfig,
  TableBlockConfig,
  ListBlockConfig,
  CalloutBlockConfig,
  StepBlockConfig,
  VideoBlockConfig,
} from '@/lib/types/helpCenter';

// Icon mapping for content blocks
const BLOCK_ICONS: Record<ContentBlockType, React.ReactNode> = {
  [ContentBlockType.HEADING]: <Heading className="w-4 h-4" />,
  [ContentBlockType.TEXT]: <Type className="w-4 h-4" />,
  [ContentBlockType.BULLET_LIST]: <List className="w-4 h-4" />,
  [ContentBlockType.NUMBERED_LIST]: <ListOrdered className="w-4 h-4" />,
  [ContentBlockType.IMAGE]: <Image className="w-4 h-4" />,
  [ContentBlockType.TABLE]: <Table className="w-4 h-4" />,
  [ContentBlockType.CALLOUT]: <MessageSquare className="w-4 h-4" />,
  [ContentBlockType.CODE_BLOCK]: <Code className="w-4 h-4" />,
  [ContentBlockType.VIDEO]: <Video className="w-4 h-4" />,
  [ContentBlockType.DIVIDER]: <Minus className="w-4 h-4" />,
  [ContentBlockType.STEP]: <CircleDot className="w-4 h-4" />,
};

// Sortable Block Component
interface SortableBlockProps {
  block: ContentBlock;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onUpdate: (config: ContentBlock['config']) => void;
}

const SortableBlock: React.FC<SortableBlockProps> = ({
  block,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
  onUpdate,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const [isBlockResizing, setIsBlockResizing] = useState(false);
  const blockRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const resizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const isImageBlock = block.type === ContentBlockType.IMAGE;
  const imageConfig = isImageBlock ? (block.config as ImageBlockConfig) : null;
  const blockWidth = imageConfig?.width || '100%';
  const blockAlignment = imageConfig?.alignment || 'center';

  const handleBlockResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!blockRef.current || !parentRef.current) return;

    const currentBlockWidth = blockRef.current.getBoundingClientRect().width;
    resizeStartRef.current = { startX: e.clientX, startWidth: currentBlockWidth };
    setIsBlockResizing(true);

    const handleMove = (moveEvent: MouseEvent) => {
      if (!resizeStartRef.current || !parentRef.current || !imageConfig) return;
      const parentWidth = parentRef.current.getBoundingClientRect().width;
      const deltaX = moveEvent.clientX - resizeStartRef.current.startX;
      const newWidth = Math.max(80, resizeStartRef.current.startWidth + deltaX);
      const pct = Math.min(100, Math.max(10, Math.round((newWidth / parentWidth) * 100)));
      onUpdate({ ...imageConfig, width: `${pct}%` });
    };

    const handleUp = () => {
      resizeStartRef.current = null;
      setIsBlockResizing(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [imageConfig, onUpdate]);

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const blockWrapperStyle: React.CSSProperties = isImageBlock
    ? {
        width: blockWidth,
        maxWidth: '100%',
        marginLeft: blockAlignment === 'center' ? 'auto' : blockAlignment === 'right' ? 'auto' : undefined,
        marginRight: blockAlignment === 'center' ? 'auto' : undefined,
      }
    : {};

  return (
    <div ref={parentRef} style={sortableStyle}>
      <div
        ref={(node) => {
          setNodeRef(node);
          (blockRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        style={blockWrapperStyle}
        className={`group relative bg-white dark:bg-dark-150 border rounded-lg transition-all ${
          isSelected
            ? 'border-[#f26722] ring-2 ring-[#f26722]/20'
            : isBlockResizing
              ? 'border-[#f26722] ring-2 ring-[#f26722]/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
        }`}
        onClick={onSelect}
      >
        {/* Drag Handle & Actions */}
        <div className="absolute left-0 top-0 bottom-0 w-8 flex flex-col items-center justify-center gap-1 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200 rounded-l-lg opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            {...listeners}
            {...attributes}
            className="p-1 cursor-grab hover:bg-gray-200 dark:hover:bg-dark-100 rounded"
          >
            <GripVertical className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Block Content */}
        <div className="ml-8 p-4">
          <BlockEditor block={block} onUpdate={onUpdate} />
        </div>

        {/* Block Actions */}
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-100"
            title="Duplicate"
          >
            <Copy className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
            title="Delete"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>

        {/* Right-edge resize handle for image blocks */}
        {isImageBlock && imageConfig?.url && (
          <div
            onMouseDown={handleBlockResizeStart}
            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize group/resize z-10 flex items-center justify-center"
            title="Drag to resize block"
          >
            <div className={`w-1 h-12 rounded-full transition-colors ${
              isBlockResizing
                ? 'bg-[#f26722]'
                : 'bg-transparent group-hover:bg-gray-300 dark:group-hover:bg-gray-500 group-hover/resize:bg-[#f26722]'
            }`} />
          </div>
        )}

        {/* Width badge during resize */}
        {isBlockResizing && (
          <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#f26722] text-white text-xs rounded-md font-medium pointer-events-none whitespace-nowrap shadow-md">
            {blockWidth}
          </div>
        )}
      </div>
    </div>
  );
};

// Image Block Editor - handles file upload, URL entry, and editing
const MAX_IMAGE_MB = 10;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;
const ACCEPTED_IMAGES = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml,.png,.jpg,.jpeg,.gif,.webp,.svg';

interface ImageBlockEditorProps {
  imageConfig: ImageBlockConfig;
  onUpdate: (config: ContentBlock['config']) => void;
}

const ImageBlockEditor: React.FC<ImageBlockEditorProps> = ({ imageConfig, onUpdate }) => {
  const [urlInput, setUrlInput] = useState(imageConfig.url || '');
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [customWidthInput, setCustomWidthInput] = useState('');

  const WIDTH_PRESETS = [
    { label: '25%', value: '25%' },
    { label: '50%', value: '50%' },
    { label: '75%', value: '75%' },
    { label: '100%', value: '100%' },
  ];

  const ALIGNMENT_OPTIONS: { value: ImageBlockConfig['alignment']; icon: React.ReactNode; label: string }[] = [
    { value: 'left', icon: <AlignLeft className="w-4 h-4" />, label: 'Left' },
    { value: 'center', icon: <AlignCenter className="w-4 h-4" />, label: 'Center' },
    { value: 'right', icon: <AlignRight className="w-4 h-4" />, label: 'Right' },
  ];

  const currentWidth = imageConfig.width || '100%';

  const handleCustomWidthSubmit = () => {
    const trimmed = customWidthInput.trim();
    if (!trimmed) return;
    const numericOnly = trimmed.replace(/[^0-9]/g, '');
    if (numericOnly) {
      const val = Math.min(100, Math.max(10, parseInt(numericOnly, 10)));
      onUpdate({ ...imageConfig, width: `${val}%` });
      setCustomWidthInput('');
    }
  };

  const handleUrlSubmit = () => {
    const trimmed = urlInput.trim();
    if (trimmed) {
      onUpdate({ ...imageConfig, url: trimmed });
      setIsEditingUrl(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (PNG, JPG, GIF, WebP, or SVG)');
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(`Image must be less than ${MAX_IMAGE_MB}MB`);
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `guide-images/${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('help-center-documents')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (uploadError) {
        if (uploadError.message.includes('Bucket not found') || uploadError.message.includes('does not exist')) {
          toast.error('Storage bucket "help-center-documents" not found. Please create it in Supabase Storage first.');
        } else {
          toast.error(`Upload failed: ${uploadError.message}`);
        }
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('help-center-documents')
        .getPublicUrl(fileName);

      onUpdate({ ...imageConfig, url: publicUrl });
      setUrlInput(publicUrl);
      toast.success('Image uploaded successfully!');
    } catch (err: any) {
      toast.error(`Upload failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please drop an image file (PNG, JPG, GIF, WebP, or SVG)');
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(`Image must be less than ${MAX_IMAGE_MB}MB`);
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `guide-images/${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('help-center-documents')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (uploadError) {
        if (uploadError.message.includes('Bucket not found') || uploadError.message.includes('does not exist')) {
          toast.error('Storage bucket "help-center-documents" not found. Please create it in Supabase Storage first.');
        } else {
          toast.error(`Upload failed: ${uploadError.message}`);
        }
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('help-center-documents')
        .getPublicUrl(fileName);

      onUpdate({ ...imageConfig, url: publicUrl });
      setUrlInput(publicUrl);
      toast.success('Image uploaded successfully!');
    } catch (err: any) {
      toast.error(`Upload failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500 dark:text-gray-400">Image Block</div>

      {imageConfig.url && !isEditingUrl ? (
        <div className="space-y-3">
          {/* Image fills the block -- block itself is resizable via its edge handle */}
          <div className="relative">
            <img
              src={imageConfig.url}
              alt={imageConfig.alt || 'Guide image'}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700"
              draggable={false}
            />
            <div className="absolute top-2 right-2 flex gap-1">
              <button
                onClick={() => {
                  setUrlInput(imageConfig.url);
                  setIsEditingUrl(true);
                }}
                className="p-1 bg-blue-500 text-white rounded-full hover:bg-blue-600 shadow-sm"
                title="Edit image URL"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  onUpdate({ ...imageConfig, url: '' });
                  setUrlInput('');
                }}
                className="p-1 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-sm"
                title="Remove image"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Size & Alignment Controls */}
          <div className="bg-gray-50 dark:bg-dark-200 rounded-lg p-3 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-1">Size:</span>
              {WIDTH_PRESETS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => onUpdate({ ...imageConfig, width: value })}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    currentWidth === value
                      ? 'bg-[#f26722] text-white'
                      : 'bg-white dark:bg-dark-100 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:border-[#f26722] hover:text-[#f26722]'
                  }`}
                >
                  {label}
                </button>
              ))}
              <div className="flex items-center">
                <input
                  type="text"
                  value={customWidthInput}
                  onChange={(e) => setCustomWidthInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCustomWidthSubmit();
                    }
                  }}
                  placeholder="Custom %"
                  className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-l-md bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-xs focus:ring-1 focus:ring-[#f26722] focus:border-[#f26722] outline-none"
                />
                <button
                  onClick={handleCustomWidthSubmit}
                  disabled={!customWidthInput.trim()}
                  className="px-2 py-1 bg-gray-200 dark:bg-dark-100 hover:bg-gray-300 dark:hover:bg-dark-50 disabled:opacity-50 text-gray-700 dark:text-gray-300 rounded-r-md border border-l-0 border-gray-300 dark:border-gray-600 text-xs"
                  title="Apply custom width"
                >
                  <Check className="w-3 h-3" />
                </button>
              </div>
              <span className="text-xs text-gray-400 ml-1">Current: {currentWidth}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-1">Align:</span>
              {ALIGNMENT_OPTIONS.map(({ value, icon, label }) => (
                <button
                  key={value}
                  onClick={() => onUpdate({ ...imageConfig, alignment: value })}
                  className={`p-1.5 rounded-md transition-colors ${
                    (imageConfig.alignment || 'center') === value
                      ? 'bg-[#f26722] text-white'
                      : 'bg-white dark:bg-dark-100 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:border-[#f26722] hover:text-[#f26722]'
                  }`}
                  title={label}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* Alt text & caption fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Alt Text</label>
              <input
                type="text"
                value={imageConfig.alt || ''}
                onChange={(e) => onUpdate({ ...imageConfig, alt: e.target.value })}
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
                placeholder="Describe the image"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Caption</label>
              <input
                type="text"
                value={imageConfig.caption || ''}
                onChange={(e) => onUpdate({ ...imageConfig, caption: e.target.value })}
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
                placeholder="Optional caption"
              />
            </div>
          </div>
        </div>
      ) : (
        /* --- Upload / URL entry area --- */
        <div
          className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <Loader2 className="w-8 h-8 text-[#f26722] animate-spin" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Uploading image...</p>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Drag & drop an image, browse your computer, or enter a URL
              </p>

              {/* Browse button */}
              <div className="mb-4">
                <label className="inline-flex items-center gap-2 px-4 py-2 bg-[#f26722] hover:bg-[#e55611] text-white font-medium rounded-lg cursor-pointer transition-colors text-sm">
                  <Upload className="w-4 h-4" />
                  Browse Files
                  <input
                    type="file"
                    accept={ACCEPTED_IMAGES}
                    className="sr-only"
                    onChange={handleFileUpload}
                  />
                </label>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 max-w-md mx-auto mb-3">
                <div className="flex-1 border-t border-gray-300 dark:border-gray-600" />
                <span className="text-xs text-gray-400">or enter URL</span>
                <div className="flex-1 border-t border-gray-300 dark:border-gray-600" />
              </div>

              {/* URL input with submit button */}
              <div className="flex items-center gap-2 max-w-md mx-auto">
                <div className="relative flex-1">
                  <Link className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleUrlSubmit();
                      }
                    }}
                    placeholder="https://example.com/image.jpg"
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-l-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm focus:ring-1 focus:ring-[#f26722] focus:border-[#f26722] outline-none"
                  />
                </div>
                <button
                  onClick={handleUrlSubmit}
                  disabled={!urlInput.trim()}
                  className="px-3 py-2 bg-[#f26722] hover:bg-[#e55611] disabled:bg-gray-300 disabled:dark:bg-gray-600 text-white rounded-r-lg transition-colors text-sm font-medium flex items-center gap-1"
                  title="Set image URL"
                >
                  <Check className="w-4 h-4" />
                  Enter
                </button>
              </div>

              {isEditingUrl && (
                <button
                  onClick={() => setIsEditingUrl(false)}
                  className="mt-3 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline"
                >
                  Cancel
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// Block Editor - renders the appropriate editor for each block type
interface BlockEditorProps {
  block: ContentBlock;
  onUpdate: (config: ContentBlock['config']) => void;
}

const BlockEditor: React.FC<BlockEditorProps> = ({ block, onUpdate }) => {
  const config = block.config;

  switch (block.type) {
    case ContentBlockType.HEADING:
      const headingConfig = config as HeadingBlockConfig;
      return (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Heading Level:</span>
            {[1, 2, 3, 4].map((level) => (
              <button
                key={level}
                onClick={() => onUpdate({ ...headingConfig, level: level as 1 | 2 | 3 | 4 })}
                className={`px-2 py-0.5 text-xs rounded ${
                  headingConfig.level === level
                    ? 'bg-[#f26722] text-white'
                    : 'bg-gray-100 dark:bg-dark-100 text-gray-700 dark:text-gray-300'
                }`}
              >
                H{level}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={headingConfig.content || ''}
            onChange={(e) => onUpdate({ ...headingConfig, content: e.target.value })}
            className={`w-full bg-transparent border-none focus:outline-none focus:ring-0 text-gray-900 dark:text-white font-bold ${
              headingConfig.level === 1 ? 'text-3xl' :
              headingConfig.level === 2 ? 'text-2xl' :
              headingConfig.level === 3 ? 'text-xl' : 'text-lg'
            }`}
            placeholder="Enter heading..."
          />
        </div>
      );

    case ContentBlockType.TEXT:
      const textConfig = config as TextBlockConfig;
      return (
        <RichTextEditor
          value={textConfig.content || ''}
          onChange={(content) => onUpdate({ ...textConfig, content })}
          minHeight="100px"
          placeholder="Enter text content..."
        />
      );

    case ContentBlockType.BULLET_LIST:
    case ContentBlockType.NUMBERED_LIST:
      const listConfig = config as ListBlockConfig;
      return (
        <div className="space-y-2">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            {block.type === ContentBlockType.BULLET_LIST ? 'Bullet List' : 'Numbered List'}
          </div>
          {(listConfig.items || []).map((item, index) => (
            <div key={index} className="flex items-start gap-2">
              <span className="mt-2.5 text-gray-400">
                {block.type === ContentBlockType.BULLET_LIST ? '•' : `${index + 1}.`}
              </span>
              <input
                type="text"
                value={item.content}
                onChange={(e) => {
                  const newItems = [...(listConfig.items || [])];
                  newItems[index] = { ...item, content: e.target.value };
                  onUpdate({ ...listConfig, items: newItems });
                }}
                className="flex-1 px-2 py-1 bg-gray-50 dark:bg-dark-100 border border-gray-200 dark:border-gray-700 rounded text-gray-900 dark:text-white"
                placeholder={`Item ${index + 1}`}
              />
              <button
                onClick={() => {
                  const newItems = (listConfig.items || []).filter((_, i) => i !== index);
                  onUpdate({ ...listConfig, items: newItems });
                }}
                className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
              >
                <X className="w-4 h-4 text-red-500" />
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              const newItems = [...(listConfig.items || []), { content: '' }];
              onUpdate({ ...listConfig, items: newItems });
            }}
            className="flex items-center gap-1 text-sm text-[#f26722] hover:underline"
          >
            <Plus className="w-4 h-4" /> Add item
          </button>
        </div>
      );

    case ContentBlockType.IMAGE:
      const imageConfig = config as ImageBlockConfig;
      return <ImageBlockEditor imageConfig={imageConfig} onUpdate={onUpdate} />;

    case ContentBlockType.CALLOUT:
      const calloutConfig = config as CalloutBlockConfig;
      const calloutTypes = [
        { value: 'info', label: 'Info', color: 'bg-blue-100 dark:bg-blue-900/30 border-blue-500' },
        { value: 'warning', label: 'Warning', color: 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-500' },
        { value: 'success', label: 'Success', color: 'bg-green-100 dark:bg-green-900/30 border-green-500' },
        { value: 'error', label: 'Error', color: 'bg-red-100 dark:bg-red-900/30 border-red-500' },
        { value: 'tip', label: 'Tip', color: 'bg-purple-100 dark:bg-purple-900/30 border-purple-500' },
      ];
      const currentType = calloutTypes.find(t => t.value === calloutConfig.type) || calloutTypes[0];
      
      return (
        <div className={`border-l-4 ${currentType.color} p-4 rounded-r-lg`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Type:</span>
            {calloutTypes.map((type) => (
              <button
                key={type.value}
                onClick={() => onUpdate({ ...calloutConfig, type: type.value as CalloutBlockConfig['type'] })}
                className={`px-2 py-0.5 text-xs rounded ${
                  calloutConfig.type === type.value
                    ? 'bg-[#f26722] text-white'
                    : 'bg-gray-100 dark:bg-dark-100 text-gray-700 dark:text-gray-300'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={calloutConfig.title || ''}
            onChange={(e) => onUpdate({ ...calloutConfig, title: e.target.value })}
            className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-gray-900 dark:text-white font-semibold mb-1"
            placeholder="Title (optional)"
          />
          <textarea
            value={calloutConfig.content || ''}
            onChange={(e) => onUpdate({ ...calloutConfig, content: e.target.value })}
            className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-gray-700 dark:text-gray-300 resize-none"
            rows={2}
            placeholder="Callout content..."
          />
        </div>
      );

    case ContentBlockType.STEP:
      const stepConfig = config as StepBlockConfig;
      return (
        <div className="flex gap-4">
          <div className="flex-shrink-0 w-10 h-10 bg-[#f26722] text-white rounded-full flex items-center justify-center font-bold text-lg">
            {stepConfig.stepNumber || 1}
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">Step #:</span>
              <input
                type="number"
                min="1"
                value={stepConfig.stepNumber || 1}
                onChange={(e) => onUpdate({ ...stepConfig, stepNumber: parseInt(e.target.value) || 1 })}
                className="w-16 px-2 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <input
              type="text"
              value={stepConfig.title || ''}
              onChange={(e) => onUpdate({ ...stepConfig, title: e.target.value })}
              className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-gray-900 dark:text-white font-semibold text-lg"
              placeholder="Step title..."
            />
            <RichTextEditor
              value={stepConfig.content || ''}
              onChange={(content) => onUpdate({ ...stepConfig, content })}
              minHeight="80px"
              placeholder="Step description..."
            />
          </div>
        </div>
      );

    case ContentBlockType.TABLE:
      const tableConfig = config as TableBlockConfig;
      const headers = tableConfig.headers || ['Column 1', 'Column 2'];
      const rows = tableConfig.rows || [['', '']];
      
      return (
        <div className="space-y-2">
          <div className="text-xs text-gray-500 dark:text-gray-400">Table</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {headers.map((header, colIndex) => (
                    <th key={colIndex} className="border border-gray-300 dark:border-gray-600 p-0">
                      <input
                        type="text"
                        value={header}
                        onChange={(e) => {
                          const newHeaders = [...headers];
                          newHeaders[colIndex] = e.target.value;
                          onUpdate({ ...tableConfig, headers: newHeaders });
                        }}
                        className="w-full px-2 py-1 bg-gray-100 dark:bg-dark-200 text-gray-900 dark:text-white font-semibold text-sm border-none focus:outline-none"
                        placeholder={`Header ${colIndex + 1}`}
                      />
                    </th>
                  ))}
                  <th className="w-8 border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-dark-200">
                    <button
                      onClick={() => {
                        const newHeaders = [...headers, `Column ${headers.length + 1}`];
                        const newRows = rows.map(row => [...row, '']);
                        onUpdate({ ...tableConfig, headers: newHeaders, rows: newRows });
                      }}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-dark-100 rounded"
                      title="Add column"
                    >
                      <Plus className="w-4 h-4 text-gray-500" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, colIndex) => (
                      <td key={colIndex} className="border border-gray-300 dark:border-gray-600 p-0">
                        <input
                          type="text"
                          value={cell}
                          onChange={(e) => {
                            const newRows = rows.map((r, ri) =>
                              ri === rowIndex
                                ? r.map((c, ci) => (ci === colIndex ? e.target.value : c))
                                : r
                            );
                            onUpdate({ ...tableConfig, rows: newRows });
                          }}
                          className="w-full px-2 py-1 bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm border-none focus:outline-none"
                          placeholder={`Cell ${rowIndex + 1}-${colIndex + 1}`}
                        />
                      </td>
                    ))}
                    <td className="w-8 border border-gray-300 dark:border-gray-600">
                      <button
                        onClick={() => {
                          const newRows = rows.filter((_, i) => i !== rowIndex);
                          onUpdate({ ...tableConfig, rows: newRows.length > 0 ? newRows : [[...headers.map(() => '')]] });
                        }}
                        className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                        title="Delete row"
                      >
                        <X className="w-4 h-4 text-red-500" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={() => {
              const newRows = [...rows, headers.map(() => '')];
              onUpdate({ ...tableConfig, rows: newRows });
            }}
            className="flex items-center gap-1 text-sm text-[#f26722] hover:underline"
          >
            <Plus className="w-4 h-4" /> Add row
          </button>
        </div>
      );

    case ContentBlockType.VIDEO:
      const videoConfig = config as VideoBlockConfig;
      return (
        <div className="space-y-3">
          <div className="text-xs text-gray-500 dark:text-gray-400">Video Embed</div>
          <input
            type="url"
            value={videoConfig.url || ''}
            onChange={(e) => onUpdate({ ...videoConfig, url: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
            placeholder="YouTube or Vimeo URL"
          />
          {videoConfig.url && (
            <div className="aspect-video bg-gray-100 dark:bg-dark-200 rounded-lg flex items-center justify-center">
              <Video className="w-12 h-12 text-gray-400" />
              <span className="ml-2 text-gray-500 dark:text-gray-400">Video Preview</span>
            </div>
          )}
        </div>
      );

    case ContentBlockType.DIVIDER:
      return (
        <div className="py-2">
          <hr className="border-t-2 border-gray-200 dark:border-gray-700" />
        </div>
      );

    default:
      return <div className="text-gray-500">Unknown block type</div>;
  }
};

// Main Guide Builder Component
export const GuideBuilder: React.FC = () => {
  const { guideId } = useParams<{ guideId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Check if user is admin
  const isAdmin = user?.user_metadata?.role === 'Admin' || user?.user_metadata?.role === 'Super Admin' || isSuperUser(user?.email);

  // Redirect non-admins
  useEffect(() => {
    if (user && !isAdmin) {
      toast.error('You do not have permission to create or edit guides');
      navigate('/help-center');
    }
  }, [user, isAdmin, navigate]);

  // State
  const [guide, setGuide] = useState<HelpGuide>({
    title: 'Untitled Guide',
    description: '',
    category: PortalCategory.GENERAL,
    tags: [],
    content: {
      blocks: [],
      settings: {
        showTableOfContents: true,
        allowComments: false,
        showLastUpdated: true,
      },
    },
  });

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showBlockLibrary, setShowBlockLibrary] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load existing guide if editing
  useEffect(() => {
    if (guideId) {
      loadGuide();
    }
  }, [guideId]);

  const loadGuide = async () => {
    if (!guideId) return;

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .schema('common')
        .from('help_guides')
        .select('*')
        .eq('id', guideId)
        .single();

      if (error) throw error;

      if (data) {
        setGuide({
          id: data.id,
          title: data.title,
          description: data.description,
          category: data.category,
          tags: data.tags || [],
          createdBy: data.created_by,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          isPublished: data.is_published,
          content: data.content || { blocks: [], settings: { showTableOfContents: true, allowComments: false, showLastUpdated: true } },
        });
      }
    } catch (error: any) {
      console.error('Error loading guide:', error);
      toast.error(`Failed to load guide: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle save
  const handleSave = async () => {
    if (!user?.id) {
      toast.error('You must be logged in to save');
      return;
    }

    try {
      setIsSaving(true);

      const guideData = {
        title: guide.title,
        description: guide.description,
        category: guide.category,
        tags: guide.tags,
        content: guide.content,
        is_published: guide.isPublished || false,
        updated_at: new Date().toISOString(),
      };

      if (guideId) {
        // Update existing
        const { error } = await supabase
          .schema('common')
          .from('help_guides')
          .update(guideData)
          .eq('id', guideId);

        if (error) throw error;
        toast.success('Guide updated successfully!');
      } else {
        // Create new
        const { data, error } = await supabase
          .schema('common')
          .from('help_guides')
          .insert({
            ...guideData,
            created_by: user.id,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) throw error;
        toast.success('Guide created successfully!');
        navigate(`/help-center/builder/${data.id}`, { replace: true });
      }

      setIsDirty(false);
    } catch (error: any) {
      console.error('Error saving guide:', error);
      toast.error(`Failed to save: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Add a new block
  const addBlock = (type: ContentBlockType) => {
    const newBlock = createEmptyBlock(type, guide.content.blocks.length);
    setGuide(prev => ({
      ...prev,
      content: {
        ...prev.content,
        blocks: [...prev.content.blocks, newBlock],
      },
    }));
    setSelectedBlockId(newBlock.id);
    setIsDirty(true);
    setShowBlockLibrary(false);
  };

  // Delete a block
  const deleteBlock = (blockId: string) => {
    setGuide(prev => ({
      ...prev,
      content: {
        ...prev.content,
        blocks: prev.content.blocks.filter(b => b.id !== blockId),
      },
    }));
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null);
    }
    setIsDirty(true);
  };

  // Duplicate a block
  const duplicateBlock = (blockId: string) => {
    const block = guide.content.blocks.find(b => b.id === blockId);
    if (!block) return;

    const newBlock: ContentBlock = {
      ...block,
      id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      order: guide.content.blocks.length,
    };

    setGuide(prev => ({
      ...prev,
      content: {
        ...prev.content,
        blocks: [...prev.content.blocks, newBlock],
      },
    }));
    setSelectedBlockId(newBlock.id);
    setIsDirty(true);
  };

  // Update a block
  const updateBlock = (blockId: string, config: ContentBlock['config']) => {
    setGuide(prev => ({
      ...prev,
      content: {
        ...prev.content,
        blocks: prev.content.blocks.map(b =>
          b.id === blockId ? { ...b, config } : b
        ),
      },
    }));
    setIsDirty(true);
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = guide.content.blocks.findIndex(b => b.id === active.id);
      const newIndex = guide.content.blocks.findIndex(b => b.id === over.id);

      setGuide(prev => ({
        ...prev,
        content: {
          ...prev.content,
          blocks: arrayMove(prev.content.blocks, oldIndex, newIndex),
        },
      }));
      setIsDirty(true);
    }
  };

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  // Add tag
  const addTag = () => {
    if (tagInput.trim() && !guide.tags?.includes(tagInput.trim())) {
      setGuide(prev => ({
        ...prev,
        tags: [...(prev.tags || []), tagInput.trim()],
      }));
      setTagInput('');
      setIsDirty(true);
    }
  };

  // Remove tag
  const removeTag = (tag: string) => {
    setGuide(prev => ({
      ...prev,
      tags: (prev.tags || []).filter(t => t !== tag),
    }));
    setIsDirty(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#f26722]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-200">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-dark-150 border-b border-gray-200 dark:border-gray-700 px-4 lg:px-6 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate('/help-center')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back to Help Center</span>
            </Button>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
              {guide.title || 'Untitled Guide'}
            </h1>
            {isDirty && (
              <span className="text-xs text-gray-500 dark:text-gray-400">• Unsaved changes</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-2"
            >
              {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span className="hidden sm:inline">{showPreview ? 'Edit' : 'Preview'}</span>
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-[#f26722] hover:bg-[#e55611] text-white"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Saving...' : guideId ? 'Update' : 'Save'}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 lg:px-6 py-6">
        {/* Guide Settings Card */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Guide Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Title
                </label>
                <Input
                  value={guide.title}
                  onChange={(e) => {
                    setGuide(prev => ({ ...prev, title: e.target.value }));
                    setIsDirty(true);
                  }}
                  placeholder="Guide title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Category
                </label>
                <select
                  value={guide.category}
                  onChange={(e) => {
                    setGuide(prev => ({ ...prev, category: e.target.value as PortalCategory }));
                    setIsDirty(true);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                >
                  {Object.entries(PORTAL_CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <textarea
                value={guide.description || ''}
                onChange={(e) => {
                  setGuide(prev => ({ ...prev, description: e.target.value }));
                  setIsDirty(true);
                }}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-dark-100 text-gray-900 dark:text-white resize-none"
                placeholder="Brief description of this guide..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tags
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {(guide.tags || []).map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-dark-100 text-gray-700 dark:text-gray-300 rounded-full text-sm"
                  >
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  placeholder="Add a tag..."
                  className="flex-1"
                />
                <Button variant="outline" onClick={addTag}>
                  Add
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={guide.isPublished || false}
                  onChange={(e) => {
                    setGuide(prev => ({ ...prev, isPublished: e.target.checked }));
                    setIsDirty(true);
                  }}
                  className="rounded border-gray-300 dark:border-gray-600 text-[#f26722] focus:ring-[#f26722]"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Published</span>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Content Blocks */}
        {showPreview ? (
          /* Preview Mode */
          <Card>
            <CardContent className="p-6">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                {guide.title}
              </h1>
              {guide.description && (
                <p className="text-gray-600 dark:text-gray-400 mb-6">{guide.description}</p>
              )}
              <div className="space-y-6">
                {guide.content.blocks.map((block) => (
                  <PreviewBlock key={block.id} block={block} />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Edit Mode */
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={guide.content.blocks.map(b => b.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {guide.content.blocks.map((block) => (
                  <SortableBlock
                    key={block.id}
                    block={block}
                    isSelected={selectedBlockId === block.id}
                    onSelect={() => setSelectedBlockId(block.id)}
                    onDelete={() => deleteBlock(block.id)}
                    onDuplicate={() => duplicateBlock(block.id)}
                    onUpdate={(config) => updateBlock(block.id, config)}
                  />
                ))}
              </div>
            </SortableContext>

            {/* Add Block Button */}
            <div className="mt-6">
              <div className="relative">
                <button
                  onClick={() => setShowBlockLibrary(!showBlockLibrary)}
                  className="w-full py-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 hover:border-[#f26722] hover:text-[#f26722] transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Add Content Block
                  <ChevronDown className={`w-4 h-4 transition-transform ${showBlockLibrary ? 'rotate-180' : ''}`} />
                </button>

                {showBlockLibrary && (
                  <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-dark-150 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {CONTENT_BLOCK_LIBRARY.map((blockDef) => (
                        <button
                          key={blockDef.id}
                          onClick={() => addBlock(blockDef.id)}
                          className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-100 transition-colors text-center"
                        >
                          <div className="w-10 h-10 bg-gray-100 dark:bg-dark-200 rounded-lg flex items-center justify-center">
                            {BLOCK_ICONS[blockDef.id]}
                          </div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {blockDef.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Empty State */}
            {guide.content.blocks.length === 0 && (
              <div className="text-center py-12">
                <Plus className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Start Building Your Guide
                </h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  Click "Add Content Block" above to add headings, text, images, and more.
                </p>
              </div>
            )}
          </DndContext>
        )}
      </div>
    </div>
  );
};

// Preview Block Component
const PreviewBlock: React.FC<{ block: ContentBlock }> = ({ block }) => {
  const config = block.config;

  switch (block.type) {
    case ContentBlockType.HEADING:
      const hConfig = config as HeadingBlockConfig;
      const HeadingTag = `h${hConfig.level}` as keyof JSX.IntrinsicElements;
      const headingSizes = { 1: 'text-3xl', 2: 'text-2xl', 3: 'text-xl', 4: 'text-lg' };
      return (
        <HeadingTag className={`${headingSizes[hConfig.level]} font-bold text-gray-900 dark:text-white`}>
          {hConfig.content}
        </HeadingTag>
      );

    case ContentBlockType.TEXT:
      return (
        <div
          className="prose prose-gray dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: (config as TextBlockConfig).content || '' }}
        />
      );

    case ContentBlockType.BULLET_LIST:
      return (
        <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
          {((config as ListBlockConfig).items || []).map((item, i) => (
            <li key={i}>{item.content}</li>
          ))}
        </ul>
      );

    case ContentBlockType.NUMBERED_LIST:
      return (
        <ol className="list-decimal list-inside space-y-1 text-gray-700 dark:text-gray-300">
          {((config as ListBlockConfig).items || []).map((item, i) => (
            <li key={i}>{item.content}</li>
          ))}
        </ol>
      );

    case ContentBlockType.IMAGE:
      const imgConfig = config as ImageBlockConfig;
      return imgConfig.url ? (
        <figure className={`${imgConfig.alignment === 'center' ? 'mx-auto' : imgConfig.alignment === 'right' ? 'ml-auto' : ''}`} style={{ width: imgConfig.width || '100%', maxWidth: '100%' }}>
          <img src={imgConfig.url} alt={imgConfig.alt || ''} className="rounded-lg w-full" />
          {imgConfig.caption && (
            <figcaption className="text-center text-sm text-gray-500 dark:text-gray-400 mt-2">
              {imgConfig.caption}
            </figcaption>
          )}
        </figure>
      ) : null;

    case ContentBlockType.CALLOUT:
      const cConfig = config as CalloutBlockConfig;
      const calloutColors = {
        info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-800 dark:text-blue-200',
        warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500 text-yellow-800 dark:text-yellow-200',
        success: 'bg-green-50 dark:bg-green-900/20 border-green-500 text-green-800 dark:text-green-200',
        error: 'bg-red-50 dark:bg-red-900/20 border-red-500 text-red-800 dark:text-red-200',
        tip: 'bg-purple-50 dark:bg-purple-900/20 border-purple-500 text-purple-800 dark:text-purple-200',
      };
      return (
        <div className={`border-l-4 p-4 rounded-r-lg ${calloutColors[cConfig.type]}`}>
          {cConfig.title && <p className="font-semibold mb-1">{cConfig.title}</p>}
          <p>{cConfig.content}</p>
        </div>
      );

    case ContentBlockType.STEP:
      const sConfig = config as StepBlockConfig;
      return (
        <div className="flex gap-4">
          <div className="flex-shrink-0 w-10 h-10 bg-[#f26722] text-white rounded-full flex items-center justify-center font-bold text-lg">
            {sConfig.stepNumber}
          </div>
          <div>
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">{sConfig.title}</h4>
            <div
              className="text-gray-700 dark:text-gray-300 mt-1"
              dangerouslySetInnerHTML={{ __html: sConfig.content || '' }}
            />
          </div>
        </div>
      );

    case ContentBlockType.TABLE:
      const tConfig = config as TableBlockConfig;
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {(tConfig.headers || []).map((header, i) => (
                  <th key={i} className="border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-dark-200 px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(tConfig.rows || []).map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-700 dark:text-gray-300">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case ContentBlockType.DIVIDER:
      return <hr className="border-t-2 border-gray-200 dark:border-gray-700 my-6" />;

    default:
      return null;
  }
};

export default GuideBuilder;

