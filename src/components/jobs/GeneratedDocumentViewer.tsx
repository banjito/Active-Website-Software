import React, { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export default function GeneratedDocumentViewer() {
  const { id, docId } = useParams<{ id: string; docId: string }>();
  const [searchParams] = useSearchParams();
  const [html, setHtml] = useState<string>("");
  const [title, setTitle] = useState<string>("Generated Document");
  const [customName, setCustomName] = useState<string>("");
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadDoc = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .schema("neta_ops")
          .from("generated_documents")
          .select("id, job_id, doc_type, name, html, created_at")
          .eq("id", docId)
          .eq("job_id", id)
          .single();
        if (error) throw error;
        if (!isMounted) return;
        const raw = (data as any)?.html || "";
        setHtml(raw);

        // Set the title from name or doc_type
        const docName = (data as any)?.name;
        const docTitle =
          docName ||
          ((data as any)?.doc_type === "cover"
            ? "Cover Letter"
            : (data as any)?.doc_type === "summary"
              ? "Executive Summary"
              : "Generated Document");
        setTitle(docTitle);
        setCustomName(docName || "");
        try {
          document.title = docTitle;
        } catch {}
      } catch (e: any) {
        if (!isMounted) return;
        setError(e?.message || "Failed to load document");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    loadDoc();
    return () => {
      isMounted = false;
    };
  }, [id, docId]);

  const handleSaveName = async () => {
    try {
      const newName = customName.trim() || null;
      console.log("Saving document name:", { docId, newName });

      const { data, error } = await supabase
        .schema("neta_ops")
        .from("generated_documents")
        .update({ name: newName })
        .eq("id", docId)
        .select();

      if (error) {
        console.error("Error updating document name:", error);
        throw error;
      }

      console.log("Update response:", data);

      // Get the doc_type from the response to determine default title
      const updatedDoc = data?.[0];
      const docType = updatedDoc?.doc_type;
      const defaultTitle =
        docType === "cover"
          ? "Cover Letter"
          : docType === "summary"
            ? "Executive Summary"
            : "Generated Document";
      const newTitle = newName || defaultTitle;

      setTitle(newTitle);
      setCustomName(newName || "");
      setIsEditingName(false);
      try {
        document.title = newTitle;
      } catch {}
      alert("Document name updated successfully");
    } catch (e: any) {
      console.error("Failed to update name:", e);
      alert(`Failed to update name: ${e?.message || "Unknown error"}`);
    }
  };

  const handleCancelEdit = () => {
    setCustomName(title);
    setIsEditingName(false);
  };

  // Auto print when ?print=true
  useEffect(() => {
    if (
      searchParams.get("print") === "true" &&
      html &&
      !isLoading &&
      iframeRef.current
    ) {
      const iframe = iframeRef.current;

      const handleLoad = () => {
        try {
          const win = iframe.contentWindow;
          if (!win) return;

          // Wait a bit longer to ensure everything is fully rendered
          setTimeout(() => {
            try {
              win.focus();
              win.print();
            } catch (e) {
              console.error("Print error:", e);
            }
          }, 800);
        } catch (e) {
          console.error("Print setup error:", e);
        }
      };

      // Add load listener
      iframe.addEventListener("load", handleLoad, { once: true });

      // If already loaded, trigger immediately
      if (
        iframe.contentDocument &&
        iframe.contentDocument.readyState === "complete"
      ) {
        handleLoad();
      }

      return () => {
        try {
          iframe.removeEventListener("load", handleLoad);
        } catch {}
      };
    }
  }, [searchParams, html, isLoading]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }
  if (error) {
    return <div className="p-6 text-red-600">{error}</div>;
  }

  const isPrintMode = searchParams.get("print") === "true";

  // Patch saved HTML to fix multi-page printing and footer overlap.
  // Old documents may have absolute-positioned footers that overlap content
  // when the executive summary text + signatures grow too long.
  // Fix: convert .amp-page to flex layout for print so footer flows naturally.
  const patchedHtml = (() => {
    if (!html) return html;
    const printFix = `<style>
@media print {
  html, body {
    height: auto !important;
    overflow: visible !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .amp-page {
    display: flex !important;
    flex-direction: column !important;
    height: 11in !important;
    width: 8.5in !important;
    overflow: hidden !important;
    box-sizing: border-box !important;
    page-break-after: always !important;
  }
  .amp-page:last-child {
    page-break-after: auto !important;
  }
  .amp-stripe {
    position: absolute !important;
  }
  .amp-header {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    right: auto !important;
    flex-shrink: 0 !important;
  }
  .amp-page-content {
    flex: 1 1 auto !important;
    overflow: hidden !important;
    min-height: 0 !important;
  }
  .amp-footer {
    position: relative !important;
    bottom: auto !important;
    left: auto !important;
    right: auto !important;
    flex-shrink: 0 !important;
    margin-top: auto !important;
  }
}
</style>`;
    // Insert just before </head> if present, otherwise before </html> or at end
    if (html.includes("</head>")) {
      return html.replace("</head>", `${printFix}</head>`);
    }
    return html + printFix;
  })();

  return (
    <div className="max-w-none">
      {!isPrintMode && (
        <div className="bg-white dark:bg-dark-150 border-b border-neutral-200 dark:border-neutral-700 p-4">
          <div className="max-w-7xl mx-auto">
            {isEditingName ? (
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Document Name (optional)"
                  className="flex-1 px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
                  autoFocus
                />
                <button
                  onClick={handleSaveName}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium"
                >
                  Save
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 dark:bg-dark-100 dark:hover:bg-dark-200 text-neutral-900 dark:text-white rounded-md font-medium"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
                  {title}
                </h1>
                <button
                  onClick={() => setIsEditingName(true)}
                  className="px-4 py-2 bg-[#f26722] hover:bg-[#e55611] text-white rounded-md font-medium flex items-center gap-2"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                  Edit Name
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        srcDoc={patchedHtml}
        title={title}
        style={{
          width: "100%",
          height: isPrintMode ? "100vh" : "calc(100vh - 80px)",
          border: "none",
        }}
      />
    </div>
  );
}
