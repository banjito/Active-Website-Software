import { supabase } from '@/lib/supabase/client';
import { 
  Equipment, 
  EquipmentStatus, 
  Vehicle, 
  MaintenanceRecord, 
  EquipmentAssignment,
  EquipmentFilter,
  MaintenanceType,
  AssignmentStatus
} from '@/lib/interfaces/equipment';

// Equipment CRUD operations
export async function getEquipment(filter?: EquipmentFilter) {
  let query = supabase
    .from('equipment')
    .select('*');
  
  if (filter) {
    if (filter.portal) query = query.eq('portal_type', filter.portal);
    if (filter.division) query = query.eq('division', filter.division);
    if (filter.category) query = query.eq('category', filter.category);
    if (filter.status) query = query.eq('status', filter.status);
    if (filter.search) {
      query = query.or(
        `name.ilike.%${filter.search}%,description.ilike.%${filter.search}%,serial_number.ilike.%${filter.search}%,asset_tag.ilike.%${filter.search}%`
      );
    }
  }
  
  const { data, error } = await query;
  
  if (error) throw error;
  return data as Equipment[];
}

export async function getEquipmentById(id: string) {
  const { data, error } = await supabase
    .from('equipment')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) throw error;
  return data as Equipment;
}

export async function createEquipment(equipment: Omit<Equipment, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('equipment')
    .insert([equipment])
    .select();
  
  if (error) throw error;
  return data[0] as Equipment;
}

export async function updateEquipment(id: string, equipment: Partial<Equipment>) {
  const { data, error } = await supabase
    .from('equipment')
    .update(equipment)
    .eq('id', id)
    .select();
  
  if (error) throw error;
  return data[0] as Equipment;
}

export async function deleteEquipment(id: string) {
  const { error } = await supabase
    .from('equipment')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
  return true;
}

// Vehicle operations
export async function getVehicles() {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*, equipment(*)');
  
  if (error) throw error;
  return data;
}

export async function getVehicleByEquipmentId(equipmentId: string) {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('equipment_id', equipmentId)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data as Vehicle | null;
}

export async function createVehicle(vehicle: Omit<Vehicle, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('vehicles')
    .insert([vehicle])
    .select();
  
  if (error) throw error;
  return data[0] as Vehicle;
}

export async function updateVehicle(id: string, vehicle: Partial<Vehicle>) {
  const { data, error } = await supabase
    .from('vehicles')
    .update(vehicle)
    .eq('id', id)
    .select();
  
  if (error) throw error;
  return data[0] as Vehicle;
}

// Maintenance records operations
export async function getMaintenanceRecords(equipmentId: string) {
  const { data, error } = await supabase
    .from('maintenance_records')
    .select('*')
    .eq('equipment_id', equipmentId)
    .order('maintenance_date', { ascending: false });
  
  if (error) throw error;
  return data as MaintenanceRecord[];
}

export async function createMaintenanceRecord(record: Omit<MaintenanceRecord, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('maintenance_records')
    .insert([record])
    .select();
  
  if (error) throw error;
  return data[0] as MaintenanceRecord;
}

export async function updateMaintenanceRecord(id: string, record: Partial<MaintenanceRecord>) {
  const { data, error } = await supabase
    .from('maintenance_records')
    .update(record)
    .eq('id', id)
    .select();
  
  if (error) throw error;
  return data[0] as MaintenanceRecord;
}

export async function deleteMaintenanceRecord(id: string) {
  const { error } = await supabase
    .from('maintenance_records')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
  return true;
}

// Equipment assignment operations
export async function getEquipmentAssignments(equipmentId?: string, userId?: string) {
  let query = supabase
    .from('equipment_assignments')
    .select('*')
    .order('checkout_date', { ascending: false });
  
  if (equipmentId) query = query.eq('equipment_id', equipmentId);
  if (userId) query = query.eq('user_id', userId);
  
  const { data, error } = await query;
  
  if (error) throw error;
  return data as EquipmentAssignment[];
}

export async function getCurrentAssignment(equipmentId: string) {
  const { data, error } = await supabase
    .from('equipment_assignments')
    .select('*')
    .eq('equipment_id', equipmentId)
    .is('return_date', null)
    .in('status', ['checked-out', 'overdue'])
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data as EquipmentAssignment | null;
}

export async function createEquipmentAssignment(assignment: Omit<EquipmentAssignment, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('equipment_assignments')
    .insert([assignment])
    .select();
  
  if (error) throw error;
  return data[0] as EquipmentAssignment;
}

export async function updateEquipmentAssignment(id: string, assignment: Partial<EquipmentAssignment>) {
  const { data, error } = await supabase
    .from('equipment_assignments')
    .update(assignment)
    .eq('id', id)
    .select();
  
  if (error) throw error;
  return data[0] as EquipmentAssignment;
}

export async function returnEquipment(id: string, condition?: string, notes?: string) {
  const { data, error } = await supabase
    .from('equipment_assignments')
    .update({
      return_date: new Date().toISOString(),
      condition_on_return: condition,
      notes: notes,
      status: 'returned'
    })
    .eq('id', id)
    .select();
  
  if (error) throw error;
  return data[0] as EquipmentAssignment;
}

