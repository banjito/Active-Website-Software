import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { offersService, Offer } from '../../../services/hr/offersService';
import { toast } from '../../../components/ui/toast';
import { FileText, PenTool, CheckCircle, XCircle, Download, Paperclip } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export const PublicOfferSigning: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [attachments, setAttachments] = useState<{ id: string; name: string; file_url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureData, setSignatureData] = useState<string>('');
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');

  useEffect(() => {
    if (token) {
      fetchOfferByToken(token);
    } else {
      setError('Invalid signing link');
      setLoading(false);
    }
  }, [token]);

  const fetchOfferByToken = async (signingToken: string) => {
    try {
      setLoading(true);
      
      // Validate token format first
      if (!signingToken || signingToken.length !== 64) {
        setError('Invalid signing link');
        return;
      }

      const offerData = await offersService.getBySigningToken(signingToken);

      if (!offerData) {
        setError('Offer not found or link has expired');
        return;
      }

      setOffer(offerData);

      try {
        const list = await offersService.getAttachments(offerData.id);
        setAttachments(list.map(a => ({ id: a.id, name: a.name, file_url: a.file_url })));
      } catch {
        setAttachments([]);
      }

      // Pre-fill signer info from candidate
      if (offerData.candidate) {
        setSignerName(`${offerData.candidate.first_name} ${offerData.candidate.last_name}`);
        setSignerEmail(offerData.candidate.email);
      }

      // Check if already signed
      if (offerData.signature_status === 'signed' || offerData.status === 'accepted') {
        setSigned(true);
      }
    } catch (err: any) {
      console.error('Error fetching offer:', err);
      setError('Failed to load offer letter');
    } finally {
      setLoading(false);
    }
  };

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set up canvas drawing properties
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    setIsDrawing(true);
    const coords = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCoordinates(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    if (canvasRef.current) {
      setSignatureData(canvasRef.current.toDataURL());
    }
  };

  const clearSignature = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        setSignatureData('');
        // Reset drawing properties
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  };

  // Initialize canvas on mount
  useEffect(() => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, []);

  const handleSign = async () => {
    if (!offer || !signatureData || !signerName || !signerEmail) {
      toast({
        title: 'Error',
        description: 'Please provide all required information and sign',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSigning(true);

      // Get IP address (if available)
      let ipAddress = 'N/A';
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        ipAddress = data.ip || 'N/A';
      } catch {
        // Ignore IP fetch errors
      }

      const signatureInfo = {
        signer_id: offer.candidate_id,
        signer_email: signerEmail,
        signer_name: signerName,
        signature_image: signatureData,
        signature_data: {
          signedAt: new Date().toISOString(),
          signerType: 'candidate',
          ipAddress,
          userAgent: navigator.userAgent,
        },
        ip_address: ipAddress,
        user_agent: navigator.userAgent,
      };

      await offersService.createSignature(offer.id, 'candidate', signatureInfo);
      await offersService.updateStatus(offer.id, 'accepted');

      setSigned(true);
      toast({
        title: 'Success',
        description: 'Offer signed successfully!',
        variant: 'success',
      });
    } catch (error: any) {
      console.error('Error signing offer:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to sign offer',
        variant: 'destructive',
      });
    } finally {
      setSigning(false);
    }
  };

  const handleDecline = async () => {
    if (!offer || !confirm('Are you sure you want to decline this offer?')) return;

    try {
      setSigning(true);
      await offersService.updateStatus(offer.id, 'declined');
      toast({
        title: 'Offer Declined',
        description: 'You have declined this offer.',
        variant: 'default',
      });
      // Could redirect or show a message
    } catch (error: any) {
      console.error('Error declining offer:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to decline offer',
        variant: 'destructive',
      });
    } finally {
      setSigning(false);
    }
  };

  const generatePDF = () => {
    if (!offer) return;

    // Create a new window with the offer content
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        title: 'Error',
        description: 'Please allow popups to generate PDF',
        variant: 'destructive',
      });
      return;
    }

    const offerDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Offer Letter - ${offer.candidate ? `${offer.candidate.first_name} ${offer.candidate.last_name}` : 'Candidate'}</title>
          <style>
            @media print {
              @page {
                size: letter;
                margin: 1in;
              }
              body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #000;
              }
            }
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #000;
              max-width: 8.5in;
              margin: 0 auto;
              padding: 1in;
            }
            .offer-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 2rem;
              padding-bottom: 1rem;
              border-bottom: 2px solid #000;
            }
            .offer-header-left {
              flex: 0 0 auto;
            }
            .offer-header-left img {
              height: 60px;
              width: auto;
            }
            .offer-header-right {
              flex: 1;
              text-align: right;
            }
            .offer-header-right h1 {
              margin: 0;
              font-size: 24px;
              font-weight: bold;
              letter-spacing: 2px;
              margin-bottom: 0.5rem;
            }
            .offer-header-right .date {
              font-size: 14px;
              color: #333;
            }
            .offer-content {
              white-space: pre-wrap;
              margin-top: 2rem;
            }
          </style>
        </head>
        <body>
          <div class="offer-header">
            <div class="offer-header-left">
              <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" />
            </div>
            <div class="offer-header-right">
              <h1>OFFER LETTER</h1>
              <div class="date">${offerDate}</div>
            </div>
          </div>
          <div class="offer-content">${offer.offer_letter_content || 'No offer content available'}</div>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    // Wait for content to load, then print
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  if (error || !offer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
            <CardDescription>{error || 'Offer not found'}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              This signing link may be invalid or expired. Please contact the hiring manager for assistance.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="max-w-2xl w-full">
          <CardHeader className="text-center">
            <CheckCircle className="mx-auto h-16 w-16 text-green-600 mb-4" />
            <CardTitle className="text-2xl">Offer Signed Successfully</CardTitle>
            <CardDescription>
              Thank you for signing the offer letter. You will receive a confirmation email shortly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-2">Offer Details:</h3>
              <p><strong>Position:</strong> {offer.position_title}</p>
              <p><strong>Department:</strong> {offer.department}</p>
              {offer.base_salary && (
                <p><strong>Salary:</strong> ${offer.base_salary.toLocaleString()} {offer.pay_frequency && `per ${offer.pay_frequency}`}</p>
              )}
            </div>
            <Button
              onClick={generatePDF}
              variant="outline"
              className="w-full"
            >
              <Download className="mr-2 h-4 w-4" />
              Download PDF Copy
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 py-8 px-4">
      {/* Hide FloatingIssueReporter on this page */}
      <style>{`
        .fixed.left-4.bottom-4 {
          display: none !important;
        }
      `}</style>
      <div className="max-w-4xl mx-auto">
        {/* Offer Letter Header */}
        <div className="flex justify-between items-start mb-6 pb-4 border-b-2 border-gray-300">
          <div>
            <img
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
              alt="AMP Logo"
              className="h-16"
            />
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-bold tracking-wide">OFFER LETTER</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Offer Letter Content */}
        <div
          className="prose max-w-none dark:prose-invert mb-8 text-gray-900 dark:text-gray-100"
          dangerouslySetInnerHTML={{ __html: offer.offer_letter_content || '<p>No offer content available</p>' }}
        />

        {/* Attachments (e.g. benefit package) */}
        {attachments.length > 0 && (
          <div className="mb-8 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              Additional documents
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Download these documents (e.g. benefit package) to review with your offer.
            </p>
            <ul className="space-y-2">
              {attachments.map((a) => (
                <li key={a.id}>
                  <a
                    href={a.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-[#f26722] hover:underline font-medium"
                  >
                    <Download className="h-4 w-4" />
                    {a.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Signature Section */}
        <div className="mt-12 pt-8 border-t-2 border-gray-300">
          <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">Electronic Signature</h2>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Signature *
              </label>
              <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-800">
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={200}
                  style={{ touchAction: 'none' }}
                  className="border border-gray-200 dark:border-gray-700 rounded cursor-crosshair w-full"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    startDrawing(e);
                  }}
                  onTouchMove={(e) => {
                    e.preventDefault();
                    draw(e);
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    stopDrawing();
                  }}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={clearSignature}
                className="mt-2"
              >
                Clear Signature
              </Button>
            </div>

            <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded">
              By signing, you acknowledge that you have read and agree to the terms of this offer letter.
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleSign}
                disabled={!signatureData || !signerName || !signerEmail || signing}
                className="bg-[#f26722] hover:bg-[#f26722]/90 text-white flex-1"
              >
                {signing ? 'Signing...' : (
                  <>
                    <PenTool className="mr-2 h-4 w-4" />
                    Accept & Sign Offer
                  </>
                )}
              </Button>
              <Button
                onClick={handleDecline}
                variant="outline"
                disabled={signing}
                className="text-red-600 hover:text-red-700"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Decline Offer
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
