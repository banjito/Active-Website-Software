import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { 
  Plus, 
  Save, 
  Edit, 
  Trash2, 
  Hammer, 
  MapPin, 
  RotateCcw, 
  Wrench,
  AlertTriangle,
  BarChart 
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { SCHEMAS } from '@/lib/schema';

interface EquipmentTrackingProps {
  division: string;
}

interface Equipment {
  id: string;
  name: string;
  category: string;
  status: 'available' | 'assigned' | 'maintenance' | 'out-of-service';
  serial_number: string;
  model: string;
  manufacturer: string;
  purchase_date?: string;
  purchase_price?: number;
  warranty_expiration?: string;
  current_location?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  notes?: string;
  last_calibration_date?: string;
  next_calibration_date?: string;
  last_maintenance_date?: string;
  next_maintenance_date?: string;
  division: string;
  created_at: string;
  updated_at: string;
}

interface EquipmentForm extends Omit<Equipment, 'id' | 'created_at' | 'updated_at' | 'division'> {}

const equipmentCategories = [
  { value: 'testing', label: 'Testing Equipment' },
  { value: 'metering', label: 'Metering Devices' },
  { value: 'safety', label: 'Safety Equipment' },
  { value: 'tools', label: 'Specialized Tools' },
  { value: 'network', label: 'Network Equipment' },
  { value: 'electrical', label: 'Electrical Equipment' },
  { value: 'computing', label: 'Computer/IT' },
  { value: 'other', label: 'Other' }
];

const statusOptions = [
  { value: 'available', label: 'Available' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'maintenance', label: 'In Maintenance' },
  { value: 'out-of-service', label: 'Out of Service' }
];

export function EquipmentTracking({ division }: EquipmentTrackingProps) {
  const { user } = useAuth();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [technicians, setTechnicians] = useState<{ id: string, name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(null);
  
  const defaultFormState: EquipmentForm = {
    name: '',
    category: 'testing',
    status: 'available',
    serial_number: '',
    model: '',
    manufacturer: '',
    purchase_date: '',
    purchase_price: undefined,
    warranty_expiration: '',
    current_location: '',
    assigned_to: '',
    notes: '',
    last_calibration_date: '',
    next_calibration_date: '',
    last_maintenance_date: '',
    next_maintenance_date: ''
  };
  
  const [form, setForm] = useState<EquipmentForm>(defaultFormState);

  // Fetch equipment
  useEffect(() => {
    const fetchEquipment = async () => {
      setIsLoading(true);
      try {
        // First, check if the equipment table exists
        const { error: checkError } = await supabase.rpc('check_table_exists', {
          table_name: 'neta_ops.equipment'
        });
        
        if (checkError) {
          // Table might not exist, create it
          await setupEquipmentTable();
        }
        
        // Now fetch equipment
        const { data, error } = await supabase
          .from('neta_ops.equipment')
          .select(`
            *,
            assigned_to_name:assigned_to(raw_user_meta_data->>'name')
          `)
          .eq('division', division)
          .order('name');
          
        if (error) {
          console.error("Error fetching equipment:", error);
          setError("Failed to load equipment. Please try again.");
        } else {
          setEquipment((data || []) as unknown as Equipment[]);
        }
      } catch (err) {
        console.error("Exception fetching equipment:", err);
        setError("An unexpected error occurred while loading equipment.");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchEquipment();
    fetchTechnicians();
  }, [division]);
  
  // Setup equipment table if it doesn't exist
  const setupEquipmentTable = async () => {
    try {
      // Try to create the table if it doesn't exist
      await supabase.rpc('create_equipment_table');
      console.log("Equipment table created or already exists");
    } catch (err) {
      console.error("Error setting up equipment table:", err);
      setError("Failed to set up the equipment tracking system. Please contact an administrator.");
    }
  };
  
  // Fetch technicians for the dropdown
  const fetchTechnicians = async () => {
    try {
      const { data, error } = await supabase
        .from('auth.users')
        .select('id, raw_user_meta_data->name')
        .eq('raw_user_meta_data->>role', 'NETA Technician')
        .eq('raw_user_meta_data->>division', division)
        .order('raw_user_meta_data->>name');
      
      if (error) {
        // Try an alternative approach
        const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
        
        if (userError) {
          console.error("Error fetching technicians:", userError);
          return;
        }
        
        // Filter for technicians in this division
        const divisionTechs = userData.users
          .filter(u => 
            u.user_metadata?.role === 'NETA Technician' && 
            u.user_metadata?.division === division
          )
          .map(u => ({
            id: u.id,
            name: u.user_metadata?.name || 'Unknown'
          }));
          
        setTechnicians(divisionTechs);
      } else {
        // Format the data
        const techs = (data || []).map(t => ({
          id: t.id,
          name: (t.name as string) || 'Unknown'
        }));
        setTechnicians(techs);
      }
    } catch (err) {
      console.error("Exception fetching technicians:", err);
    }
  };
  
  // Save equipment
  const handleSaveEquipment = async () => {
    setIsLoading(true);
    try {
      // Add division to the form data
      const equipmentData = {
        ...form,
        division
      };
      
      if (editingEquipmentId) {
        // Update existing equipment
        const { error } = await supabase
          .from('neta_ops.equipment')
          .update(equipmentData)
          .eq('id', editingEquipmentId);
          
        if (error) {
          throw error;
        }
      } else {
        // Create new equipment
        const { error } = await supabase
          .from('neta_ops.equipment')
          .insert(equipmentData);
          
        if (error) {
          throw error;
        }
      }
      
      // Refresh the equipment list
      const { data, error } = await supabase
        .from('neta_ops.equipment')
        .select(`
          *,
          assigned_to_name:assigned_to(raw_user_meta_data->>'name')
        `)
        .eq('division', division)
        .order('name');
        
      if (error) {
        throw error;
      }
      
      setEquipment((data || []) as unknown as Equipment[]);
      setShowForm(false);
      setEditingEquipmentId(null);
      setForm(defaultFormState);
    } catch (err) {
      console.error("Error saving equipment:", err);
      setError("Failed to save equipment. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };
  
  // Delete equipment
  const handleDeleteEquipment = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this equipment?')) {
      return;
    }
    
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('neta_ops.equipment')
        .delete()
        .eq('id', id);
        
      if (error) {
        throw error;
      }
      
      // Remove from state
      setEquipment(equipment.filter(e => e.id !== id));
    } catch (err) {
      console.error("Error deleting equipment:", err);
      setError("Failed to delete equipment. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };
  
  // Edit equipment
  const handleEditEquipment = (item: Equipment) => {
    setForm({
      name: item.name,
      category: item.category,
      status: item.status,
      serial_number: item.serial_number,
      model: item.model,
      manufacturer: item.manufacturer,
      purchase_date: item.purchase_date || '',
      purchase_price: item.purchase_price,
      warranty_expiration: item.warranty_expiration || '',
      current_location: item.current_location || '',
      assigned_to: item.assigned_to || '',
      notes: item.notes || '',
      last_calibration_date: item.last_calibration_date || '',
      next_calibration_date: item.next_calibration_date || '',
      last_maintenance_date: item.last_maintenance_date || '',
      next_maintenance_date: item.next_maintenance_date || ''
    });
    setEditingEquipmentId(item.id);
    setShowForm(true);
  };
  
  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-800';
      case 'assigned':
        return 'bg-blue-100 text-blue-800';
      case 'maintenance':
        return 'bg-amber-100 text-amber-800';
      case 'out-of-service':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  // Get category badge color
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'testing':
        return 'bg-purple-100 text-purple-800';
      case 'metering':
        return 'bg-indigo-100 text-indigo-800';
      case 'safety':
        return 'bg-orange-100 text-orange-800';
      case 'tools':
        return 'bg-blue-100 text-blue-800';
      case 'network':
        return 'bg-teal-100 text-teal-800';
      case 'electrical':
        return 'bg-amber-100 text-amber-800';
      case 'computing':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  // Check if calibration/maintenance is due
  const isDue = (dueDate?: string): boolean => {
    if (!dueDate) return false;
    const today = new Date();
    const due = new Date(dueDate);
    return due <= today;
  };
  
  // Check if calibration/maintenance is coming up soon
  const isUpcoming = (dueDate?: string): boolean => {
    if (!dueDate) return false;
    const today = new Date();
    const due = new Date(dueDate);
    const daysUntilDue = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilDue <= 30 && daysUntilDue > 0;
  };
  
  return (
    <div className="container mx-auto px-4 space-y-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between p-6">
          <CardTitle className="text-xl font-bold">Equipment Tracking</CardTitle>
          <Button
            onClick={() => {
              setShowForm(true);
              setEditingEquipmentId(null);
              setForm(defaultFormState);
            }}
            disabled={isLoading}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Equipment
          </Button>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-4 bg-red-100 text-red-800 rounded-md">
              {error}
              <button className="ml-2 text-red-600" onClick={() => setError(null)}>Dismiss</button>
            </div>
          )}
          
          {showForm && (
            <Card className="mb-6 border-2 border-blue-200">
              <CardHeader>
                <CardTitle className="text-md">
                  {editingEquipmentId ? 'Edit Equipment' : 'Add New Equipment'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Equipment Name
                    </label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Equipment identifier"
                      className="w-full"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Category
                    </label>
                    <Select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      options={equipmentCategories}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Status
                    </label>
                    <Select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                      options={statusOptions}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Serial Number
                    </label>
                    <Input
                      value={form.serial_number}
                      onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                      placeholder="Serial number"
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Model
                    </label>
                    <Input
                      value={form.model}
                      onChange={(e) => setForm({ ...form, model: e.target.value })}
                      placeholder="Equipment model"
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Manufacturer
                    </label>
                    <Input
                      value={form.manufacturer}
                      onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                      placeholder="Manufacturer name"
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Purchase Date
                    </label>
                    <Input
                      type="date"
                      value={form.purchase_date || ''}
                      onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Purchase Price
                    </label>
                    <Input
                      type="number"
                      value={form.purchase_price || ''}
                      onChange={(e) => setForm({ ...form, purchase_price: e.target.value ? parseFloat(e.target.value) : undefined })}
                      placeholder="Cost"
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Warranty Expiration
                    </label>
                    <Input
                      type="date"
                      value={form.warranty_expiration || ''}
                      onChange={(e) => setForm({ ...form, warranty_expiration: e.target.value })}
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Current Location
                    </label>
                    <Input
                      value={form.current_location || ''}
                      onChange={(e) => setForm({ ...form, current_location: e.target.value })}
                      placeholder="Current location"
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Assigned To
                    </label>
                    <Select
                      value={form.assigned_to || ''}
                      onChange={(e) => setForm({ ...form, assigned_to: e.target.value || undefined })}
                      options={[
                        { value: '', label: 'Not Assigned' },
                        ...technicians.map(tech => ({ value: tech.id, label: tech.name }))
                      ]}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Last Calibration
                    </label>
                    <Input
                      type="date"
                      value={form.last_calibration_date || ''}
                      onChange={(e) => setForm({ ...form, last_calibration_date: e.target.value })}
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Next Calibration Due
                    </label>
                    <Input
                      type="date"
                      value={form.next_calibration_date || ''}
                      onChange={(e) => setForm({ ...form, next_calibration_date: e.target.value })}
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Last Maintenance
                    </label>
                    <Input
                      type="date"
                      value={form.last_maintenance_date || ''}
                      onChange={(e) => setForm({ ...form, last_maintenance_date: e.target.value })}
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Next Maintenance Due
                    </label>
                    <Input
                      type="date"
                      value={form.next_maintenance_date || ''}
                      onChange={(e) => setForm({ ...form, next_maintenance_date: e.target.value })}
                      className="w-full"
                    />
                  </div>
                  
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={form.notes || ''}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      placeholder="Maintenance history, issues, etc."
                      className="w-full p-2 border rounded-md dark:bg-gray-800 dark:border-gray-700 min-h-[100px]"
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowForm(false);
                      setEditingEquipmentId(null);
                    }}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveEquipment}
                    disabled={isLoading || !form.name}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {editingEquipmentId ? 'Update Equipment' : 'Save Equipment'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          
          <div className="space-y-4">
            {isLoading ? (
              <p>Loading equipment...</p>
            ) : equipment.length === 0 ? (
              <div className="text-center p-8 bg-gray-50 rounded-md">
                <Hammer className="h-12 w-12 mx-auto text-gray-400 mb-2" />
                <h3 className="text-lg font-medium mb-1">No Equipment Added</h3>
                <p className="text-gray-600 mb-4">
                  Start tracking your division's equipment by adding items to the system.
                </p>
                <Button
                  onClick={() => {
                    setShowForm(true);
                    setEditingEquipmentId(null);
                    setForm(defaultFormState);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add First Equipment
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {equipment.map((item) => (
                  <Card key={item.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex justify-between">
                        <div className="flex items-start space-x-3">
                          <div className="p-2 bg-gray-100 rounded-full">
                            <Hammer className="h-6 w-6 text-gray-600" />
                          </div>
                          <div>
                            <h3 className="font-medium text-lg">{item.name}</h3>
                            <p className="text-sm text-gray-600">
                              {item.manufacturer} {item.model}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Badge className={getStatusColor(item.status)}>
                                {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                              </Badge>
                              <Badge className={getCategoryColor(item.category)}>
                                {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
                              </Badge>
                              {item.serial_number && (
                                <Badge className="bg-blue-50 text-blue-800">
                                  SN: {item.serial_number}
                                </Badge>
                              )}
                            </div>
                            
                            {item.current_location && (
                              <div className="mt-2 flex items-center text-sm text-gray-600">
                                <MapPin className="h-4 w-4 mr-1" />
                                <span>{item.current_location}</span>
                              </div>
                            )}
                            
                            {item.assigned_to_name && (
                              <div className="mt-1 flex items-center text-sm text-gray-600">
                                <span className="font-medium">Assigned to:</span>
                                <span className="ml-1">{item.assigned_to_name}</span>
                              </div>
                            )}
                            
                            {/* Equipment alerts */}
                            {(isDue(item.next_calibration_date) || isUpcoming(item.next_calibration_date)) && (
                              <div className={`mt-1 flex items-center text-sm ${
                                isDue(item.next_calibration_date) ? 'text-red-600' : 'text-amber-600'
                              }`}>
                                <AlertTriangle className="h-4 w-4 mr-1" />
                                <span>
                                  {isDue(item.next_calibration_date) 
                                    ? 'Calibration overdue' 
                                    : 'Calibration due soon'}: {new Date(item.next_calibration_date!).toLocaleDateString()}
                                </span>
                              </div>
                            )}
                            
                            {(isDue(item.next_maintenance_date) || isUpcoming(item.next_maintenance_date)) && (
                              <div className={`mt-1 flex items-center text-sm ${
                                isDue(item.next_maintenance_date) ? 'text-red-600' : 'text-amber-600'
                              }`}>
                                <Wrench className="h-4 w-4 mr-1" />
                                <span>
                                  {isDue(item.next_maintenance_date) 
                                    ? 'Maintenance overdue' 
                                    : 'Maintenance due soon'}: {new Date(item.next_maintenance_date!).toLocaleDateString()}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditEquipment(item)}
                            className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteEquipment(item.id)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 