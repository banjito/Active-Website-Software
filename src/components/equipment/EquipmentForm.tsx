import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Equipment } from '@/lib/interfaces/equipment';
import { createEquipment, updateEquipment } from '@/lib/services/equipment';
import { toast } from '@/components/ui/toast';
import { DatePicker } from '@/components/ui/DatePicker';

interface EquipmentFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  equipment?: Equipment;
}

export default function EquipmentForm({ isOpen, onClose, onSave, equipment }: EquipmentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    category: 'Equipment',
    description: '',
    serial_number: '',
    asset_tag: '',
    acquisition_date: '',
    acquisition_cost: '',
    estimated_life_months: '',
    manufacturer: '',
    model: '',
    status: 'Available',
    condition: 'Excellent',
    notes: '',
    last_maintenance: '',
    next_maintenance: '',
  });

  useEffect(() => {
    if (equipment) {
      setForm({
        name: equipment.name || '',
        category: equipment.category || 'Equipment',
        description: equipment.description || '',
        serial_number: equipment.serial_number || '',
        asset_tag: equipment.asset_tag || '',
        acquisition_date: equipment.acquisition_date || '',
        acquisition_cost: equipment.acquisition_cost?.toString() || '',
        estimated_life_months: equipment.estimated_life_months?.toString() || '',
        manufacturer: equipment.manufacturer || '',
        model: equipment.model || '',
        status: equipment.status || 'Available',
        condition: equipment.condition || 'Excellent',
        notes: equipment.notes || '',
        last_maintenance: equipment.last_maintenance || '',
        next_maintenance: equipment.next_maintenance || '',
      });
    }
  }, [equipment]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleDateChange = (name: string, date: string | null) => {
    setForm(prev => ({ ...prev, [name]: date || '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const formData = {
        ...form,
        acquisition_cost: form.acquisition_cost ? parseFloat(form.acquisition_cost) : null,
        estimated_life_months: form.estimated_life_months ? parseInt(form.estimated_life_months) : null,
      };
      
      if (equipment) {
        await updateEquipment(equipment.id, formData);
        toast({
          title: 'Success',
          description: 'Equipment updated successfully',
          variant: 'success',
        });
      } else {
        await createEquipment(formData);
        toast({
          title: 'Success',
          description: 'Equipment added successfully',
          variant: 'success',
        });
      }
      
      onSave();
    } catch (error) {
      console.error('Error saving equipment:', error);
      toast({
        title: 'Error',
        description: 'Failed to save equipment',
        variant: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const categoryOptions = [
    { value: 'Equipment', label: 'Equipment' },
    { value: 'Vehicle', label: 'Vehicle' },
    { value: 'Tool', label: 'Tool' },
    { value: 'Safety', label: 'Safety' },
    { value: 'Other', label: 'Other' },
  ];

  const statusOptions = [
    { value: 'Available', label: 'Available' },
    { value: 'In Use', label: 'In Use' },
    { value: 'Under Maintenance', label: 'Under Maintenance' },
    { value: 'Out of Service', label: 'Out of Service' },
  ];

  const conditionOptions = [
    { value: 'Excellent', label: 'Excellent' },
    { value: 'Good', label: 'Good' },
    { value: 'Fair', label: 'Fair' },
    { value: 'Poor', label: 'Poor' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{equipment ? 'Edit Equipment' : 'Add New Equipment'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Name*"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
            />
            
            <Select
              label="Category*"
              name="category"
              value={form.category}
              onChange={handleChange}
              options={categoryOptions}
              required
            />
          </div>
          
          <Textarea
            label="Description"
            name="description"
            value={form.description}
            onChange={handleChange}
          />
          
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Serial Number"
              name="serial_number"
              value={form.serial_number}
              onChange={handleChange}
            />
            
            <Input
              label="Asset Tag"
              name="asset_tag"
              value={form.asset_tag}
              onChange={handleChange}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <DatePicker
              label="Acquisition Date"
              value={form.acquisition_date}
              onChange={(date) => handleDateChange('acquisition_date', date)}
            />
            
            <Input
              label="Acquisition Cost ($)"
              name="acquisition_cost"
              type="number"
              step="0.01"
              value={form.acquisition_cost}
              onChange={handleChange}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Manufacturer"
              name="manufacturer"
              value={form.manufacturer}
              onChange={handleChange}
            />
            
            <Input
              label="Model"
              name="model"
              value={form.model}
              onChange={handleChange}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Estimated Life (months)"
              name="estimated_life_months"
              type="number"
              value={form.estimated_life_months}
              onChange={handleChange}
            />
            
            <Select
              label="Condition*"
              name="condition"
              value={form.condition}
              onChange={handleChange}
              options={conditionOptions}
              required
            />
          </div>
          
          <Select
            label="Status*"
            name="status"
            value={form.status}
            onChange={handleChange}
            options={statusOptions}
            required
          />
          
          <div className="grid grid-cols-2 gap-4">
            <DatePicker
              label="Last Maintenance Date"
              value={form.last_maintenance}
              onChange={(date) => handleDateChange('last_maintenance', date)}
            />
            
            <DatePicker
              label="Next Maintenance Date"
              value={form.next_maintenance}
              onChange={(date) => handleDateChange('next_maintenance', date)}
            />
          </div>
          
          <Textarea
            label="Notes"
            name="notes"
            value={form.notes}
            onChange={handleChange}
          />
          
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : equipment ? 'Update Equipment' : 'Add Equipment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
} 