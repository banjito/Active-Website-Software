import { supabase } from '@/lib/supabase/client';
import { 
  Equipment,
  Vehicle,
  MaintenanceRecord,
  EquipmentAssignment,
  EquipmentFilter,
  EquipmentFilters
} from '../interfaces/equipment';

/**
 * Service for managing equipment and vehicles
 */
export const equipmentService = {
  /**
   * Get all equipment with optional filters
   */
  getAllEquipment: async (filters?: EquipmentFilter | EquipmentFilters) => {
    let query = supabase
      .from('equipment')
      .select(`
        *,
        assignedTo:assigned_to(id, email, user_metadata)
      `);
    
    if (filters) {
      // Handle filters from both interfaces
      if ('portal' in filters && filters.portal) {
        query = query.eq('portal_type', filters.portal);
      } else if ('portalType' in (filters as any) && (filters as any).portalType) {
        query = query.eq('portal_type', (filters as any).portalType);
      }
      
      if ('division' in filters && filters.division) {
        query = query.eq('division', filters.division);
      }
      
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      
      if ('search' in filters && filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,description.ilike.%${filters.search}%,serial_number.ilike.%${filters.search}%,asset_tag.ilike.%${filters.search}%`
        );
      } else if ('searchTerm' in (filters as EquipmentFilters) && (filters as EquipmentFilters).searchTerm) {
        query = query.or(
          `name.ilike.%${(filters as EquipmentFilters).searchTerm}%,description.ilike.%${(filters as EquipmentFilters).searchTerm}%,serial_number.ilike.%${(filters as EquipmentFilters).searchTerm}%,asset_tag.ilike.%${(filters as EquipmentFilters).searchTerm}%`
        );
      }
      
      if ('type' in (filters as EquipmentFilters) && (filters as EquipmentFilters).type) {
        query = query.eq('type', (filters as EquipmentFilters).type);
      }
    }
    
    const { data, error } = await query;
    
    return { data, error };
  },
  
  /**
   * Get equipment by ID
   */
  getEquipmentById: async (id: string) => {
    const { data, error } = await supabase
      .from('equipment')
      .select(`
        *,
        assignedTo:assigned_to(id, email, user_metadata)
      `)
      .eq('id', id)
      .single();
    
    return { data, error };
  },
  
  /**
   * Create new equipment
   */
  createEquipment: async (equipment: Omit<Equipment, 'id' | 'created_at' | 'updated_at'>) => {
    const { data, error } = await supabase
      .from('equipment')
      .insert(equipment)
      .select()
      .single();
    
    return { data, error };
  },
  
  /**
   * Update existing equipment
   */
  updateEquipment: async (id: string, updates: Partial<Omit<Equipment, 'id' | 'created_at' | 'updated_at'>>) => {
    const { data, error } = await supabase
      .from('equipment')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    return { data, error };
  },
  
  /**
   * Delete equipment by ID
   */
  deleteEquipment: async (id: string) => {
    const { error } = await supabase
      .from('equipment')
      .delete()
      .eq('id', id);
    
    return { error };
  },
  
  /**
   * Get all equipment assignments (optionally filtered)
   */
  getEquipmentAssignments: async (equipmentId?: string, technicianId?: string) => {
    let query = supabase
      .from('equipment_assignments')
      .select(`
        *,
        technician:technician_id(id, email, user_metadata),
        equipment:equipment_id(id, name, serial_number, asset_tag)
      `);
    
    if (equipmentId) query = query.eq('equipment_id', equipmentId);
    if (technicianId) query = query.eq('technician_id', technicianId);
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    return { data, error };
  },
  
  /**
   * Get equipment assignment by ID
   */
  getAssignmentById: async (id: string) => {
    const { data, error } = await supabase
      .from('equipment_assignments')
      .select(`
        *,
        technician:technician_id(id, email, user_metadata),
        equipment:equipment_id(id, name, serial_number, asset_tag)
      `)
      .eq('id', id)
      .single();
    
    return { data, error };
  },
  
  /**
   * Create equipment assignment
   */
  createAssignment: async (assignment: Omit<EquipmentAssignment, 'id' | 'created_at' | 'technician' | 'updated_at'>) => {
    const { data, error } = await supabase
      .from('equipment_assignments')
      .insert(assignment)
      .select(`
        *,
        technician:technician_id(id, email, user_metadata),
        equipment:equipment_id(id, name, serial_number, asset_tag)
      `)
      .single();
    
    // If successful, update equipment status to assigned
    if (!error && data && assignment.technician_id) {
      await supabase
        .from('equipment')
        .update({ status: 'assigned', assigned_to: assignment.technician_id })
        .eq('id', assignment.equipment_id);
    }
    
    return { data, error };
  },
  
  /**
   * Update equipment assignment
   */
  updateAssignment: async (id: string, updates: Partial<Omit<EquipmentAssignment, 'id' | 'created_at' | 'technician'>>) => {
    const { data, error } = await supabase
      .from('equipment_assignments')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        technician:technician_id(id, email, user_metadata),
        equipment:equipment_id(id, name, serial_number, asset_tag)
      `)
      .single();
    
    return { data, error };
  },
  
  /**
   * Delete equipment assignment
   */
  deleteAssignment: async (id: string) => {
    const { data: assignment } = await supabase
      .from('equipment_assignments')
      .select('equipment_id, technician_id')
      .eq('id', id)
      .single();
    
    const { error } = await supabase
      .from('equipment_assignments')
      .delete()
      .eq('id', id);
    
    // If successful and we have assignment data, update equipment status
    if (!error && assignment) {
      await supabase
        .from('equipment')
        .update({ 
          status: 'available', 
          assigned_to: null
        })
        .eq('id', assignment.equipment_id);
    }
    
    return { error };
  },
  
  /**
   * Get unique equipment types from database
   */
  getEquipmentTypes: async () => {
    const { data, error } = await supabase
      .from('equipment')
      .select('type')
      .order('type');
    
    if (!error && data) {
      const uniqueTypes = [...new Set(data.map(item => item.type).filter(Boolean))];
      return { data: uniqueTypes, error: null };
    }
    
    return { data: [], error };
  },
  
  /**
   * Get equipment statuses (predefined list)
   */
  getEquipmentStatuses: async () => {
    // These are predefined statuses
    const statuses = [
      'available',
      'assigned',
      'in-repair',
      'out-of-service',
      'in-calibration'
    ];
    
    return { data: statuses, error: null };
  }
};

export default equipmentService;