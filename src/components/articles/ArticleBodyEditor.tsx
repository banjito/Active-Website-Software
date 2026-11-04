/**
 * Article body editor.
 *
 * Same contentEditable approach as ui/RichTextEditor (used for job
 * requisitions), with a toolbar cut down to what ampqes.com renders: headings,
 * bold/italic/underline, lists, quotes, links, images and dividers. No fonts,
 * colors or alignment, because the site strips them. The parent cleans the
 * HTML with sanitizeArticleHtml before saving.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
  Minus,
  Undo,
  Redo,
  Pilcrow,
  Heading2,
  Heading3,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ArticleBodyEditorProps {
  value: string;
  onChange: (html: string) => void;
  /** Uploads an image and returns its public URL. */
  onUploadImage: (file: File) => Promise<string>;
  readOnly?: boolean;
  minHeight?: string;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  if (/^(https?:|mailto:|tel:|\/)/i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return null; // javascript:, data:, etc.
  return `https://${url}`;
}

const inputClass =
  "w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-100 text-neutral-900 dark:text-white";

const LINK_POPUP_WIDTH = 340;
const IMAGE_POPUP_WIDTH = 460;
// Must match the article-images bucket limits in articles.sql.
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const LINK_HIGHLIGHT = "article-link-target";

// Keeps the chosen words visibly highlighted while typing in the link popup
// (focus leaves the editor, which would otherwise hide the selection).
// Browsers without the CSS Highlight API just skip it.
function setLinkHighlight(range: Range | null) {
  const highlights = (CSS as any)?.highlights;
  if (!highlights) return;
  highlights.delete(LINK_HIGHLIGHT);
  const HighlightCtor = (window as any).Highlight;
  if (range && HighlightCtor) highlights.set(LINK_HIGHLIGHT, new HighlightCtor(range));
}

