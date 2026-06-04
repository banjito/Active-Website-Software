import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { Select } from '../../../components/ui/Select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/Dialog';
import { Folder, Plus, Edit, Trash2, Eye, Upload, Download, FileText, X, ExternalLink, Loader2, PenTool, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 15;
import { onboardingService, NewHirePacket } from '../../../services/hr/onboardingService';
import { useAuth } from '../../../lib/AuthContext';
import { toast } from '../../../components/ui/toast';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '../../../lib/supabase';

export const NewHirePackets: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [packets, setPackets] = useState<NewHirePacket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'templates' | 'active' | 'archived'>('all');
  const [page, setPage] = useState(1);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  
  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDocumentViewerOpen, setIsDocumentViewerOpen] = useState(false);
  const [selectedPacket, setSelectedPacket] = useState<NewHirePacket | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<{ name: string; file_url?: string; file_path?: string; requires_signature?: boolean } | null>(null);
  const [documentLoading, setDocumentLoading] = useState(true);
  const [documentError, setDocumentError] = useState(false);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawingSignature, setIsDrawingSignature] = useState(false);
  const [signatureSectionCollapsed, setSignatureSectionCollapsed] = useState(false);
  const [sendingSignature, setSendingSignature] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    packet_type: 'standard' as const,
    documents: [] as Array<{ name: string; file_url?: string; file_path?: string; required: boolean; order: number; requires_signature?: boolean }>,
    instructions: '',
    status: 'draft' as const,
    is_template: false,
  });

  useEffect(() => {
    fetchData();
  }, [filter]);

  const packetIdFromUrl = searchParams.get('packetId');
  useEffect(() => {
    if (!packetIdFromUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const packet = await onboardingService.getPacketById(packetIdFromUrl);
        if (!cancelled && packet) {
          setSelectedPacket(packet);
          setIsViewModalOpen(true);
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete('packetId');
            return next;
          }, { replace: true });
        }
      } catch {
        if (!cancelled) setSearchParams((prev) => { const n = new URLSearchParams(prev); n.delete('packetId'); return n; }, { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [packetIdFromUrl]);

  const fetchData = async () => {
    try {
      setLoading(true);
      // This page manages packet *templates*. Per-person instance copies are created
      // by `assignPacketToTracking` with is_template=false and are viewed from the
      // Onboarding Tracking modal via `?packetId=` deep link, not listed here –
      // otherwise every assignment looks like a duplicated template.
      const filters: any = { custom_only: true, is_template: true };
      
      if (filter === 'active') {
        filters.status = 'active';
      } else if (filter === 'archived') {
        filters.status = 'archived';
      }
      
      const data = await onboardingService.getPackets(filters);
      setPackets(data);
    } catch (error: any) {
      console.error('Error fetching packets:', error);
      toast({
        title: 'Error',
        description: 'Failed to load packets. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleDocumentAdd = () => {
    setFormData(prev => ({
      ...prev,
      documents: [
        ...prev.documents,
        { name: '', required: false, order: prev.documents.length, requires_signature: false },
      ],
    }));
  };

  const handleDocumentChange = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      documents: prev.documents.map((doc, i) =>
        i === index ? { ...doc, [field]: value } : doc
      ),
    }));
  };

  const handleDocumentRemove = (index: number) => {
    setFormData(prev => ({
      ...prev,
      documents: prev.documents.filter((_, i) => i !== index).map((doc, i) => ({
        ...doc,
        order: i,
      })),
    }));
  };

  const handleFileUpload = async (index: number, file: File) => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to upload files',
        variant: 'destructive',
      });
      return;
    }

    setUploadingIndex(index);

    try {
      // Validate file size (50MB limit)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        toast({
          title: 'Error',
          description: 'File size exceeds 50MB limit',
          variant: 'destructive',
        });
        setUploadingIndex(null);
        return;
      }

      // Create unique file name
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `onboarding-documents/${fileName}`;

      // Upload to Supabase Storage (using 'documents' bucket)
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      // Update document with file info
      handleDocumentChange(index, 'file_path', filePath);
      handleDocumentChange(index, 'file_url', publicUrl);
      if (!formData.documents[index].name) {
        handleDocumentChange(index, 'name', file.name);
      }
      
      toast({
        title: 'Success',
        description: 'File uploaded successfully',
        variant: 'success',
      });
    } catch (error: any) {
      console.error('File upload error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to upload file',
        variant: 'destructive',
      });
    } finally {
      setUploadingIndex(null);
    }
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a packet name',
        variant: 'destructive',
      });
      return;
    }

    if (!user) return;

    try {
      await onboardingService.createPacket({
        ...formData,
        created_by: user.id,
      });

      toast({
        title: 'Success',
        description: 'Packet created successfully',
        variant: 'success',
      });
      setIsCreateModalOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create packet',
        variant: 'destructive',
      });
    }
  };

  const handleUpdate = async () => {
    if (!selectedPacket) return;

    if (!formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a packet name',
        variant: 'destructive',
      });
      return;
    }

    try {
      await onboardingService.updatePacket(selectedPacket.id, formData);

      toast({
        title: 'Success',
        description: 'Packet updated successfully',
        variant: 'success',
      });
      setIsEditModalOpen(false);
      setSelectedPacket(null);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update packet',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this packet?')) return;

    try {
      await onboardingService.deletePacket(id);
      toast({
        title: 'Success',
        description: 'Packet deleted successfully',
        variant: 'success',
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete packet',
        variant: 'destructive',
      });
    }
  };

  const handleDuplicate = async (packet: NewHirePacket) => {
    try {
      await onboardingService.createPacket({
        ...packet,
        name: `${packet.name} (Copy)`,
        id: undefined as any,
        created_at: undefined as any,
        updated_at: undefined as any,
        created_by: user!.id,
      });

      toast({
        title: 'Success',
        description: 'Packet duplicated successfully',
        variant: 'success',
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to duplicate packet',
        variant: 'destructive',
      });
    }
  };

  const openEditModal = (packet: NewHirePacket) => {
    setSelectedPacket(packet);
    setFormData({
      name: packet.name,
      description: packet.description || '',
      packet_type: packet.packet_type,
      documents: (packet.documents || []).map((d: any) => ({
        ...d,
        required: d.required ?? false,
        order: d.order ?? 0,
        requires_signature: d.requires_signature ?? false,
      })),
      instructions: packet.instructions || '',
      status: packet.status,
      is_template: packet.is_template,
    });
    setIsEditModalOpen(true);
  };

  const openViewModal = (packet: NewHirePacket) => {
    setSelectedPacket(packet);
    setIsViewModalOpen(true);
  };

  const openDocumentViewer = (doc: { name: string; file_url?: string; file_path?: string; requires_signature?: boolean }) => {
    setSelectedDocument(doc);
    setIsDocumentViewerOpen(true);
    setDocumentLoading(true);
    setDocumentError(false);
    setSignatureSectionCollapsed(false);
  };

  const handleDocumentViewerClose = () => {
    setIsDocumentViewerOpen(false);
    setSelectedDocument(null);
    setDocumentLoading(false);
    setDocumentError(false);
  };

  const getSignatureCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!signatureCanvasRef.current) return { x: 0, y: 0 };
    const canvas = signatureCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const startSignature = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!signatureCanvasRef.current) return;
    const ctx = signatureCanvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setIsDrawingSignature(true);
    const coords = getSignatureCoords(e);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const drawSignature = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingSignature || !signatureCanvasRef.current) return;
    const ctx = signatureCanvasRef.current.getContext('2d');
    if (!ctx) return;
    const coords = getSignatureCoords(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopSignature = () => setIsDrawingSignature(false);

  const clearSignatureBox = () => {
    if (!signatureCanvasRef.current) return;
    const ctx = signatureCanvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, signatureCanvasRef.current.width, signatureCanvasRef.current.height);
  };

  const hasSignatureDrawn = (): boolean => {
    if (!signatureCanvasRef.current) return false;
    const canvas = signatureCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  };

  const handleSignAndSend = async () => {
    if (!selectedDocument || !selectedPacket || !user) return;
    if (!hasSignatureDrawn()) {
      toast({
        title: 'Signature required',
        description: 'Please draw your signature in the box above.',
        variant: 'destructive',
      });
      return;
    }
    if (!signatureCanvasRef.current) return;
    setSendingSignature(true);
    try {
      const signatureImage = signatureCanvasRef.current.toDataURL('image/png');
      const signerName = (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || user.email || 'Unknown';
      const signerEmail = user.email || '';
      await onboardingService.submitPacketDocumentSignature({
        packet_id: selectedPacket.id,
        document_name: selectedDocument.name,
        document_file_url: selectedDocument.file_url,
        signer_name: signerName,
        signer_email: signerEmail,
        signature_image: signatureImage,
      });
      toast({
        title: 'Signed and sent',
        description: 'Your signature has been recorded for this document.',
        variant: 'success',
      });
      handleDocumentViewerClose();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to submit signature',
        variant: 'destructive',
      });
    } finally {
      setSendingSignature(false);
    }
  };

  const handleDocumentDownload = (doc: { name: string; file_url?: string; file_path?: string }) => {
    if (doc.file_url) {
      const link = document.createElement('a');
      link.href = doc.file_url;
      link.download = doc.name;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleDocumentOpenInNewTab = (doc: { name: string; file_url?: string; file_path?: string }) => {
    if (doc.file_url) {
      window.open(doc.file_url, '_blank');
    }
  };

  const isPdfFile = (url?: string) => {
    if (!url) return false;
    return url.toLowerCase().endsWith('.pdf');
  };

  const isImageFile = (url?: string) => {
    if (!url) return false;
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      packet_type: 'standard',
      documents: [],
      instructions: '',
      status: 'draft',
      is_template: false,
    });
    setUploadingIndex(null);
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
      active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      archived: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status as keyof typeof colors] || colors.draft}`}>
        {status}
      </span>
    );
  };

  const filteredPackets = packets.filter(p => {
    if (filter === 'templates') return p.is_template;
    if (filter === 'active') return p.status === 'active';
    if (filter === 'archived') return p.status === 'archived';
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filteredPackets.length / PAGE_SIZE));
  const paginatedPackets = filteredPackets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">New Hire Packets</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Create and manage onboarding packets for new employees
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setIsCreateModalOpen(true);
          }}
          className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Packet
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setFilter('all'); setPage(1); }}
        >
          All
        </Button>
        <Button
          variant={filter === 'templates' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setFilter('templates'); setPage(1); }}
        >
          Templates
        </Button>
        <Button
          variant={filter === 'active' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setFilter('active'); setPage(1); }}
        >
          Active
        </Button>
        <Button
          variant={filter === 'archived' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setFilter('archived'); setPage(1); }}
        >
          Archived
        </Button>
      </div>

      {/* Packets List */}
      {loading ? (
        <div className="text-center py-12"><LoadingSpinner size="md" /></div>
      ) : filteredPackets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Folder className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400">No packets found</p>
          </CardContent>
        </Card>
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginatedPackets.map((packet) => (
            <Card key={packet.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{packet.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {packet.description || 'No description'}
                    </CardDescription>
                  </div>
                  {getStatusBadge(packet.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Type:</span> {packet.packet_type}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Documents:</span> {packet.documents?.length || 0}
                  </div>
                  {packet.is_template && (
                    <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded text-xs">
                      Template
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openViewModal(packet)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditModal(packet)}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDuplicate(packet)}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Duplicate
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(packet.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {filteredPackets.length > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Page {page} of {totalPages} ({filteredPackets.length} total)
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
        </>
      )}

      {/* Create Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Hire Packet</DialogTitle>
            <DialogDescription>
              Create a new onboarding packet with documents and instructions
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Name *</label>
              <Input
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g., Standard Onboarding Packet"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <Textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Brief description of this packet"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Packet Type</label>
                <Select
                  name="packet_type"
                  value={formData.packet_type}
                  onChange={handleInputChange}
                  options={[
                    { value: 'standard', label: 'Standard' },
                    { value: 'executive', label: 'Executive' },
                    { value: 'contractor', label: 'Contractor' },
                    { value: 'intern', label: 'Intern' },
                    { value: 'custom', label: 'Custom' },
                  ]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <Select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  options={[
                    { value: 'draft', label: 'Draft' },
                    { value: 'active', label: 'Active' },
                    { value: 'archived', label: 'Archived' },
                  ]}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_template"
                name="is_template"
                checked={formData.is_template}
                onChange={handleInputChange}
                className="rounded"
              />
              <label htmlFor="is_template" className="text-sm font-medium">
                Save as Template
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Instructions</label>
              <Textarea
                name="instructions"
                value={formData.instructions}
                onChange={handleInputChange}
                placeholder="Instructions for completing this packet"
                rows={4}
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium">Documents</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDocumentAdd}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Document
                </Button>
              </div>
              <div className="space-y-2">
                {formData.documents.map((doc, index) => (
                  <div key={index} className="flex gap-2 items-center p-2 border rounded">
                    <Input
                      placeholder="Document name"
                      value={doc.name}
                      onChange={(e) => handleDocumentChange(index, 'name', e.target.value)}
                      className="flex-1"
                    />
                    <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={doc.required}
                        onChange={(e) => handleDocumentChange(index, 'required', e.target.checked)}
                        className="rounded"
                      />
                      Required
                    </label>
                    <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={doc.requires_signature ?? false}
                        onChange={(e) => handleDocumentChange(index, 'requires_signature', e.target.checked)}
                        className="rounded"
                      />
                      Signature box
                    </label>
                    <input
                      type="file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleFileUpload(index, file);
                        }
                        // Reset input so same file can be selected again
                        e.target.value = '';
                      }}
                      className="hidden"
                      id={`file-${index}`}
                      accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                      disabled={uploadingIndex === index}
                    />
                    <label 
                      htmlFor={`file-${index}`} 
                      className={`cursor-pointer ${uploadingIndex === index ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span className="inline-flex items-center justify-center px-3 py-1.5 text-sm rounded-lg border border-dark-accent/30 hover:bg-dark-accent/10 text-dark-primary focus:ring-dark-accent dark:border-dark-700 dark:hover:bg-dark-700/20 dark:text-white">
                        {uploadingIndex === index ? (
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                      </span>
                    </label>
                    {doc.file_url && (
                      <span className="text-xs text-green-600 dark:text-green-400" title="File uploaded">
                        ✓
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDocumentRemove(index)}
                      disabled={uploadingIndex === index}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {formData.documents.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No documents added. Click "Add Document" to add one.
                  </p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            >
              Create Packet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit New Hire Packet</DialogTitle>
            <DialogDescription>
              Update the packet details and documents
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Name *</label>
              <Input
                name="name"
                value={formData.name}
                onChange={handleInputChange}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <Textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Packet Type</label>
                <Select
                  name="packet_type"
                  value={formData.packet_type}
                  onChange={handleInputChange}
                  options={[
                    { value: 'standard', label: 'Standard' },
                    { value: 'executive', label: 'Executive' },
                    { value: 'contractor', label: 'Contractor' },
                    { value: 'intern', label: 'Intern' },
                    { value: 'custom', label: 'Custom' },
                  ]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <Select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  options={[
                    { value: 'draft', label: 'Draft' },
                    { value: 'active', label: 'Active' },
                    { value: 'archived', label: 'Archived' },
                  ]}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_template_edit"
                name="is_template"
                checked={formData.is_template}
                onChange={handleInputChange}
                className="rounded"
              />
              <label htmlFor="is_template_edit" className="text-sm font-medium">
                Save as Template
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Instructions</label>
              <Textarea
                name="instructions"
                value={formData.instructions}
                onChange={handleInputChange}
                rows={4}
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium">Documents</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDocumentAdd}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Document
                </Button>
              </div>
              <div className="space-y-2">
                {formData.documents.map((doc, index) => (
                  <div key={index} className="flex gap-2 items-center p-2 border rounded">
                    <Input
                      placeholder="Document name"
                      value={doc.name}
                      onChange={(e) => handleDocumentChange(index, 'name', e.target.value)}
                      className="flex-1"
                    />
                    <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={doc.required}
                        onChange={(e) => handleDocumentChange(index, 'required', e.target.checked)}
                        className="rounded"
                      />
                      Required
                    </label>
                    <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={doc.requires_signature ?? false}
                        onChange={(e) => handleDocumentChange(index, 'requires_signature', e.target.checked)}
                        className="rounded"
                      />
                      Signature box
                    </label>
                    <input
                      type="file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleFileUpload(index, file);
                        }
                        // Reset input so same file can be selected again
                        e.target.value = '';
                      }}
                      className="hidden"
                      id={`file-edit-${index}`}
                      accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                      disabled={uploadingIndex === index}
                    />
                    <label 
                      htmlFor={`file-edit-${index}`} 
                      className={`cursor-pointer ${uploadingIndex === index ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span className="inline-flex items-center justify-center px-3 py-1.5 text-sm rounded-lg border border-dark-accent/30 hover:bg-dark-accent/10 text-dark-primary focus:ring-dark-accent dark:border-dark-700 dark:hover:bg-dark-700/20 dark:text-white">
                        {uploadingIndex === index ? (
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                      </span>
                    </label>
                    {doc.file_url && (
                      <span className="text-xs text-green-600 dark:text-green-400" title="File uploaded">
                        ✓
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDocumentRemove(index)}
                      disabled={uploadingIndex === index}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            >
              Update Packet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="w-[60vw] max-w-none max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedPacket?.name}</DialogTitle>
            <DialogDescription>
              {selectedPacket?.description || 'No description'}
            </DialogDescription>
          </DialogHeader>
          {selectedPacket && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm font-medium">Type:</span>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{selectedPacket.packet_type}</p>
                </div>
                <div>
                  <span className="text-sm font-medium">Status:</span>
                  <div className="mt-1">{getStatusBadge(selectedPacket.status)}</div>
                </div>
              </div>
              {selectedPacket.instructions && (
                <div>
                  <span className="text-sm font-medium">Instructions:</span>
                  <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {selectedPacket.instructions}
                    </p>
                  </div>
                </div>
              )}
              <div>
                <span className="text-sm font-medium">Documents ({selectedPacket.documents?.length || 0}):</span>
                <div className="mt-2 space-y-2">
                  {selectedPacket.documents && selectedPacket.documents.length > 0 ? (
                    selectedPacket.documents.map((doc, index) => (
                      <div key={index} className="flex items-center gap-2 p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />
                        <span className="text-sm flex-1 font-medium">{doc.name || 'Unnamed Document'}</span>
                        {doc.required && (
                          <span className="text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 px-2 py-1 rounded">
                            Required
                          </span>
                        )}
                        {(doc as { requires_signature?: boolean }).requires_signature && (
                          <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-2 py-1 rounded flex items-center gap-1">
                            <PenTool className="h-3 w-3" />
                            Signature
                          </span>
                        )}
                        {doc.file_url ? (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openDocumentViewer(doc)}
                              className="flex items-center gap-1"
                            >
                              <Eye className="h-4 w-4" />
                              View
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDocumentDownload(doc)}
                              className="flex items-center gap-1"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDocumentOpenInNewTab(doc)}
                              className="flex items-center gap-1"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500 dark:text-gray-400">No file uploaded</span>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                      No documents in this packet
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Viewer Modal */}
      <Dialog open={isDocumentViewerOpen} onOpenChange={handleDocumentViewerClose}>
        <DialogContent className="w-[75vw] max-w-none h-[95vh] max-h-[95vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 pt-4 pb-2 flex-shrink-0">
            <DialogTitle className="text-base">{selectedDocument?.name || 'Document Viewer'}</DialogTitle>
          </DialogHeader>
          {selectedDocument && selectedDocument.file_url && (
            <div className="flex-1 min-h-0 flex flex-col">
              {/* Toolbar */}
              <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50 dark:bg-gray-800 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-gray-500" />
                  <span className="text-sm font-medium">{selectedDocument.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDocumentOpenInNewTab(selectedDocument)}
                    className="flex items-center gap-1"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open in New Tab
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDocumentDownload(selectedDocument)}
                    className="flex items-center gap-1"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                </div>
              </div>

              {/* Document Content */}
              <div className="flex-1 relative bg-gray-100 dark:bg-gray-900 overflow-hidden m-0">
                {documentLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-900 z-10">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-8 h-8 text-[#f26722] animate-spin" />
                      <p className="text-sm text-gray-600 dark:text-gray-400"><LoadingSpinner size="md" /></p>
                    </div>
                  </div>
                )}

                {documentError ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center p-8">
                      <p className="text-red-600 dark:text-red-400 mb-4">
                        Failed to load document
                      </p>
                      <div className="flex items-center justify-center gap-3">
                        <Button
                          variant="outline"
                          onClick={() => handleDocumentOpenInNewTab(selectedDocument)}
                          className="flex items-center gap-2"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Open in New Tab
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleDocumentDownload(selectedDocument)}
                          className="flex items-center gap-2"
                        >
                          <Download className="w-4 h-4" />
                          Download
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {isPdfFile(selectedDocument.file_url) ? (
                      <iframe
                        src={`${selectedDocument.file_url}#toolbar=1&navpanes=1&scrollbar=1`}
                        className="w-full h-full border-0 m-0"
                        title={selectedDocument.name}
                        onLoad={() => setDocumentLoading(false)}
                        onError={() => {
                          setDocumentLoading(false);
                          setDocumentError(true);
                        }}
                      />
                    ) : isImageFile(selectedDocument.file_url) ? (
                      <div className="w-full h-full flex items-center justify-center p-2">
                        <img
                          src={selectedDocument.file_url}
                          alt={selectedDocument.name}
                          className="max-w-full max-h-full object-contain"
                          onLoad={() => setDocumentLoading(false)}
                          onError={() => {
                            setDocumentLoading(false);
                            setDocumentError(true);
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center p-8">
                          <FileText className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                          <p className="text-gray-600 dark:text-gray-400 mb-4">
                            Preview not available for this file type
                          </p>
                          <div className="flex items-center justify-center gap-3">
                            <Button
                              variant="outline"
                              onClick={() => handleDocumentOpenInNewTab(selectedDocument)}
                              className="flex items-center gap-2"
                            >
                              <ExternalLink className="w-4 h-4" />
                              Open in New Tab
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleDocumentDownload(selectedDocument)}
                              className="flex items-center gap-2"
                            >
                              <Download className="w-4 h-4" />
                              Download to View
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Collapsible draw-in signature box when document requires signature */}
              {selectedDocument.requires_signature && (
                <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <button
                    type="button"
                    onClick={() => setSignatureSectionCollapsed(!signatureSectionCollapsed)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Signature</span>
                    {signatureSectionCollapsed ? (
                      <ChevronDown className="h-4 w-4 text-gray-500" />
                    ) : (
                      <ChevronUp className="h-4 w-4 text-gray-500" />
                    )}
                  </button>
                  {!signatureSectionCollapsed && (
                    <div className="px-4 pb-4">
                      <div className="max-w-md">
                        <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 overflow-hidden">
                          <canvas
                            ref={signatureCanvasRef}
                            width={400}
                            height={120}
                            className="block w-full cursor-crosshair touch-none border-0"
                            style={{ maxWidth: '100%', height: '120px' }}
                            onMouseDown={startSignature}
                            onMouseMove={drawSignature}
                            onMouseUp={stopSignature}
                            onMouseLeave={stopSignature}
                            onTouchStart={(e) => { e.preventDefault(); startSignature(e); }}
                            onTouchMove={(e) => { e.preventDefault(); drawSignature(e); }}
                            onTouchEnd={(e) => { e.preventDefault(); stopSignature(); }}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={clearSignatureBox}
                          className="mt-2"
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {selectedDocument && !selectedDocument.file_url && (
            <div className="flex items-center justify-center p-8">
              <div className="text-center">
                <FileText className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600 dark:text-gray-400">
                  No file available for this document
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="px-4 pb-4 pt-2 flex-shrink-0 flex-row justify-between sm:justify-between">
            <div className="flex gap-2">
              {selectedDocument?.requires_signature && selectedPacket && (
                <Button
                  onClick={handleSignAndSend}
                  disabled={sendingSignature}
                  size="sm"
                  className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
                >
                  {sendingSignature ? 'Sending...' : 'Sign and Send'}
                </Button>
              )}
            </div>
            <Button variant="outline" onClick={handleDocumentViewerClose} size="sm">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
