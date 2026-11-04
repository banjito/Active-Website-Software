import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    // Handle CORS
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      });
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({
        error: 'Method not allowed'
      }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const { html, filename, options } = await req.json();
    
    if (!html || !filename) {
      return new Response(JSON.stringify({
        error: 'HTML content and filename are required'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Create a simple HTML document with print styles
    const printHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${filename}</title>
          <style>
            @media print {
              body { margin: 0; padding: 20px; }
              * { color: black !important; }
              input, select, textarea { 
                background-color: white !important; 
                border: 1px solid black !important; 
                color: black !important;
                padding: 2px !important; 
                font-size: 10px !important;
                -webkit-appearance: none !important;
                -moz-appearance: none !important;
                appearance: none !important;
              }
              select {
                background-image: none !important;
                padding-right: 8px !important;
              }
              input[type="number"]::-webkit-outer-spin-button,
              input[type="number"]::-webkit-inner-spin-button {
                -webkit-appearance: none !important;
                margin: 0 !important;
              }
              input[type="number"] {
                -moz-appearance: textfield !important;
              }
              table { border-collapse: collapse; width: 100%; }
              th, td { border: 1px solid black !important; padding: 4px !important; }
              th { background-color: #f0f0f0 !important; font-weight: bold !important; }
              button:not(.print-visible) { display: none !important; }
              section { break-inside: avoid !important; margin-bottom: 20px !important; }
            }
            body { font-family: Arial, sans-serif; }
          </style>
        </head>
        <body>
          ${html}
        </body>
      </html>
    `;

    // Return the HTML as a downloadable file (browser will handle PDF conversion)
    return new Response(printHtml, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="${filename}.html"`,
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('HTML generation error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to generate HTML'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}); 