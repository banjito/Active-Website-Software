import React, { useState, useEffect } from 'react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { PageLayout } from '@/components/ui/PageLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { 
  SelectRoot as Select, 
  SelectTrigger, 
  SelectValue, 
  SelectContent, 
  SelectItem 
} from '@/components/ui/Select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Badge';
import { toast } from '@/components/ui/toast';
import { useAuth } from '@/lib/AuthContext';
import { 
  FileText, 
  Plus,
  Search,
  Download,
  Truck,
  Package,
  DollarSign,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  Trash2,
  Eye,
  Printer
} from 'lucide-react';
import {
  fetchVendorPOs,
  createVendorPO,
  updateVendorPO,
  deleteVendorPO,
  updateVendorPOStatus,
  VendorPO,
  VendorPOItem,
  VendorPOFormData
} from '@/services/vendorPOService';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { fetchVendors, Vendor } from '@/services/vendorService';

const emptyPOForm: VendorPOFormData = {
  vendor_id: null,
  date: new Date().toISOString().split('T')[0],
  terms: 'NET 30',
  quote_number: '',
  quote_references: '',
  ship_to_name: 'AMP Quality Energy Services',
  ship_to_address: '616 Church St. NE',
  ship_to_city: 'Decatur',
  ship_to_state: 'AL',
  ship_to_zip: '35601',
  status: 'pending',
  notes: '',
  authorized_by: '',
  items: []
};

const emptyLineItem: VendorPOItem = {
  item_number: '',
  quantity: '',
  description: '',
  unit_price: '',
  extended_price: 0
};