export const ArticleBodyEditor: React.FC<ArticleBodyEditorProps> = ({
  value,
  onChange,
  onUploadImage,
  readOnly = false,
  minHeight = "400px",
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  // Where the link or image popup sits, relative to the editor box.
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [panel, setPanel] = useState<"link" | "image" | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageAlt, setImageAlt] = useState("");
  const [imageCaption, setImageCaption] = useState("");
  const [imageError, setImageError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Free the local preview of a chosen file when it changes.
  useEffect(() => {
    if (!imagePreview?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  // Only push outside changes into the editor, never on each keystroke
  // (that would move the cursor).
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const next = value ?? "";
    if (el.innerHTML !== next) el.innerHTML = next;
  }, [value]);

  const emit = useCallback(() => {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }, [onChange]);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (
      sel &&
      sel.rangeCount > 0 &&
      editorRef.current?.contains(sel.anchorNode)
    ) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    } else {
      savedRange.current = null;
    }
  };

  const restoreSelection = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    if (savedRange.current) {
      sel.addRange(savedRange.current);
    } else {
      // No saved spot: put the cursor at the end.
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.addRange(range);
    }
  };

  const exec = (command: string, arg?: string) => {
    editorRef.current?.focus();
    document.execCommand("defaultParagraphSeparator", false, "p");
    document.execCommand(command, false, arg);
    emit();
  };

  // Paste as plain text, keeping paragraph breaks, so no outside styling gets in.
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    const paragraphs = text
      .replace(/\r\n?/g, "\n")
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (paragraphs.length <= 1) {
      document.execCommand("insertText", false, text);
    } else {
      const html = paragraphs
        .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
        .join("");
      document.execCommand("insertHTML", false, html);
    }
    emit();
  };

  const resetImage = () => {
    setImageFile(null);
    setImageUrl("");
    setImagePreview(null);
    setImageAlt("");
    setImageCaption("");
    setImageError("");
    setDragOver(false);
  };

  const closePopup = () => {
    setLinkHighlight(null);
    setPanel(null);
    setLinkUrl("");
    resetImage();
  };

  // Screen box of the selection, or of the text cursor. Browsers often report
  // an empty box for a bare cursor (nothing highlighted), so in that case drop
  // in an invisible marker, measure it, and take it back out.
  const rectFor = (range: Range): { left: number; bottom: number } | null => {
    const box = range.getBoundingClientRect();
    if (box.height || box.width) {
      const first = range.getClientRects()[0] || box;
      return { left: first.left, bottom: box.bottom };
    }
    if (!range.collapsed) return null;
    const marker = document.createElement("span");
    marker.textContent = "​";
    try {
      range.cloneRange().insertNode(marker);
      const r = marker.getBoundingClientRect();
      return r.height || r.width ? { left: r.left, bottom: r.bottom } : null;
    } catch {
      return null;
    } finally {
      marker.remove();
    }
  };

  // Places a popup just under the selected words, or the text cursor.
  const placePopup = (width: number) => {
    const range = savedRange.current;
    const wrapEl = wrapperRef.current;
    if (!wrapEl) return;
    const wrap = wrapEl.getBoundingClientRect();
    const spot = range ? rectFor(range) : null;
    let top: number;
    let left = 8;
    if (spot) {
      top = spot.bottom - wrap.top + 6;
      left = Math.max(8, Math.min(spot.left - wrap.left, wrap.width - width - 8));
    } else {
      // No cursor in the text: show it just under the toolbar, on screen.
      const header = document.querySelector("[data-app-header]");
      const viewTop = Math.max(
        header ? header.getBoundingClientRect().bottom : 0,
        wrap.top,
      );
      top = viewTop - wrap.top + (toolbarRef.current?.offsetHeight || 44) + 8;
    }
    setPopupPos({ top, left });
  };

  const openPopup = (which: "link" | "image") => {
    if (panel === which) {
      closePopup();
      return;
    }
    closePopup();
    saveSelection();
    placePopup(which === "link" ? LINK_POPUP_WIDTH : IMAGE_POPUP_WIDTH);
    const range = savedRange.current;
    if (which === "link") setLinkHighlight(range && !range.collapsed ? range : null);
    setPanel(which);
  };

  const pickImageFile = (file: File | undefined | null) => {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setImageError("Use a JPG, PNG, WebP or GIF image.");
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setImageError("That image is over 10 MB. Use a smaller one.");
      return;
    }
    setImageError("");
    setImageUrl("");
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  // Images must live in our own storage (the website drops any other image
  // address), so a pasted link is downloaded and saved as a copy.
  const fileFromUrl = async (raw: string): Promise<File> => {
    const url = normalizeUrl(raw);
    if (!url || !/^https?:/i.test(url)) throw new Error("bad-url");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`status-${res.status}`);
    const blob = await res.blob();
    if (!IMAGE_TYPES.includes(blob.type)) throw new Error("not-image");
    if (blob.size > IMAGE_MAX_BYTES) throw new Error("too-big");
    const name = decodeURIComponent(url.split(/[?#]/)[0].split("/").pop() || "image");
    return new File([blob], name, { type: blob.type });
  };

  // Clean up the highlight if the editor goes away with the popup open.
  useEffect(() => () => setLinkHighlight(null), []);

  // Keep the toolbar on screen while scrolling a long article. CSS sticky
  // can't do it here: the page's <main> has overflow set, which stops sticky
  // from working inside it. So pin it under the app header by hand.
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [pin, setPin] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (readOnly) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const wrap = wrapperRef.current;
      const bar = toolbarRef.current;
      if (!wrap || !bar) return;
      const header = document.querySelector("[data-app-header]");
      const top = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
      const r = wrap.getBoundingClientRect();
      const height = bar.offsetHeight;
      const next =
        r.top < top && r.bottom > top + height + 48
          ? {
              top,
              left: r.left + wrap.clientLeft,
              width: wrap.clientWidth,
              height,
            }
          : null;
      setPin((prev) =>
        prev &&
        next &&
        prev.top === next.top &&
        prev.left === next.left &&
        prev.width === next.width &&
        prev.height === next.height
          ? prev
          : next,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // Capture catches scrolling in any container, not just the window.
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    update();
    return () => {
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [readOnly]);

  const insertLink = () => {
    const url = normalizeUrl(linkUrl);
    setLinkHighlight(null);
    restoreSelection();
    if (url) {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        document.execCommand("createLink", false, url);
      } else {
        document.execCommand(
          "insertHTML",
          false,
          `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`,
        );
      }
      emit();
    }
    closePopup();
  };

  const insertImage = async () => {
    if ((!imageFile && !imageUrl.trim()) || !imageAlt.trim()) return;
    setUploading(true);
    setImageError("");
    try {
      let file = imageFile;
      if (!file) {
        try {
          file = await fileFromUrl(imageUrl);
        } catch (e: any) {
          setImageError(
            e?.message === "not-image"
              ? "That link isn't a JPG, PNG, WebP or GIF image."
              : e?.message === "too-big"
                ? "That image is over 10 MB."
                : "Couldn't copy that image (the site may block it). Save it to your computer, then drop it on the left.",
          );
          return;
        }
      }
      const url = await onUploadImage(file);
      restoreSelection();
      const caption = imageCaption.trim()
        ? `<figcaption>${escapeHtml(imageCaption.trim())}</figcaption>`
        : "";
      document.execCommand(
        "insertHTML",
        false,
        `<figure><img src="${escapeHtml(url)}" alt="${escapeHtml(imageAlt.trim())}">${caption}</figure><p><br></p>`,
      );
      emit();
      closePopup();
    } catch {
      // The caller already showed the error; keep the panel open to retry.
    } finally {
      setUploading(false);
    }
  };

  // Toolbar buttons keep focus in the editor so the selection survives.
  const Tool: React.FC<{
    title: string;
    icon: React.ReactNode;
    onClick: () => void;
  }> = ({ title, icon, onClick }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="p-1.5 rounded-none text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-dark-100"
    >
      {icon}
    </button>
  );

  const Divider = () => (
    <div className="w-px h-5 bg-neutral-300 dark:bg-neutral-600 mx-1" />
  );

  const icon = "w-4 h-4";

  return (
    <div
      ref={wrapperRef}
      className="relative border border-neutral-300 dark:border-neutral-600 rounded-none"
    >
      {/* Holds the toolbar's space while it is pinned, so text doesn't jump. */}
      {!readOnly && pin && <div style={{ height: pin.height }} />}
      {!readOnly && (
        <div
          ref={toolbarRef}
          style={
            pin
              ? { position: "fixed", top: pin.top, left: pin.left, width: pin.width }
              : undefined
          }
          className={`z-20 flex flex-wrap items-center gap-0.5 p-2 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-200 ${
            pin ? "shadow-md" : ""
          }`}
        >
          <Tool title="Undo" icon={<Undo className={icon} />} onClick={() => exec("undo")} />
          <Tool title="Redo" icon={<Redo className={icon} />} onClick={() => exec("redo")} />
          <Divider />
          <Tool title="Paragraph" icon={<Pilcrow className={icon} />} onClick={() => exec("formatBlock", "p")} />
          <Tool title="Heading" icon={<Heading2 className={icon} />} onClick={() => exec("formatBlock", "h2")} />
          <Tool title="Subheading" icon={<Heading3 className={icon} />} onClick={() => exec("formatBlock", "h3")} />
          <Divider />
          <Tool title="Bold" icon={<Bold className={icon} />} onClick={() => exec("bold")} />
          <Tool title="Italic" icon={<Italic className={icon} />} onClick={() => exec("italic")} />
          <Tool title="Underline" icon={<Underline className={icon} />} onClick={() => exec("underline")} />
          <Divider />
          <Tool title="Bullet list" icon={<List className={icon} />} onClick={() => exec("insertUnorderedList")} />
          <Tool title="Numbered list" icon={<ListOrdered className={icon} />} onClick={() => exec("insertOrderedList")} />
          <Tool title="Quote" icon={<Quote className={icon} />} onClick={() => exec("formatBlock", "blockquote")} />
          <Divider />
          <Tool
            title="Link"
            icon={<LinkIcon className={icon} />}
            onClick={() => openPopup("link")}
          />
          <Tool
            title="Image"
            icon={<ImageIcon className={icon} />}
            onClick={() => openPopup("image")}
          />
          <Tool title="Divider line" icon={<Minus className={icon} />} onClick={() => exec("insertHorizontalRule")} />
        </div>
      )}

      {!readOnly && panel === "link" && popupPos && (
        <div
          className="absolute z-20 flex items-center gap-1 p-1.5 rounded-none border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-dark-150 shadow-lg"
          style={{ top: popupPos.top, left: popupPos.left, width: LINK_POPUP_WIDTH }}
        >
          <input
            type="url"
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                insertLink();
              } else if (e.key === "Escape") {
                e.preventDefault();
                closePopup();
                restoreSelection();
              }
            }}
            placeholder="Paste or type a link"
            className={`${inputClass} min-w-0 flex-1`}
          />
          <Button size="sm" onClick={insertLink} disabled={!linkUrl.trim()}>
            Add
          </Button>
          <button
            type="button"
            aria-label="Cancel"
            title="Cancel"
            onClick={closePopup}
            className="p-1 rounded-none text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {!readOnly && panel === "image" && popupPos && (
        <div
          className="absolute z-20 space-y-2 p-2 rounded-none border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-dark-150 shadow-lg"
          style={{
            top: popupPos.top,
            left: popupPos.left,
            width: IMAGE_POPUP_WIDTH,
            maxWidth: "calc(100% - 16px)",
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              closePopup();
              restoreSelection();
            }
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Add image
            </span>
            <button
              type="button"
              aria-label="Cancel"
              title="Cancel"
              onClick={closePopup}
              className="p-1 rounded-none text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Left half: drop or click to choose a file */}
            <input
              ref={fileInputRef}
              type="file"
              accept={IMAGE_TYPES.join(",")}
              className="hidden"
              onChange={(e) => {
                pickImageFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pickImageFile(e.dataTransfer.files?.[0]);
              }}
              className={`flex h-32 flex-col items-center justify-center gap-1 overflow-hidden rounded-none border-2 border-dashed p-2 text-center text-xs ${
                dragOver
                  ? "border-brand bg-brand/10 text-brand"
                  : imageFile
                    ? "border-brand text-neutral-700 dark:text-neutral-200"
                    : "border-neutral-300 dark:border-neutral-600 text-neutral-500 dark:text-neutral-400 hover:border-brand"
              }`}
            >
              {imageFile && imagePreview ? (
                <img
                  src={imagePreview}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  <span>Drop an image here</span>
                  <span className="text-neutral-400">or click to choose</span>
                </>
              )}
            </button>

            {/* Right half: copy from a link */}
            <div
              className={`flex h-32 flex-col gap-1 rounded-none border p-2 ${
                imageUrl.trim()
                  ? "border-brand"
                  : "border-neutral-200 dark:border-neutral-700"
              }`}
            >
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Or paste an image link
              </span>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => {
                  setImageUrl(e.target.value);
                  setImageError("");
                  if (e.target.value.trim()) {
                    setImageFile(null);
                    setImagePreview(null);
                  }
                }}
                placeholder="https://..."
                className={inputClass}
              />
              {imageUrl.trim() && normalizeUrl(imageUrl) ? (
                <img
                  src={normalizeUrl(imageUrl) || ""}
                  alt=""
                  className="min-h-0 flex-1 object-contain"
                />
              ) : (
                <span className="text-[11px] leading-snug text-neutral-400">
                  A copy is saved to ampOS, so it keeps working if the original
                  moves.
                </span>
              )}
            </div>
          </div>

          <input
            value={imageAlt}
            onChange={(e) => setImageAlt(e.target.value)}
            placeholder="Describe the image (required)"
            className={inputClass}
          />
          <input
            value={imageCaption}
            onChange={(e) => setImageCaption(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                insertImage();
              }
            }}
            placeholder="Caption (optional)"
            className={inputClass}
          />
          {imageError && (
            <p className="text-xs text-red-600 dark:text-red-400">{imageError}</p>
          )}
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={insertImage}
              isLoading={uploading}
              disabled={(!imageFile && !imageUrl.trim()) || !imageAlt.trim()}
            >
              Insert image
            </Button>
          </div>
        </div>
      )}

      <div
        ref={editorRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={emit}
        onMouseDown={() => panel && closePopup()}
        onPaste={handlePaste}
        onFocus={() =>
          document.execCommand("defaultParagraphSeparator", false, "p")
        }
        data-placeholder="Write the article..."
        className="article-body-editor p-4 focus:outline-none bg-white dark:bg-dark-100 text-neutral-900 dark:text-white max-w-none"
        style={{ minHeight }}
      />

      <style>{`
        .article-body-editor[data-placeholder]:empty:before { content: attr(data-placeholder); color: #9CA3AF; pointer-events: none; }
        .article-body-editor p { margin: 0 0 0.9em; line-height: 1.65; }
        .article-body-editor h2 { font-size: 1.5rem; font-weight: 700; margin: 1.4em 0 0.5em; }
        .article-body-editor h3 { font-size: 1.2rem; font-weight: 600; margin: 1.2em 0 0.4em; }
        .article-body-editor ul { list-style: disc; padding-left: 1.5rem; margin: 0 0 0.9em; }
        .article-body-editor ol { list-style: decimal; padding-left: 1.5rem; margin: 0 0 0.9em; }
        .article-body-editor blockquote { border-left: 3px solid var(--brand); padding-left: 1rem; margin: 1em 0; font-style: italic; }
        .article-body-editor a { color: var(--brand); text-decoration: underline; }
        .article-body-editor figure { margin: 1.2em 0; }
        .article-body-editor img { max-width: 100%; height: auto; display: block; }
        .article-body-editor figcaption { font-size: 0.85rem; color: #737373; margin-top: 0.4em; }
        .article-body-editor hr { border: 0; border-top: 1px solid #d4d4d4; margin: 1.5em 0; }
        ::highlight(${LINK_HIGHLIGHT}) { background-color: color-mix(in srgb, var(--brand) 25%, transparent); }
      `}</style>
    </div>
  );
};

export default ArticleBodyEditor;