export async function getMaintenanceDue(days: number = 30) {
  const { data, error } = await supabase
    .rpc('get_maintenance_due_equipment', { days_threshold: days });
  
  if (error) throw error;
  return data;
}

export async function getEquipmentCategories() {
  const { data, error } = await supabase
    .from('equipment')
    .select('category')
    .order('category')
    .is('category', 'not.null');
  
  if (error) throw error;
  return [...new Set(data.map(item => item.category))];
}

export async function getEquipmentStatuses() {
  return ['available', 'in-use', 'maintenance', 'retired', 'lost'] as EquipmentStatus[];
}

export async function getMaintenanceTypes() {
  return ['routine', 'repair', 'inspection', 'certification', 'calibration', 'other'] as MaintenanceType[];
}

export async function getAssignmentStatuses() {
  return ['checked-out', 'returned', 'overdue', 'damaged'] as AssignmentStatus[];
}

export async function fetchEquipment(): Promise<Equipment[]> {
  const { data, error } = await supabase
    .from('equipment')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching equipment:', error);
    throw new Error(error.message);
  }

  return data || [];
}

export async function fetchEquipmentById(id: string): Promise<Equipment> {
  const { data, error } = await supabase
    .from('equipment')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching equipment by id:', error);
    throw new Error(error.message);
  }

  return data;
}

export async function createEquipment(equipment: Omit<Equipment, 'id' | 'created_at' | 'updated_at'>): Promise<Equipment> {
  const { data, error } = await supabase
    .from('equipment')
    .insert([equipment])
    .select()
    .single();

  if (error) {
    console.error('Error creating equipment:', error);
    throw new Error(error.message);
  }

  return data;
}

export async function updateEquipment(id: string, equipment: Partial<Equipment>): Promise<Equipment> {
  const { data, error } = await supabase
    .from('equipment')
    .update({
      ...equipment,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating equipment:', error);
    throw new Error(error.message);
  }

  return data;
}

export async function deleteEquipment(id: string): Promise<void> {
  const { error } = await supabase
    .from('equipment')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting equipment:', error);
    throw new Error(error.message);
  }
}

export async function assignEquipment(
  equipment_id: string, 
  assignment: {
    technician_id: string;
    start_date: string;
    end_date: string | null;
    notes: string;
  }
): Promise<void> {
  // First, check if there are any active assignments for this equipment
  const { data: activeAssignments, error: checkError } = await supabase
    .from('equipment_assignments')
    .select('*')
    .eq('equipment_id', equipment_id)
    .is('end_date', null);

  if (checkError) {
    console.error('Error checking active assignments:', checkError);
    throw new Error(checkError.message);
  }

  // If there are active assignments, end them
  if (activeAssignments && activeAssignments.length > 0) {
    const { error: updateError } = await supabase
      .from('equipment_assignments')
      .update({ end_date: new Date().toISOString().split('T')[0] })
      .eq('equipment_id', equipment_id)
      .is('end_date', null);

    if (updateError) {
      console.error('Error ending active assignments:', updateError);
      throw new Error(updateError.message);
    }
  }

  // Create the new assignment
  const { error: insertError } = await supabase
    .from('equipment_assignments')
    .insert([{
      equipment_id,
      technician_id: assignment.technician_id,
      start_date: assignment.start_date,
      end_date: assignment.end_date,
      notes: assignment.notes
    }]);

  if (insertError) {
    console.error('Error creating equipment assignment:', insertError);
    throw new Error(insertError.message);
  }
  
  // Update equipment status to "assigned"
  const { error: statusError } = await supabase
    .from('equipment')
    .update({ 
      status: 'assigned',
      updated_at: new Date().toISOString()
    })
    .eq('id', equipment_id);

  if (statusError) {
    console.error('Error updating equipment status:', statusError);
    throw new Error(statusError.message);
  }
}

export async function fetchEquipmentAssignments(equipment_id: string): Promise<EquipmentAssignment[]> {
  const { data, error } = await supabase
    .from('equipment_assignments')
    .select(`
      *,
      technician:technician_id(id, first_name, last_name, email)
    `)
    .eq('equipment_id', equipment_id)
    .order('start_date', { ascending: false });

  if (error) {
    console.error('Error fetching equipment assignments:', error);
    throw new Error(error.message);
  }

  return data || [];
}

export async function endAssignment(assignment_id: string): Promise<void> {
  // Get the assignment to find the equipment_id
  const { data: assignment, error: fetchError } = await supabase
    .from('equipment_assignments')
    .select('equipment_id')
    .eq('id', assignment_id)
    .single();

  if (fetchError) {
    console.error('Error fetching assignment:', fetchError);
    throw new Error(fetchError.message);
  }

  // End the assignment
  const { error: updateError } = await supabase
    .from('equipment_assignments')
    .update({ end_date: new Date().toISOString().split('T')[0] })
    .eq('id', assignment_id);

  if (updateError) {
    console.error('Error ending assignment:', updateError);
    throw new Error(updateError.message);
  }

  // Update equipment status to "available"
  const { error: statusError } = await supabase
    .from('equipment')
    .update({ 
      status: 'available',
      updated_at: new Date().toISOString()
    })
    .eq('id', assignment.equipment_id);

  if (statusError) {
    console.error('Error updating equipment status:', statusError);
    throw new Error(statusError.message);
  }
} 