const VendorPOs: React.FC = () => {
  const { user } = useAuth();
  const [pos, setPOs] = useState<VendorPO[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showPOForm, setShowPOForm] = useState(false);
  const [showPOView, setShowPOView] = useState(false);
  const [selectedPO, setSelectedPO] = useState<VendorPO | null>(null);
  const [editPO, setEditPO] = useState<VendorPO | null>(null);
  const [poForm, setPOForm] = useState<VendorPOFormData>(emptyPOForm);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [posData, vendorsData] = await Promise.all([
        fetchVendorPOs(),
        fetchVendors()
      ]);
      setPOs(posData);
      setVendors(vendorsData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load data. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: VendorPO['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'approved':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'ordered':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
      case 'received':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'cancelled':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  const getStatusIcon = (status: VendorPO['status']) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4" />;
      case 'approved': return <CheckCircle className="h-4 w-4" />;
      case 'ordered': return <Truck className="h-4 w-4" />;
      case 'received': return <Package className="h-4 w-4" />;
      case 'cancelled': return <AlertCircle className="h-4 w-4" />;
      default: return null;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Format unit price - shows as currency if numeric, otherwise as-is (e.g., "PPA")
  const formatUnitPrice = (price: string | number) => {
    const numPrice = typeof price === 'number' ? price : parseFloat(price);
    if (!isNaN(numPrice)) {
      return formatCurrency(numPrice);
    }
    return String(price); // Return as-is for text values like "PPA"
  };

  const filteredPOs = pos.filter(po => {
    const matchesSearch = po.po_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         po.vendor?.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         po.quote_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || po.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPending = pos.filter(po => po.status === 'pending').length;
  const totalOrdered = pos.filter(po => po.status === 'ordered').length;
  const totalValue = pos.reduce((sum, po) => sum + (po.amount || 0), 0);

  const addLineItem = () => {
    setPOForm({
      ...poForm,
      items: [...poForm.items, { ...emptyLineItem }]
    });
  };

  const updateLineItem = (index: number, field: keyof VendorPOItem, value: any) => {
    const updatedItems = [...poForm.items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    
    // Auto-calculate extended price only if both quantity and unit_price are valid numbers
    if (field === 'quantity' || field === 'unit_price') {
      const quantity = parseFloat(String(updatedItems[index].quantity));
      const unitPrice = parseFloat(String(updatedItems[index].unit_price));
      if (!isNaN(quantity) && !isNaN(unitPrice)) {
        updatedItems[index].extended_price = quantity * unitPrice;
      } else {
        updatedItems[index].extended_price = 0;
      }
    }
    
    setPOForm({ ...poForm, items: updatedItems });
  };

  const removeLineItem = (index: number) => {
    const updatedItems = poForm.items.filter((_, i) => i !== index);
    setPOForm({ ...poForm, items: updatedItems });
  };

  const calculateTotal = () => {
    return poForm.items.reduce((sum, item) => sum + (item.extended_price || 0), 0);
  };

  const openNewPO = () => {
    setEditPO(null);
    setPOForm(emptyPOForm);
    setShowPOForm(true);
  };

  const openEditPO = (po: VendorPO) => {
    setEditPO(po);
    setPOForm({
      vendor_id: po.vendor_id,
      date: po.date,
      terms: po.terms || 'NET 30',
      quote_number: po.quote_number || '',
      quote_references: po.quote_references || '',
      ship_to_name: po.ship_to_name || 'AMP Quality Energy Services',
      ship_to_address: po.ship_to_address || '616 Church St. NE',
      ship_to_city: po.ship_to_city || 'Decatur',
      ship_to_state: po.ship_to_state || 'AL',
      ship_to_zip: po.ship_to_zip || '35601',
      status: po.status,
      notes: po.notes || '',
      authorized_by: po.authorized_by || '',
      items: po.items || []
    });
    setShowPOForm(true);
  };

  const handleSavePO = async () => {
    if (!poForm.vendor_id) {
      toast({
        title: 'Validation Error',
        description: 'Please select a vendor.',
        variant: 'destructive',
      });
      return;
    }

    if (poForm.items.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please add at least one line item.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      if (editPO) {
        const updated = await updateVendorPO(editPO.id, poForm);
        setPOs(pos.map(p => p.id === updated.id ? { ...updated, vendor: p.vendor } : p));
        toast({
          title: 'PO Updated',
          description: 'Purchase order has been updated.',
          variant: 'default',
        });
      } else {
        const newPO = await createVendorPO(poForm, user?.id);
        // Reload to get vendor info
        await loadData();
        toast({
          title: 'PO Created',
          description: `Purchase order ${newPO.po_number} has been created.`,
          variant: 'default',
        });
      }
      setShowPOForm(false);
      setPOForm(emptyPOForm);
      setEditPO(null);
    } catch (error) {
      console.error('Error saving PO:', error);
      toast({
        title: 'Error',
        description: 'Failed to save purchase order. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePO = async (po: VendorPO) => {
    if (!confirm(`Are you sure you want to delete PO ${po.po_number}?`)) return;

    try {
      await deleteVendorPO(po.id);
      setPOs(pos.filter(p => p.id !== po.id));
      toast({
        title: 'PO Deleted',
        description: `Purchase order ${po.po_number} has been deleted.`,
        variant: 'default',
      });
    } catch (error) {
      console.error('Error deleting PO:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete purchase order.',
        variant: 'destructive',
      });
    }
  };

  const handleStatusChange = async (po: VendorPO, newStatus: VendorPO['status']) => {
    try {
      await updateVendorPOStatus(po.id, newStatus);
      setPOs(pos.map(p => p.id === po.id ? { ...p, status: newStatus } : p));
      toast({
        title: 'Status Updated',
        description: `PO ${po.po_number} status changed to ${newStatus}.`,
        variant: 'default',
      });
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update status.',
        variant: 'destructive',
      });
    }
  };

  const selectedVendor = vendors.find(v => v.id === poForm.vendor_id);

  if (loading) {
    return (
      <PageLayout
        title="Vendor Purchase Orders"
        subtitle="Manage and track vendor purchase orders"
        breadcrumbs={[
          { label: 'Home', to: '/' },
          { label: "Vendor PO's", to: '/office' },
        ]}
      >
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500"><LoadingSpinner size="md" /></span>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Vendor Purchase Orders"
      subtitle="Manage and track vendor purchase orders"
      breadcrumbs={[
        { label: 'Home', to: '/' },
        { label: "Vendor PO's", to: '/office' },
      ]}
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total POs</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{pos.length}</p>
              </div>
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Pending Approval</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{totalPending}</p>
              </div>
              <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-full">
                <Clock className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">In Transit</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{totalOrdered}</p>
              </div>
              <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                <Truck className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Value</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(totalValue)}
                </p>
              </div>
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
                <DollarSign className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions Bar */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div className="flex flex-1 gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search POs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="ordered">Ordered</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={openNewPO} className="bg-[#f26722] hover:bg-[#e55611]">
              <Plus className="h-4 w-4 mr-2" />
              New PO
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* PO List */}
      <Card>
        <CardHeader>
          <CardTitle>Purchase Orders</CardTitle>
          <CardDescription>View and manage all vendor purchase orders</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">PO Number</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Vendor</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Date</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Quote #</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Amount</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPOs.map((po) => (
                  <tr 
                    key={po.id} 
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-dark-200 transition-colors"
                  >
                    <td className="px-4 py-4">
                      <span className="font-medium text-[#f26722]">{po.po_number}</span>
                    </td>
                    <td className="px-4 py-4 text-gray-900 dark:text-white">
                      {po.vendor?.company_name || 'Unknown Vendor'}
                    </td>
                    <td className="px-4 py-4 text-gray-600 dark:text-gray-300">{po.date}</td>
                    <td className="px-4 py-4 text-gray-600 dark:text-gray-300">{po.quote_number || '-'}</td>
                    <td className="px-4 py-4 text-gray-900 dark:text-white font-medium">
                      {formatCurrency(po.amount || 0)}
                    </td>
                    <td className="px-4 py-4">
                      <Select value={po.status} onValueChange={(value) => handleStatusChange(po, value as VendorPO['status'])}>
                        <SelectTrigger className={`w-[130px] ${getStatusColor(po.status)}`}>
                          <div className="flex items-center gap-1.5">
                            {getStatusIcon(po.status)}
                            <SelectValue />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="ordered">Ordered</SelectItem>
                          <SelectItem value="received">Received</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => { setSelectedPO(po); setShowPOView(true); }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => openEditPO(po)}
                        >
                          Edit
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDeletePO(po)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredPOs.length === 0 && (
              <div className="text-center py-12">
                <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">No purchase orders found</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                  {pos.length === 0 ? 'Create your first purchase order to get started' : 'Try adjusting your search or filter'}
                </p>
                {pos.length === 0 && (
                  <Button onClick={openNewPO} className="mt-4 bg-[#f26722] hover:bg-[#e55611]">
                    <Plus className="h-4 w-4 mr-2" />
                    Create First PO
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* PO Form Dialog */}
      <Dialog open={showPOForm} onOpenChange={setShowPOForm}>
        <DialogContent 
          className="w-[95vw] max-w-[1400px] min-w-[1000px] max-h-[90vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>{editPO ? 'Edit Purchase Order' : 'Create Purchase Order'}</DialogTitle>
          </DialogHeader>

          {/* PO Form styled like a real PO */}
          <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg p-8 bg-white dark:bg-dark-150 w-full">
            {/* Header */}
            <div className="flex justify-between items-start border-b pb-4 mb-6">
              <div className="text-sm text-gray-600 dark:text-gray-400">256-513-8255</div>
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">PURCHASE ORDER</h2>
              </div>
              <div className="text-right text-sm text-gray-600 dark:text-gray-400">
                P.O. Box 1725 Decatur, AL 35602
              </div>
            </div>

            {/* Date, Amount, Terms, PO# Row */}
            <div className="grid grid-cols-4 gap-6 mb-8">
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">Date:</label>
                <Input
                  type="date"
                  value={poForm.date}
                  onChange={(e) => setPOForm({ ...poForm, date: e.target.value })}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">Amount:</label>
                <Input
                  value={formatCurrency(calculateTotal())}
                  readOnly
                  className="w-full bg-gray-100 dark:bg-dark-200 font-semibold"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">Terms:</label>
                <Select value={poForm.terms} onValueChange={(v) => setPOForm({ ...poForm, terms: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NET 30">NET 30</SelectItem>
                    <SelectItem value="NET 15">NET 15</SelectItem>
                    <SelectItem value="NET 60">NET 60</SelectItem>
                    <SelectItem value="CC">CC</SelectItem>
                    <SelectItem value="COD">COD</SelectItem>
                    <SelectItem value="Prepaid">Prepaid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">Purchase Order #</label>
                <Input
                  value={editPO?.po_number || '(Auto-generated)'}
                  readOnly
                  className="w-full bg-gray-100 dark:bg-dark-200"
                />
              </div>
            </div>

            {/* Provider and Ship To */}
            <div className="grid grid-cols-2 gap-12 mb-8">
              <div>
                <label className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2">Provider (Vendor):</label>
                <Select 
                  value={poForm.vendor_id || ''} 
                  onValueChange={(v) => setPOForm({ ...poForm, vendor_id: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a vendor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map(vendor => (
                      <SelectItem key={vendor.id} value={vendor.id}>
                        {vendor.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedVendor && (
                  <div className="mt-3 text-sm text-gray-600 dark:text-gray-400 p-3 bg-gray-50 dark:bg-dark-200 rounded">
                    <p>{selectedVendor.address_street}</p>
                    <p>{selectedVendor.address_city}, {selectedVendor.address_state} {selectedVendor.address_zip}</p>
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2">Ship to:</label>
                <Input
                  value={poForm.ship_to_name}
                  onChange={(e) => setPOForm({ ...poForm, ship_to_name: e.target.value })}
                  className="w-full mb-2"
                  placeholder="Company Name"
                />
                <Input
                  value={poForm.ship_to_address}
                  onChange={(e) => setPOForm({ ...poForm, ship_to_address: e.target.value })}
                  className="w-full mb-2"
                  placeholder="Address"
                />
                <div className="grid grid-cols-3 gap-3">
                  <Input
                    value={poForm.ship_to_city}
                    onChange={(e) => setPOForm({ ...poForm, ship_to_city: e.target.value })}
                    placeholder="City"
                  />
                  <Input
                    value={poForm.ship_to_state}
                    onChange={(e) => setPOForm({ ...poForm, ship_to_state: e.target.value })}
                    placeholder="State"
                  />
                  <Input
                    value={poForm.ship_to_zip}
                    onChange={(e) => setPOForm({ ...poForm, ship_to_zip: e.target.value })}
                    placeholder="ZIP"
                  />
                </div>
              </div>
            </div>

            {/* Quote Info */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">Quote Number:</label>
                <Input
                  value={poForm.quote_number}
                  onChange={(e) => setPOForm({ ...poForm, quote_number: e.target.value })}
                  className="w-full"
                  placeholder="e.g., HVD031825CS6"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">Quote References:</label>
                <Input
                  value={poForm.quote_references}
                  onChange={(e) => setPOForm({ ...poForm, quote_references: e.target.value })}
                  className="w-full"
                  placeholder="e.g., 6039, 6332, 6488"
                />
              </div>
            </div>

            {/* Line Items Table */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-bold text-gray-700 dark:text-gray-300">Line Items</label>
                <Button size="sm" variant="outline" onClick={addLineItem}>
                  <Plus className="h-4 w-4 mr-1" /> Add Item
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 min-w-[700px]">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-dark-200">
                      <th className="border border-gray-300 dark:border-gray-600 px-3 py-3 text-sm font-semibold w-[60px]">Item</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-3 py-3 text-sm font-semibold w-[100px]">Quantity</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-3 py-3 text-sm font-semibold text-left">Description</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-3 py-3 text-sm font-semibold w-[120px]">Unit Price</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-3 py-3 text-sm font-semibold w-[120px]">Extended</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-3 py-3 text-sm w-[60px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {poForm.items.map((item, index) => (
                      <tr key={index}>
                        <td className="border border-gray-300 dark:border-gray-600 px-2 py-2">
                          <Input
                            value={item.item_number}
                            onChange={(e) => updateLineItem(index, 'item_number', e.target.value)}
                            className="h-9 text-center w-full"
                            placeholder=""
                          />
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-2 py-2">
                          <Input
                            type="text"
                            value={item.quantity}
                            onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                            className="h-9 text-center"
                            placeholder=""
                          />
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-2 py-2">
                          <Input
                            value={item.description}
                            onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                            className="h-9 w-full"
                            placeholder="Enter description..."
                          />
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-2 py-2">
                          <Input
                            type="text"
                            value={item.unit_price}
                            onChange={(e) => updateLineItem(index, 'unit_price', e.target.value)}
                            className="h-9 text-right"
                            placeholder="0.00 or PPA"
                          />
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-right bg-gray-50 dark:bg-dark-200 font-medium">
                          {formatCurrency(item.extended_price || 0)}
                        </td>
                        <td className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => removeLineItem(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {poForm.items.length === 0 && (
                      <tr>
                        <td colSpan={6} className="border border-gray-300 dark:border-gray-600 px-4 py-10 text-center text-gray-500">
                          No items added. Click "Add Item" to add line items.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100 dark:bg-dark-200 font-bold">
                      <td colSpan={4} className="border border-gray-300 dark:border-gray-600 px-3 py-3 text-right text-sm">Total</td>
                      <td className="border border-gray-300 dark:border-gray-600 px-3 py-3 text-right text-base">{formatCurrency(calculateTotal())}</td>
                      <td className="border border-gray-300 dark:border-gray-600"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Footer Info */}
            <div className="text-center text-sm text-blue-600 dark:text-blue-400 mb-6 py-2 bg-blue-50 dark:bg-blue-900/20 rounded">
              Remit Invoices to: accounting@ampqes.com
            </div>

            <div className="grid grid-cols-2 gap-8">
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">Authorized Signature:</label>
                <Input
                  value={poForm.authorized_by}
                  onChange={(e) => setPOForm({ ...poForm, authorized_by: e.target.value })}
                  className="w-full"
                  placeholder="Enter name"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">Notes:</label>
                <Textarea
                  value={poForm.notes}
                  onChange={(e) => setPOForm({ ...poForm, notes: e.target.value })}
                  className="w-full"
                  rows={3}
                  placeholder="Additional notes..."
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPOForm(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePO} disabled={saving} className="bg-[#f26722] hover:bg-[#e55611]">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editPO ? 'Update PO' : 'Create PO'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PO View Dialog */}
      <Dialog open={showPOView} onOpenChange={setShowPOView}>
        <DialogContent 
          className="w-[90vw] max-w-[1000px] min-w-[700px] max-h-[90vh] overflow-y-auto"
        >
          {selectedPO && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span>Purchase Order {selectedPO.po_number}</span>
                  <Badge className={getStatusColor(selectedPO.status)}>
                    {selectedPO.status.toUpperCase()}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              {/* PO Preview styled like the image */}
              <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg p-6 bg-white dark:bg-dark-150 print:border-black">
                {/* Header */}
                <div className="flex justify-between items-start border-b pb-4 mb-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400">256-513-8255</div>
                  <div className="text-center">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">PURCHASE ORDER</h2>
                  </div>
                  <div className="text-right text-sm text-gray-600 dark:text-gray-400">
                    P.O. Box 1725 Decatur, AL 35602
                  </div>
                </div>

                {/* Info Row */}
                <div className="grid grid-cols-4 gap-4 mb-6 text-sm">
                  <div>
                    <span className="font-bold">Date:</span> {selectedPO.date}
                  </div>
                  <div>
                    <span className="font-bold">Amount:</span> {formatCurrency(selectedPO.amount || 0)}
                  </div>
                  <div>
                    <span className="font-bold">Terms:</span> {selectedPO.terms}
                  </div>
                  <div>
                    <span className="font-bold">Purchase Order #:</span> {selectedPO.po_number}
                  </div>
                </div>

                {/* Provider and Ship To */}
                <div className="grid grid-cols-2 gap-8 mb-6 text-sm">
                  <div>
                    <p className="font-bold">Provider:</p>
                    <p className="font-medium">{selectedPO.vendor?.company_name}</p>
                    <p>{selectedPO.vendor?.address_street}</p>
                    <p>{selectedPO.vendor?.address_city}, {selectedPO.vendor?.address_state} {selectedPO.vendor?.address_zip}</p>
                  </div>
                  <div>
                    <p className="font-bold">Ship to:</p>
                    <p className="font-medium">{selectedPO.ship_to_name}</p>
                    <p>{selectedPO.ship_to_address}</p>
                    <p>{selectedPO.ship_to_city}, {selectedPO.ship_to_state} {selectedPO.ship_to_zip}</p>
                  </div>
                </div>

                {/* Quote Info */}
                {(selectedPO.quote_number || selectedPO.quote_references) && (
                  <div className="mb-4 text-sm">
                    {selectedPO.quote_references && <p><span className="font-bold">Quote #:</span> {selectedPO.quote_references}</p>}
                    {selectedPO.quote_number && <p><span className="font-bold">Quote Number:</span> {selectedPO.quote_number}</p>}
                  </div>
                )}

                {/* Line Items */}
                <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 mb-4 text-sm">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-dark-200">
                      <th className="border border-gray-300 dark:border-gray-600 px-2 py-2">Item</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-2 py-2">Quantity</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-2 py-2">Description</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-2 py-2">Amount</th>
                      <th className="border border-gray-300 dark:border-gray-600 px-2 py-2">Extended</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedPO.items || []).map((item, index) => (
                      <tr key={index}>
                        <td className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center">{item.item_number}</td>
                        <td className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center">{item.quantity}</td>
                        <td className="border border-gray-300 dark:border-gray-600 px-2 py-2">{item.description}</td>
                        <td className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-right">{formatUnitPrice(item.unit_price)}</td>
                        <td className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-right">{formatCurrency(item.extended_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold">
                      <td colSpan={4} className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-right">Total</td>
                      <td className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-right">{formatCurrency(selectedPO.amount || 0)}</td>
                    </tr>
                  </tfoot>
                </table>

                <div className="text-center text-sm text-blue-600 dark:text-blue-400 mb-4">
                  Remit Invoices to: accounting@ampqes.com
                </div>

                {selectedPO.authorized_by && (
                  <div className="text-sm">
                    <span className="font-bold">Authorized Signature:</span> <span className="italic">{selectedPO.authorized_by}</span>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => printPO(selectedPO)}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print / PDF
                </Button>
                <Button variant="outline" onClick={() => setShowPOView(false)}>
                  Close
                </Button>
                <Button onClick={() => { setShowPOView(false); openEditPO(selectedPO); }}>
                  Edit PO
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
};

// Print function to generate a clean printable PO
function printPO(po: VendorPO) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Format unit price - shows as currency if numeric, otherwise as-is (e.g., "PPA")
  const formatUnitPrice = (price: string | number) => {
    const numPrice = typeof price === 'number' ? price : parseFloat(String(price));
    if (!isNaN(numPrice)) {
      return formatCurrency(numPrice);
    }
    return String(price); // Return as-is for text values like "PPA"
  };

  // Only show actual items - no empty rows or automatic freight
  const items = po.items || [];
  
  const itemRows = items.map((item) => `
    <tr>
      <td>${item.item_number}</td>
      <td>${item.quantity}</td>
      <td>${item.description}</td>
      <td class="amount">${formatUnitPrice(item.unit_price)}</td>
      <td class="amount">${formatCurrency(item.extended_price)}</td>
    </tr>
  `).join('');

  const printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Purchase Order ${po.po_number}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: Arial, sans-serif;
          font-size: 11px;
          line-height: 1.4;
          padding: 40px 50px;
          max-width: 8.5in;
          margin: 0 auto;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 30px;
        }
        .header-left {
          font-size: 11px;
        }
        .header-center {
          text-align: center;
        }
        .header-center h1 {
          font-size: 16px;
          font-weight: bold;
          letter-spacing: 1px;
        }
        .header-right {
          text-align: right;
          font-size: 11px;
        }
        .info-row {
          display: flex;
          justify-content: flex-start;
          gap: 40px;
          margin-bottom: 25px;
          font-size: 11px;
        }
        .info-row .field {
          display: flex;
          align-items: baseline;
        }
        .info-row .label {
          font-weight: bold;
          margin-right: 5px;
        }
        .info-row .value {
          border-bottom: 1px solid #000;
          min-width: 80px;
          padding-bottom: 2px;
        }
        .info-row .value.wide {
          min-width: 100px;
        }
        .parties {
          display: flex;
          justify-content: space-between;
          margin-bottom: 20px;
          font-size: 11px;
        }
        .parties .party {
          width: 45%;
        }
        .parties .label {
          font-weight: bold;
        }
        .parties .name {
          font-weight: normal;
          margin-top: 3px;
        }
        .quote-row {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 10px;
          font-size: 11px;
        }
        .quote-row .label {
          font-weight: bold;
          margin-right: 10px;
        }
        .quote-number-row {
          margin-bottom: 15px;
          font-size: 11px;
        }
        .quote-number-row .label {
          font-weight: bold;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 5px;
          font-size: 10px;
        }
        th {
          border: 1px solid #000;
          padding: 6px 8px;
          text-align: center;
          font-weight: bold;
          background: #f5f5f5;
        }
        td {
          border: 1px solid #000;
          padding: 4px 8px;
          text-align: center;
        }
        td.amount {
          text-align: right;
        }
        td:nth-child(3) {
          text-align: left;
        }
        .empty-row td {
          height: 20px;
        }
        .total-row td {
          font-weight: bold;
        }
        .remit {
          text-align: center;
          margin: 15px 0;
          font-size: 11px;
          color: #0066cc;
        }
        .signature {
          margin-top: 40px;
          font-size: 11px;
        }
        .signature .label {
          font-weight: bold;
        }
        .signature .value {
          font-family: 'Brush Script MT', cursive;
          font-size: 18px;
          font-style: italic;
          margin-left: 10px;
          border-bottom: 1px solid #000;
          display: inline-block;
          min-width: 200px;
          padding-bottom: 5px;
        }
        @media print {
          body {
            padding: 20px 30px;
          }
          @page {
            margin: 0.5in;
            size: letter;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-left">256-513-8255</div>
        <div class="header-center">
          <h1>PURCHASE ORDER</h1>
        </div>
        <div class="header-right">P.O. Box 1725 Decatur, AL 35602</div>
      </div>

      <div class="info-row">
        <div class="field">
          <span class="label">Date:</span>
          <span class="value">${po.date}</span>
        </div>
        <div class="field">
          <span class="label">Amount:</span>
          <span class="value wide">${formatCurrency(po.amount || 0)}</span>
        </div>
        <div class="field">
          <span class="label">Terms:</span>
          <span class="value">${po.terms || 'NET 30'}</span>
        </div>
        <div class="field">
          <span class="label">Purchase Order #</span>
          <span class="value wide">${po.po_number}</span>
        </div>
      </div>

      <div class="parties">
        <div class="party">
          <div class="label">Provider:</div>
          <div class="name">${po.vendor?.company_name || ''}</div>
          <div>${po.vendor?.address_street || ''}</div>
          <div>${po.vendor?.address_city || ''}, ${po.vendor?.address_state || ''} ${po.vendor?.address_zip || ''}</div>
        </div>
        <div class="party">
          <div class="label">Ship to:</div>
          <div class="name">${po.ship_to_name}</div>
          <div>${po.ship_to_address}</div>
          <div>${po.ship_to_city}, ${po.ship_to_state} ${po.ship_to_zip}</div>
        </div>
      </div>

      ${po.quote_references ? `
      <div class="quote-row">
        <span class="label">Quote #</span>
        <span>${po.quote_references}</span>
      </div>
      ` : ''}

      ${po.quote_number ? `
      <div class="quote-number-row">
        <span class="label">Quote Number</span> ${po.quote_number}
      </div>
      ` : ''}

      <table>
        <thead>
          <tr>
            <th style="width: 50px;">Item</th>
            <th style="width: 70px;">Quantity</th>
            <th>Description</th>
            <th style="width: 80px;">Amount</th>
            <th style="width: 90px;">Extended</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="4" style="text-align: right; border-top: 2px solid #000;">Total</td>
            <td class="amount" style="border-top: 2px solid #000;">${formatCurrency(po.amount || 0)}</td>
          </tr>
        </tfoot>
      </table>

      <div class="remit">Remit Invoices to: accounting@ampqes.com</div>

      <div class="signature">
        <span class="label">Authorized Signature:</span>
        <span class="value">${po.authorized_by || ''}</span>
      </div>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  }
}

export default VendorPOs;
