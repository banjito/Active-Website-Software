import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { Plus, Save, Edit, Trash2, Truck, MapPin, RotateCcw, Wrench } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { SCHEMAS } from '@/lib/schema';

interface VehicleTrackingProps {
  division: string;
}

interface Vehicle {
  id: string;
  name: string;
  type: string;
  status: 'available' | 'assigned' | 'maintenance' | 'out-of-service';
  license_plate: string;
  vin: string;
  year: string;
  make: string;
  model: string;
  current_location?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  notes?: string;
  last_maintenance_date?: string;
  next_maintenance_date?: string;
  created_at: string;
  updated_at: string;
}

interface VehicleForm extends Omit<Vehicle, 'id' | 'created_at' | 'updated_at'> {}

const vehicleTypes = [
  { value: 'truck', label: 'Truck' },
  { value: 'van', label: 'Van' },
  { value: 'suv', label: 'SUV' },
  { value: 'car', label: 'Car' },
  { value: 'utility', label: 'Utility Vehicle' },
  { value: 'specialized', label: 'Specialized Equipment' }
];

const statusOptions = [
  { value: 'available', label: 'Available' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'maintenance', label: 'In Maintenance' },
  { value: 'out-of-service', label: 'Out of Service' }
];

export function VehicleTracking({ division }: VehicleTrackingProps) {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [technicians, setTechnicians] = useState<{ id: string, name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  
  const defaultFormState: VehicleForm = {
    name: '',
    type: 'truck',
    status: 'available',
    license_plate: '',
    vin: '',
    year: '',
    make: '',
    model: '',
    current_location: '',
    assigned_to: '',
    notes: '',
    last_maintenance_date: '',
    next_maintenance_date: ''
  };
  
  const [form, setForm] = useState<VehicleForm>(defaultFormState);

  // Fetch vehicles
  useEffect(() => {
    const fetchVehicles = async () => {
      setIsLoading(true);
      try {
        // First, check if the vehicles table exists
        const { error: checkError } = await supabase.rpc('check_table_exists', {
          table_name: 'neta_ops.vehicles'
        });
        
        if (checkError) {
          // Table might not exist, create it
          await setupVehiclesTable();
        }
        
        // Now fetch vehicles
        const { data, error } = await supabase
          .from('neta_ops.vehicles')
          .select(`
            *,
            assigned_to_name:assigned_to(raw_user_meta_data->>'name')
          `)
          .eq('division', division)
          .order('name');
          
        if (error) {
          console.error("Error fetching vehicles:", error);
          setError("Failed to load vehicles. Please try again.");
        } else {
          setVehicles((data || []) as unknown as Vehicle[]);
        }
      } catch (err) {
        console.error("Exception fetching vehicles:", err);
        setError("An unexpected error occurred while loading vehicles.");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchVehicles();
    fetchTechnicians();
  }, [division]);
  
  // Setup vehicles table if it doesn't exist
  const setupVehiclesTable = async () => {
    try {
      // Try to create the table if it doesn't exist
      await supabase.rpc('create_vehicles_table');
      console.log("Vehicles table created or already exists");
    } catch (err) {
      console.error("Error setting up vehicles table:", err);
      setError("Failed to set up the vehicles tracking system. Please contact an administrator.");
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
  
  // Save vehicle
  const handleSaveVehicle = async () => {
    setIsLoading(true);
    try {
      // Add division to the form data
      const vehicleData = {
        ...form,
        division
      };
      
      if (editingVehicleId) {
        // Update existing vehicle
        const { error } = await supabase
          .from('neta_ops.vehicles')
          .update(vehicleData)
          .eq('id', editingVehicleId);
          
        if (error) {
          throw error;
        }
      } else {
        // Create new vehicle
        const { error } = await supabase
          .from('neta_ops.vehicles')
          .insert(vehicleData);
          
        if (error) {
          throw error;
        }
      }
      
      // Refresh the vehicles list
      const { data, error } = await supabase
        .from('neta_ops.vehicles')
        .select(`
          *,
          assigned_to_name:assigned_to(raw_user_meta_data->>'name')
        `)
        .eq('division', division)
        .order('name');
        
      if (error) {
        throw error;
      }
      
      setVehicles((data || []) as unknown as Vehicle[]);
      setShowForm(false);
      setEditingVehicleId(null);
      setForm(defaultFormState);
    } catch (err) {
      console.error("Error saving vehicle:", err);
      setError("Failed to save vehicle. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };
  
  // Delete vehicle
  const handleDeleteVehicle = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this vehicle?')) {
      return;
    }
    
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('neta_ops.vehicles')
        .delete()
        .eq('id', id);
        
      if (error) {
        throw error;
      }
      
      // Remove from state
      setVehicles(vehicles.filter(v => v.id !== id));
    } catch (err) {
      console.error("Error deleting vehicle:", err);
      setError("Failed to delete vehicle. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };
  
  // Edit vehicle
  const handleEditVehicle = (vehicle: Vehicle) => {
    setForm({
      name: vehicle.name,
      type: vehicle.type,
      status: vehicle.status,
      license_plate: vehicle.license_plate,
      vin: vehicle.vin,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      current_location: vehicle.current_location || '',
      assigned_to: vehicle.assigned_to || '',
      notes: vehicle.notes || '',
      last_maintenance_date: vehicle.last_maintenance_date || '',
      next_maintenance_date: vehicle.next_maintenance_date || ''
    });
    setEditingVehicleId(vehicle.id);
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
  
  return (
    <div className="container mx-auto px-4 space-y-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between p-6">
          <CardTitle className="text-xl font-bold">Vehicle Tracking</CardTitle>
          <Button
            onClick={() => {
              setShowForm(true);
              setEditingVehicleId(null);
              setForm(defaultFormState);
            }}
            disabled={isLoading}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Vehicle
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
                  {editingVehicleId ? 'Edit Vehicle' : 'Add New Vehicle'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Vehicle Name
                    </label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Vehicle identifier"
                      className="w-full"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Vehicle Type
                    </label>
                    <Select
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value })}
                      options={vehicleTypes}
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
                      License Plate
                    </label>
                    <Input
                      value={form.license_plate}
                      onChange={(e) => setForm({ ...form, license_plate: e.target.value })}
                      placeholder="License plate number"
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      VIN
                    </label>
                    <Input
                      value={form.vin}
                      onChange={(e) => setForm({ ...form, vin: e.target.value })}
                      placeholder="Vehicle identification number"
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Year
                    </label>
                    <Input
                      value={form.year}
                      onChange={(e) => setForm({ ...form, year: e.target.value })}
                      placeholder="Year of manufacture"
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Make
                    </label>
                    <Input
                      value={form.make}
                      onChange={(e) => setForm({ ...form, make: e.target.value })}
                      placeholder="Manufacturer"
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
                      placeholder="Vehicle model"
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
                      setEditingVehicleId(null);
                    }}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveVehicle}
                    disabled={isLoading || !form.name}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {editingVehicleId ? 'Update Vehicle' : 'Save Vehicle'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          
          <div className="space-y-4">
            {isLoading ? (
              <p>Loading vehicles...</p>
            ) : vehicles.length === 0 ? (
              <div className="text-center p-8 bg-gray-50 rounded-md">
                <Truck className="h-12 w-12 mx-auto text-gray-400 mb-2" />
                <h3 className="text-lg font-medium mb-1">No Vehicles Added</h3>
                <p className="text-gray-600 mb-4">
                  Start tracking your division's vehicles by adding them to the system.
                </p>
                <Button
                  onClick={() => {
                    setShowForm(true);
                    setEditingVehicleId(null);
                    setForm(defaultFormState);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add First Vehicle
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {vehicles.map((vehicle) => (
                  <Card key={vehicle.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex justify-between">
                        <div className="flex items-start space-x-3">
                          <div className="p-2 bg-gray-100 rounded-full">
                            <Truck className="h-6 w-6 text-gray-600" />
                          </div>
                          <div>
                            <h3 className="font-medium text-lg">{vehicle.name}</h3>
                            <p className="text-sm text-gray-600">
                              {vehicle.year} {vehicle.make} {vehicle.model}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Badge className={getStatusColor(vehicle.status)}>
                                {vehicle.status.charAt(0).toUpperCase() + vehicle.status.slice(1)}
                              </Badge>
                              <Badge className="bg-gray-100 text-gray-800">
                                {vehicle.type.charAt(0).toUpperCase() + vehicle.type.slice(1)}
                              </Badge>
                              {vehicle.license_plate && (
                                <Badge className="bg-blue-50 text-blue-800">
                                  {vehicle.license_plate}
                                </Badge>
                              )}
                            </div>
                            
                            {vehicle.current_location && (
                              <div className="mt-2 flex items-center text-sm text-gray-600">
                                <MapPin className="h-4 w-4 mr-1" />
                                <span>{vehicle.current_location}</span>
                              </div>
                            )}
                            
                            {vehicle.assigned_to_name && (
                              <div className="mt-1 flex items-center text-sm text-gray-600">
                                <span className="font-medium">Assigned to:</span>
                                <span className="ml-1">{vehicle.assigned_to_name}</span>
                              </div>
                            )}
                            
                            {vehicle.next_maintenance_date && (
                              <div className="mt-1 flex items-center text-sm text-gray-600">
                                <Wrench className="h-4 w-4 mr-1" />
                                <span>
                                  Next maintenance: {new Date(vehicle.next_maintenance_date).toLocaleDateString()}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditVehicle(vehicle)}
                            className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteVehicle(vehicle.id)}
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