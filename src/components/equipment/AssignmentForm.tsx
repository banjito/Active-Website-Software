import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { DatePicker } from '@/components/ui/DatePicker';
import { Equipment } from '@/lib/interfaces/equipment';
import { toast } from '@/components/ui/toast';
import { assignEquipment } from '@/lib/services/equipment';
import { User } from '@/lib/interfaces/user';
import { fetchTechnicians } from '@/lib/services/users';

interface AssignmentFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  equipment: Equipment;
}

export default function AssignmentForm({ isOpen, onClose, onSave, equipment }: AssignmentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [form, setForm] = useState({
    technician_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    notes: '',
  });

  useEffect(() => {
    const loadTechnicians = async () => {
      try {
        const techs = await fetchTechnicians();
        setTechnicians(techs);
      } catch (error) {
        console.error('Error loading technicians:', error);
        toast({
          title: 'Error',
          description: 'Failed to load technicians',
          variant: 'error',
        });
      }
    };
    
    loadTechnicians();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLSelectElement>) => {
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
      if (!form.technician_id) {
        throw new Error('Please select a technician');
      }
      
      await assignEquipment(equipment.id, {
        technician_id: form.technician_id,
        start_date: form.start_date,
        end_date: form.end_date || null,
        notes: form.notes,
      });
      
      toast({
        title: 'Success',
        description: 'Equipment assigned successfully',
        variant: 'success',
      });
      
      onSave();
    } catch (error) {
      console.error('Error assigning equipment:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to assign equipment',
        variant: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Equipment</DialogTitle>
        </DialogHeader>
        
        <div className="mb-4">
          <p><strong>Equipment:</strong> {equipment.name}</p>
          {equipment.asset_tag && <p><strong>Asset Tag:</strong> {equipment.asset_tag}</p>}
          {equipment.serial_number && <p><strong>Serial Number:</strong> {equipment.serial_number}</p>}
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="Assign to Technician*"
            name="technician_id"
            value={form.technician_id}
            onChange={handleChange}
            options={technicians.map(tech => ({
              value: tech.id,
              label: `${tech.first_name} ${tech.last_name}`
            }))}
            required
          />
          
          <div className="grid grid-cols-2 gap-4">
            <DatePicker
              label="Start Date*"
              value={form.start_date}
              onChange={(date) => handleDateChange('start_date', date)}
              required
            />
            
            <DatePicker
              label="End Date (Optional)"
              value={form.end_date}
              onChange={(date) => handleDateChange('end_date', date)}
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
              {isSubmitting ? 'Assigning...' : 'Assign Equipment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
} 