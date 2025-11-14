import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

export default function GeneratedDocumentViewer() {
  const { id, docId } = useParams<{ id: string; docId: string }>();
  const [searchParams] = useSearchParams();
  const [html, setHtml] = useState<string>('');
  const [title, setTitle] = useState<string>('Generated Document');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadDoc = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .schema('neta_ops')
          .from('generated_documents')
          .select('id, job_id, doc_type, name, html, created_at')
          .eq('id', docId)
          .eq('job_id', id)
          .single();
        if (error) throw error;
        if (!isMounted) return;
        const raw = (data as any)?.html || '';
        setHtml(raw);
        
        // Set the title from name or doc_type
        const docName = (data as any)?.name;
        const docTitle = docName || ((data as any)?.doc_type === 'cover' ? 'Cover Letter' : ((data as any)?.doc_type === 'summary' ? 'Executive Summary' : 'Generated Document'));
        setTitle(docTitle);
        try { document.title = docTitle; } catch {}
      } catch (e: any) {
        if (!isMounted) return;
        setError(e?.message || 'Failed to load document');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    loadDoc();
    return () => { isMounted = false; };
  }, [id, docId]);

  // Auto print when ?print=true
  useEffect(() => {
    if (searchParams.get('print') === 'true' && html && !isLoading && iframeRef.current) {
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
              console.error('Print error:', e);
            }
          }, 800);
        } catch (e) {
          console.error('Print setup error:', e);
        }
      };
      
      // Add load listener
      iframe.addEventListener('load', handleLoad, { once: true });
      
      // If already loaded, trigger immediately
      if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
        handleLoad();
      }
      
      return () => {
        try {
          iframe.removeEventListener('load', handleLoad);
        } catch {}
      };
    }
  }, [searchParams, html, isLoading]);

  if (isLoading) {
    return <div className="p-6 text-gray-700 dark:text-white">Loading document…</div>;
  }
  if (error) {
    return <div className="p-6 text-red-600">{error}</div>;
  }

  return (
    <div className="max-w-none">
      <iframe 
        ref={iframeRef} 
        srcDoc={html}
        title={title} 
        style={{ width: '100%', height: '100vh', border: 'none' }} 
      />
    </div>
  );
}


