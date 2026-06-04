import React, { useState, useEffect } from 'react';
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { Select } from '../../../components/ui/Select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/Dialog';
import { DollarSign, Briefcase, Building, Edit, Eye, Plus, Save } from 'lucide-react';
import { offersService, Offer, CreateOfferInput } from '../../../services/hr/offersService';
import { candidatesService, Candidate } from '../../../services/hr/candidatesService';
import { useAuth } from '../../../lib/AuthContext';
import { toast } from '../../../components/ui/toast';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export const CompPositionDetails: React.FC = () => {
  const { user } = useAuth();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [formData, setFormData] = useState<Partial<CreateOfferInput>>({
    candidate_id: '',
    position_title: '',
    department: '',
    employment_type: 'full-time',
    start_date: '',
    location: '',
    reporting_manager: '',
    base_salary: undefined,
    salary_currency: 'USD',
    pay_frequency: 'annual',
    bonus_amount: undefined,
    bonus_description: '',
    equity_compensation: '',
    benefits_summary: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [offersData, candidatesData] = await Promise.all([
        offersService.getAll(),
        candidatesService.getAll(),
      ]);
      setOffers(offersData);
      setCandidates(candidatesData.filter(c => ['offer', 'interview', 'offer_sent', 'offer_accepted'].includes(c.status)));
    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load data. Please try again.',
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
      [name]: type === 'number' ? (value ? parseFloat(value) : undefined) : value,
    }));
  };

  const handleCreate = async () => {
    if (!formData.candidate_id || !formData.position_title || !formData.department) {
      toast({
        title: 'Error',
        description: 'Candidate, position title, and department are required',
        variant: 'destructive',
      });
      return;
    }

    if (!user) return;

    try {
      // Clean up date fields - convert empty strings to undefined
      const cleanedFormData: CreateOfferInput = {
        ...formData as CreateOfferInput,
        start_date: formData.start_date && formData.start_date.trim() ? formData.start_date : undefined,
      };
      
      await offersService.create(cleanedFormData, user.id);
      toast({
        title: 'Success',
        description: 'Compensation and position details created successfully',
        variant: 'success',
      });
      setIsCreateModalOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create offer details',
        variant: 'destructive',
      });
    }
  };

  const handleUpdate = async () => {
    if (!selectedOffer) return;

    try {
      // Clean up date fields - convert empty strings to undefined
      const cleanedFormData: Partial<CreateOfferInput> = {
        ...formData,
        start_date: formData.start_date && formData.start_date.trim() ? formData.start_date : undefined,
      };
      
      await offersService.update(selectedOffer.id, cleanedFormData);
      toast({
        title: 'Success',
        description: 'Compensation and position details updated successfully',
        variant: 'success',
      });
      setIsEditModalOpen(false);
      setSelectedOffer(null);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update offer details',
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setFormData({
      candidate_id: '',
      position_title: '',
      department: '',
      employment_type: 'full-time',
      start_date: '',
      location: '',
      reporting_manager: '',
      base_salary: undefined,
      salary_currency: 'USD',
      pay_frequency: 'annual',
      bonus_amount: undefined,
      bonus_description: '',
      equity_compensation: '',
      benefits_summary: '',
    });
  };

  const openEditModal = (offer: Offer) => {
    setSelectedOffer(offer);
    setFormData({
      candidate_id: offer.candidate_id,
      position_title: offer.position_title,
      department: offer.department,
      employment_type: offer.employment_type,
      start_date: offer.start_date,
      location: offer.location,
      reporting_manager: offer.reporting_manager,
      base_salary: offer.base_salary,
      salary_currency: offer.salary_currency,
      pay_frequency: offer.pay_frequency,
      bonus_amount: offer.bonus_amount,
      bonus_description: offer.bonus_description,
      equity_compensation: offer.equity_compensation,
      benefits_summary: offer.benefits_summary,
    });
    setIsEditModalOpen(true);
  };

  const openViewModal = (offer: Offer) => {
    setSelectedOffer(offer);
    setIsViewModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Compensation & Position Details</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Set up pay, title, department, and other position details for offers
          </p>
        </div>
        <Button
          className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
          onClick={() => {
            resetForm();
            setIsCreateModalOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Offer Details
        </Button>
      </div>

      {/* Offers List */}
      <Card>
        <CardHeader>
          <CardTitle>All Offers</CardTitle>
          <CardDescription>
            View and manage compensation and position details for all offers
          </CardDescription>
        </CardHeader>
        <CardContent>
          {offers.length === 0 ? (
            <div className="text-center py-12">
              <Briefcase className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">No offers</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Create your first offer with compensation and position details
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {offers.map((offer) => (
                <div
                  key={offer.id}
                  className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-100"
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {offer.candidate ? `${offer.candidate.first_name} ${offer.candidate.last_name}` : 'Unknown Candidate'}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {offer.position_title} - {offer.department}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {offer.base_salary ? `$${offer.base_salary.toLocaleString()}` : 'Salary not set'} 
                      {offer.pay_frequency && ` / ${offer.pay_frequency}`}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      Employment Type: {offer.employment_type} | Location: {offer.location || 'N/A'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openViewModal(offer)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditModal(offer)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog open={isCreateModalOpen || isEditModalOpen} onOpenChange={(open) => {
        if (!open) {
          setIsCreateModalOpen(false);
          setIsEditModalOpen(false);
          setSelectedOffer(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditModalOpen ? 'Edit' : 'Create'} Compensation & Position Details</DialogTitle>
            <DialogDescription>
              {isEditModalOpen ? 'Update compensation and position details' : 'Set up pay, title, department, and other details'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Select
              label="Candidate *"
              name="candidate_id"
              value={formData.candidate_id}
              onChange={(e) => {
                handleInputChange(e);
                const candidate = candidates.find(c => c.id === e.target.value);
                if (candidate && !formData.position_title) {
                  setFormData(prev => ({ ...prev, position_title: candidate.position_applied }));
                }
              }}
              options={candidates.map(c => ({
                value: c.id,
                label: `${c.first_name} ${c.last_name} - ${c.position_applied}`,
              }))}
              required
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Position Title *"
                name="position_title"
                value={formData.position_title}
                onChange={handleInputChange}
                required
              />
              <Input
                label="Department *"
                name="department"
                value={formData.department}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select
                label="Employment Type *"
                name="employment_type"
                value={formData.employment_type}
                onChange={handleInputChange}
                options={[
                  { value: 'full-time', label: 'Full-Time' },
                  { value: 'part-time', label: 'Part-Time' },
                  { value: 'contract', label: 'Contract' },
                  { value: 'temporary', label: 'Temporary' },
                ]}
                required
              />
              <Input
                label="Start Date"
                name="start_date"
                type="date"
                value={formData.start_date}
                onChange={handleInputChange}
              />
              <Input
                label="Location"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
              />
            </div>

            <Input
              label="Reporting Manager"
              name="reporting_manager"
              value={formData.reporting_manager}
              onChange={handleInputChange}
            />

            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Compensation Details</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  label="Base Salary"
                  name="base_salary"
                  type="number"
                  value={formData.base_salary?.toString() || ''}
                  onChange={handleInputChange}
                />
                <Select
                  label="Pay Frequency"
                  name="pay_frequency"
                  value={formData.pay_frequency}
                  onChange={handleInputChange}
                  options={[
                    { value: 'hourly', label: 'Hourly' },
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'bi-weekly', label: 'Bi-Weekly' },
                    { value: 'monthly', label: 'Monthly' },
                    { value: 'annual', label: 'Annual' },
                  ]}
                />
                <Input
                  label="Currency"
                  name="salary_currency"
                  value={formData.salary_currency}
                  onChange={handleInputChange}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <Input
                  label="Bonus Amount"
                  name="bonus_amount"
                  type="number"
                  value={formData.bonus_amount?.toString() || ''}
                  onChange={handleInputChange}
                />
                <Textarea
                  label="Bonus Description"
                  name="bonus_description"
                  value={formData.bonus_description}
                  onChange={handleInputChange}
                  rows={2}
                />
              </div>

              <Textarea
                label="Equity Compensation"
                name="equity_compensation"
                value={formData.equity_compensation}
                onChange={handleInputChange}
                rows={2}
                className="mt-4"
              />

              <Textarea
                label="Benefits Summary"
                name="benefits_summary"
                value={formData.benefits_summary}
                onChange={handleInputChange}
                rows={4}
                className="mt-4"
                placeholder="Health insurance, 401(k), PTO, etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsCreateModalOpen(false);
              setIsEditModalOpen(false);
              setSelectedOffer(null);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button
              onClick={isEditModalOpen ? handleUpdate : handleCreate}
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            >
              {isEditModalOpen ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Compensation & Position Details</DialogTitle>
            <DialogDescription>
              {selectedOffer && selectedOffer.candidate
                ? `View details for ${selectedOffer.candidate.first_name} ${selectedOffer.candidate.last_name}`
                : 'View offer details'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {selectedOffer && (
              <>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Position Details</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Position Title:</span>
                      <span className="ml-2 text-gray-900 dark:text-white">{selectedOffer.position_title}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Department:</span>
                      <span className="ml-2 text-gray-900 dark:text-white">{selectedOffer.department}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Employment Type:</span>
                      <span className="ml-2 text-gray-900 dark:text-white">{selectedOffer.employment_type}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Location:</span>
                      <span className="ml-2 text-gray-900 dark:text-white">{selectedOffer.location || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Start Date:</span>
                      <span className="ml-2 text-gray-900 dark:text-white">
                        {selectedOffer.start_date ? new Date(selectedOffer.start_date).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Reporting Manager:</span>
                      <span className="ml-2 text-gray-900 dark:text-white">{selectedOffer.reporting_manager || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Compensation Details</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Base Salary:</span>
                      <span className="ml-2 text-gray-900 dark:text-white">
                        {selectedOffer.base_salary ? `$${selectedOffer.base_salary.toLocaleString()}` : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Pay Frequency:</span>
                      <span className="ml-2 text-gray-900 dark:text-white">{selectedOffer.pay_frequency || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Currency:</span>
                      <span className="ml-2 text-gray-900 dark:text-white">{selectedOffer.salary_currency}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Bonus Amount:</span>
                      <span className="ml-2 text-gray-900 dark:text-white">
                        {selectedOffer.bonus_amount ? `$${selectedOffer.bonus_amount.toLocaleString()}` : 'N/A'}
                      </span>
                    </div>
                    {selectedOffer.bonus_description && (
                      <div className="col-span-2">
                        <span className="text-gray-600 dark:text-gray-400">Bonus Description:</span>
                        <p className="mt-1 text-gray-900 dark:text-white">{selectedOffer.bonus_description}</p>
                      </div>
                    )}
                    {selectedOffer.equity_compensation && (
                      <div className="col-span-2">
                        <span className="text-gray-600 dark:text-gray-400">Equity Compensation:</span>
                        <p className="mt-1 text-gray-900 dark:text-white">{selectedOffer.equity_compensation}</p>
                      </div>
                    )}
                    {selectedOffer.benefits_summary && (
                      <div className="col-span-2">
                        <span className="text-gray-600 dark:text-gray-400">Benefits Summary:</span>
                        <p className="mt-1 text-gray-900 dark:text-white whitespace-pre-wrap">{selectedOffer.benefits_summary}</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
              Close
            </Button>
            {selectedOffer && (
              <Button
                onClick={() => {
                  setIsViewModalOpen(false);
                  openEditModal(selectedOffer);
                }}
                className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
