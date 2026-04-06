import { supabase } from '@/lib/supabase';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface NewHirePacket {
  id: string;
  name: string;
  description?: string;
  packet_type: 'standard' | 'executive' | 'contractor' | 'intern' | 'custom';
  documents: Array<{
    name: string;
    file_url?: string;
    file_path?: string;
    required: boolean;
    order: number;
    requires_signature?: boolean;
  }>;
  instructions?: string;
  custom_fields?: Record<string, any>;
  employee_id?: string;
  offer_id?: string;
  status: 'draft' | 'active' | 'archived';
  is_template: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ESignForm {
  id: string;
  name: string;
  description?: string;
  form_type: 'standard' | 'policy' | 'agreement' | 'disclosure' | 'custom';
  form_content: string;
  form_fields: Array<{
    name: string;
    type: string;
    required: boolean;
    label: string;
    placeholder?: string;
  }>;
  signature_fields: Array<{
    name: string;
    label: string;
    required: boolean;
    signer_type: string;
  }>;
  employee_id?: string;
  packet_id?: string;
  status: 'draft' | 'active' | 'archived';
  is_template: boolean;
  requires_acknowledgment: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ESignSubmission {
  id: string;
  form_id: string;
  employee_id?: string;
  signer_email: string;
  signer_name: string;
  signatures: Array<{
    field_name: string;
    signature_image?: string;
    signature_data?: Record<string, any>;
    signed_at?: string;
  }>;
  form_data: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  status: 'pending' | 'signed' | 'declined';
  signed_at?: string;
  signing_token?: string;
  created_at: string;
  updated_at: string;
}

export interface Checklist {
  id: string;
  name: string;
  description?: string;
  checklist_type: 'standard' | 'pre-start' | 'first-day' | 'first-week' | 'first-month' | 'custom';
  items: Array<{
    id: string;
    title: string;
    description?: string;
    category?: string;
    required: boolean;
    order: number;
    assignee_type?: string;
    due_days?: number;
  }>;
  employee_id?: string;
  packet_id?: string;
  status: 'draft' | 'active' | 'archived';
  is_template: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface OnboardingTrackingRecord {
  id: string;
  candidate_id?: string | null;
  offer_id?: string | null;
  /** When set, this record is for an assigned ampOS user (not from recruiting). */
  user_id?: string | null;
  new_hire_packet_id?: string;
  /** All assigned packet IDs (from join table; use this for multiple packets) */
  assigned_packet_ids?: string[];
  status: 'pending' | 'in_progress' | 'completed';
  created_by: string;
  created_at: string;
  updated_at: string;
  candidate?: { id: string; first_name: string; last_name: string; email: string; position_applied?: string };
  offer?: { id: string; position_title: string; department: string };
  /** When user_id is set, resolved user from auth (ampOS user). */
  user?: { id: string; email: string; name?: string };
  new_hire_packet?: NewHirePacket;
  /** Assigned packet names for display (id, name) */
  assigned_packets?: { id: string; name: string }[];
  /** Assigned E-Sign form names for display (id, name) */
  assigned_forms?: { id: string; name: string }[];
  /** Assigned checklist names for display (id, name) */
  assigned_checklists?: { id: string; name: string }[];
  /** Assigned IT/Equipment task names and status for display (id, name, status) */
  assigned_it_tasks?: { id: string; name: string; status?: string }[];
}

export interface ChecklistAssignment {
  id: string;
  checklist_id: string;
  employee_id: string;
  assigned_by: string;
  items_completed: Array<{
    item_id: string;
    completed_by?: string;
    completed_at?: string;
    notes?: string;
  }>;
  completion_percentage: number;
  status: 'not_started' | 'in_progress' | 'completed' | 'overdue';
  assigned_at: string;
  started_at?: string;
  completed_at?: string;
  due_date?: string;
  created_at: string;
  updated_at: string;
}

export interface WelcomeEmail {
  id: string;
  name: string;
  description?: string;
  email_type: 'standard' | 'pre-start' | 'first-day' | 'first-week' | 'custom';
  subject: string;
  email_body: string;
  email_body_text?: string;
  template_variables: Array<{
    name: string;
    description?: string;
  }>;
  send_automatically: boolean;
  send_days_before_start: number;
  send_time: string;
  employee_id?: string;
  offer_id?: string;
  status: 'draft' | 'active' | 'archived';
  is_template: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WelcomeEmailSend {
  id: string;
  email_id: string;
  employee_id: string;
  recipient_email: string;
  recipient_name?: string;
  subject: string;
  email_body: string;
  email_body_text?: string;
  status: 'pending' | 'sent' | 'failed' | 'bounced';
  sent_at?: string;
  opened_at?: string;
  clicked_at?: string;
  error_message?: string;
  sent_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ITEquipmentTask {
  id: string;
  name: string;
  description?: string;
  task_type: 'standard' | 'laptop' | 'phone' | 'access' | 'software' | 'hardware' | 'custom';
  equipment_category?: string;
  equipment_specs?: Record<string, any>;
  software_requirements: Array<{
    name: string;
    version?: string;
    required: boolean;
  }>;
  access_requirements: Array<{
    system: string;
    role?: string;
    permissions?: string[];
  }>;
  employee_id?: string;
  assigned_to_user_id?: string;
  packet_id?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string;
  completed_at?: string;
  equipment_assigned: Array<{
    equipment_id?: string;
    serial_number?: string;
    assigned_date?: string;
  }>;
  notes?: string;
  is_template?: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Service Implementation
// ============================================================================

export const onboardingService = {
  // ============================================================================
  // New Hire Packets
  // ============================================================================
  
  async getPackets(filters?: { employee_id?: string; status?: string; is_template?: boolean; custom_only?: boolean }): Promise<NewHirePacket[]> {
    let query = supabase
      .schema('common')
      .from('new_hire_packets')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.employee_id) {
      query = query.eq('employee_id', filters.employee_id);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.is_template !== undefined) {
      query = query.eq('is_template', filters.is_template);
    }
    /** Only packets not assigned to a specific offer (custom/templates). Excludes per-candidate copies. */
    if (filters?.custom_only) {
      query = query.is('offer_id', null);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching packets:', error);
      throw error;
    }

    return data || [];
  },

  async getPacketById(id: string): Promise<NewHirePacket | null> {
    const { data, error } = await supabase
      .schema('common')
      .from('new_hire_packets')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching packet:', error);
      throw error;
    }

    return data;
  },

  async createPacket(packet: Omit<NewHirePacket, 'id' | 'created_at' | 'updated_at'>): Promise<NewHirePacket> {
    // Clean the data - convert empty strings to null, ensure JSONB fields are arrays/objects
    const cleanedPacket = {
      name: packet.name,
      description: packet.description?.trim() || null,
      packet_type: packet.packet_type || 'standard',
      documents: Array.isArray(packet.documents) ? packet.documents : [],
      instructions: packet.instructions?.trim() || null,
      custom_fields: packet.custom_fields || {},
      employee_id: packet.employee_id || null,
      offer_id: packet.offer_id || null,
      status: packet.status || 'draft',
      is_template: packet.is_template || false,
      created_by: packet.created_by,
    };

    console.log('Creating packet with data:', cleanedPacket);

    const { data, error } = await supabase
      .schema('common')
      .from('new_hire_packets')
      .insert(cleanedPacket)
      .select()
      .single();

    if (error) {
      console.error('Error creating packet:', error);
      const errorMessage = error.message || error.details || 'Failed to create packet';
      throw new Error(errorMessage);
    }

    return data;
  },

  async updatePacket(id: string, updates: Partial<NewHirePacket>): Promise<NewHirePacket> {
    const { data, error } = await supabase
      .schema('common')
      .from('new_hire_packets')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating packet:', error);
      throw error;
    }

    return data;
  },

  async deletePacket(id: string): Promise<void> {
    const { error } = await supabase
      .schema('common')
      .from('new_hire_packets')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting packet:', error);
      throw error;
    }
  },

  // ============================================================================
  // E-Sign Forms
  // ============================================================================

  async getESignForms(filters?: { employee_id?: string; packet_id?: string; status?: string; is_template?: boolean }): Promise<ESignForm[]> {
    let query = supabase
      .schema('common')
      .from('onboarding_e_sign_forms')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.employee_id) {
      query = query.eq('employee_id', filters.employee_id);
    }
    if (filters?.packet_id) {
      query = query.eq('packet_id', filters.packet_id);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.is_template !== undefined) {
      query = query.eq('is_template', filters.is_template);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching e-sign forms:', error);
      throw error;
    }

    return data || [];
  },

  async getESignFormById(id: string): Promise<ESignForm | null> {
    const { data, error } = await supabase
      .schema('common')
      .from('onboarding_e_sign_forms')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching e-sign form:', error);
      throw error;
    }

    return data;
  },

  async createESignForm(form: Omit<ESignForm, 'id' | 'created_at' | 'updated_at'>): Promise<ESignForm> {
    // Clean the data
    const cleanedForm: any = {
      name: form.name,
      description: form.description?.trim() || null,
      form_type: form.form_type || 'standard',
      form_content: form.form_content,
      form_fields: Array.isArray(form.form_fields) ? form.form_fields : [],
      signature_fields: Array.isArray(form.signature_fields) ? form.signature_fields : [],
      employee_id: form.employee_id || null,
      packet_id: form.packet_id || null,
      status: form.status || 'draft',
      is_template: form.is_template || false,
      requires_acknowledgment: form.requires_acknowledgment !== undefined ? form.requires_acknowledgment : true,
      created_by: form.created_by,
    };
    
    // Include custom_fields if provided
    if ((form as any).custom_fields) {
      cleanedForm.custom_fields = (form as any).custom_fields;
    }

    const { data, error } = await supabase
      .schema('common')
      .from('onboarding_e_sign_forms')
      .insert(cleanedForm)
      .select()
      .single();

    if (error) {
      console.error('Error creating e-sign form:', error);
      const errorMessage = error.message || error.details || 'Failed to create e-sign form';
      throw new Error(errorMessage);
    }

    return data;
  },

  async updateESignForm(id: string, updates: Partial<ESignForm>): Promise<ESignForm> {
    const u = updates as any;
    // attached_documents is stored inside custom_fields, not as a table column
    const updateData: any = { ...updates };
    delete updateData.attached_documents;
    if (u.attached_documents !== undefined) {
      updateData.custom_fields = {
        ...(u.custom_fields || {}),
        attached_documents: u.attached_documents,
      };
    } else if (u.custom_fields !== undefined) {
      updateData.custom_fields = u.custom_fields;
    }
    
    const { data, error } = await supabase
      .schema('common')
      .from('onboarding_e_sign_forms')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating e-sign form:', error);
      throw error;
    }

    return data;
  },

  async deleteESignForm(id: string): Promise<void> {
    const { error } = await supabase
      .schema('common')
      .from('onboarding_e_sign_forms')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting e-sign form:', error);
      throw error;
    }
  },

  async getESignSubmissions(formId: string): Promise<ESignSubmission[]> {
    const { data, error } = await supabase
      .schema('common')
      .from('onboarding_e_sign_submissions')
      .select('*')
      .eq('form_id', formId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching e-sign submissions:', error);
      throw error;
    }

    return data || [];
  },

  async createESignSubmission(submission: Omit<ESignSubmission, 'id' | 'created_at' | 'updated_at'>): Promise<ESignSubmission> {
    const { data, error } = await supabase
      .schema('common')
      .from('onboarding_e_sign_submissions')
      .insert({
        ...submission,
        signed_at: submission.status === 'signed' ? new Date().toISOString() : undefined,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating e-sign submission:', error);
      throw error;
    }

    return data;
  },

  // ============================================================================
  // Checklists
  // ============================================================================

  async getChecklists(filters?: { employee_id?: string; packet_id?: string; status?: string; is_template?: boolean }): Promise<Checklist[]> {
    let query = supabase
      .schema('common')
      .from('onboarding_checklists')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.employee_id) {
      query = query.eq('employee_id', filters.employee_id);
    }
    if (filters?.packet_id) {
      query = query.eq('packet_id', filters.packet_id);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.is_template !== undefined) {
      query = query.eq('is_template', filters.is_template);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching checklists:', error);
      throw error;
    }

    return data || [];
  },

  async getChecklistById(id: string): Promise<Checklist | null> {
    const { data, error } = await supabase
      .schema('common')
      .from('onboarding_checklists')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching checklist:', error);
      throw error;
    }

    return data;
  },

  async createChecklist(checklist: Omit<Checklist, 'id' | 'created_at' | 'updated_at'>): Promise<Checklist> {
    // Clean the data
    const cleanedChecklist = {
      name: checklist.name,
      description: checklist.description?.trim() || null,
      checklist_type: checklist.checklist_type || 'standard',
      items: Array.isArray(checklist.items) ? checklist.items : [],
      employee_id: checklist.employee_id || null,
      packet_id: checklist.packet_id || null,
      status: checklist.status || 'draft',
      is_template: checklist.is_template || false,
      created_by: checklist.created_by,
    };

    const { data, error } = await supabase
      .schema('common')
      .from('onboarding_checklists')
      .insert(cleanedChecklist)
      .select()
      .single();

    if (error) {
      console.error('Error creating checklist:', error);
      const errorMessage = error.message || error.details || 'Failed to create checklist';
      throw new Error(errorMessage);
    }

    return data;
  },

  async updateChecklist(id: string, updates: Partial<Checklist>): Promise<Checklist> {
    const { data, error } = await supabase
      .schema('common')
      .from('onboarding_checklists')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating checklist:', error);
      throw error;
    }

    return data;
  },

  async deleteChecklist(id: string): Promise<void> {
    const { error } = await supabase
      .schema('common')
      .from('onboarding_checklists')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting checklist:', error);
      throw error;
    }
  },

  async getChecklistAssignments(employeeId?: string, checklistId?: string): Promise<ChecklistAssignment[]> {
    let query = supabase
      .schema('common')
      .from('onboarding_checklist_assignments')
      .select('*')
      .order('created_at', { ascending: false });

    if (employeeId) {
      query = query.eq('employee_id', employeeId);
    }
    if (checklistId) {
      query = query.eq('checklist_id', checklistId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching checklist assignments:', error);
      throw error;
    }

    return data || [];
  },

  async createChecklistAssignment(assignment: Omit<ChecklistAssignment, 'id' | 'created_at' | 'updated_at'>): Promise<ChecklistAssignment> {
    const { data, error } = await supabase
      .schema('common')
      .from('onboarding_checklist_assignments')
      .insert(assignment)
      .select()
      .single();

    if (error) {
      console.error('Error creating checklist assignment:', error);
      throw error;
    }

    return data;
  },

  async updateChecklistAssignment(id: string, updates: Partial<ChecklistAssignment>): Promise<ChecklistAssignment> {
    const { data, error } = await supabase
      .schema('common')
      .from('onboarding_checklist_assignments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating checklist assignment:', error);
      throw error;
    }

    return data;
  },

  // ============================================================================
  // Welcome Emails
  // ============================================================================

  async getWelcomeEmails(filters?: { employee_id?: string; offer_id?: string; status?: string; is_template?: boolean }): Promise<WelcomeEmail[]> {
    let query = supabase
      .schema('common')
      .from('welcome_emails')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.employee_id) {
      query = query.eq('employee_id', filters.employee_id);
    }
    if (filters?.offer_id) {
      query = query.eq('offer_id', filters.offer_id);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.is_template !== undefined) {
      query = query.eq('is_template', filters.is_template);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching welcome emails:', error);
      throw error;
    }

    return data || [];
  },

  async getWelcomeEmailById(id: string): Promise<WelcomeEmail | null> {
    const { data, error } = await supabase
      .schema('common')
      .from('welcome_emails')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching welcome email:', error);
      throw error;
    }

    return data;
  },

  async createWelcomeEmail(email: Omit<WelcomeEmail, 'id' | 'created_at' | 'updated_at'>): Promise<WelcomeEmail> {
    // Clean the data
    const cleanedEmail = {
      name: email.name,
      description: email.description?.trim() || null,
      email_type: email.email_type || 'standard',
      subject: email.subject,
      email_body: email.email_body,
      email_body_text: email.email_body_text?.trim() || null,
      template_variables: Array.isArray(email.template_variables) ? email.template_variables : [],
      send_automatically: email.send_automatically || false,
      send_days_before_start: email.send_days_before_start || 0,
      send_time: email.send_time || '09:00:00',
      employee_id: email.employee_id || null,
      offer_id: email.offer_id || null,
      status: email.status || 'draft',
      is_template: email.is_template || false,
      created_by: email.created_by,
    };

    const { data, error } = await supabase
      .schema('common')
      .from('welcome_emails')
      .insert(cleanedEmail)
      .select()
      .single();

    if (error) {
      console.error('Error creating welcome email:', error);
      const errorMessage = error.message || error.details || 'Failed to create welcome email';
      throw new Error(errorMessage);
    }

    return data;
  },

  async updateWelcomeEmail(id: string, updates: Partial<WelcomeEmail>): Promise<WelcomeEmail> {
    const { data, error } = await supabase
      .schema('common')
      .from('welcome_emails')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating welcome email:', error);
      throw error;
    }

    return data;
  },

  async deleteWelcomeEmail(id: string): Promise<void> {
    const { error } = await supabase
      .schema('common')
      .from('welcome_emails')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting welcome email:', error);
      throw error;
    }
  },

  async getWelcomeEmailSends(emailId?: string, employeeId?: string): Promise<WelcomeEmailSend[]> {
    let query = supabase
      .schema('common')
      .from('welcome_email_sends')
      .select('*')
      .order('created_at', { ascending: false });

    if (emailId) {
      query = query.eq('email_id', emailId);
    }
    if (employeeId) {
      query = query.eq('employee_id', employeeId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching welcome email sends:', error);
      throw error;
    }

    return data || [];
  },

  async createWelcomeEmailSend(send: Omit<WelcomeEmailSend, 'id' | 'created_at' | 'updated_at'>): Promise<WelcomeEmailSend> {
    const { data, error } = await supabase
      .schema('common')
      .from('welcome_email_sends')
      .insert(send)
      .select()
      .single();

    if (error) {
      console.error('Error creating welcome email send:', error);
      throw error;
    }

    return data;
  },

  // ============================================================================
  // IT Equipment Tasks
  // ============================================================================

  async getITEquipmentTasks(filters?: { employee_id?: string; assigned_to?: string; packet_id?: string; status?: string; is_template?: boolean }): Promise<ITEquipmentTask[]> {
    let query = supabase
      .schema('common')
      .from('it_equipment_tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.employee_id) {
      query = query.eq('employee_id', filters.employee_id);
    }
    if (filters?.assigned_to) {
      query = query.eq('assigned_to_user_id', filters.assigned_to);
    }
    if (filters?.packet_id) {
      query = query.eq('packet_id', filters.packet_id);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.is_template !== undefined) {
      query = query.eq('is_template', filters.is_template);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching IT equipment tasks:', error);
      throw error;
    }

    return data || [];
  },

  async getITEquipmentTaskById(id: string): Promise<ITEquipmentTask | null> {
    const { data, error } = await supabase
      .schema('common')
      .from('it_equipment_tasks')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching IT equipment task:', error);
      throw error;
    }

    return data;
  },

  async createITEquipmentTask(task: Omit<ITEquipmentTask, 'id' | 'created_at' | 'updated_at'>): Promise<ITEquipmentTask> {
    // Clean the data
    const cleanedTask = {
      name: task.name,
      description: task.description?.trim() || null,
      task_type: task.task_type || 'standard',
      equipment_category: task.equipment_category?.trim() || null,
      equipment_specs: task.equipment_specs || {},
      software_requirements: Array.isArray(task.software_requirements) ? task.software_requirements : [],
      access_requirements: Array.isArray(task.access_requirements) ? task.access_requirements : [],
      employee_id: task.employee_id || null,
      assigned_to_user_id: task.assigned_to_user_id || null,
      packet_id: task.packet_id || null,
      status: task.status || 'pending',
      priority: task.priority || 'medium',
      completed_at: task.completed_at || null,
      equipment_assigned: Array.isArray(task.equipment_assigned) ? task.equipment_assigned : [],
      notes: task.notes?.trim() || null,
      is_template: task.is_template === true,
      created_by: task.created_by,
    };

    const { data, error } = await supabase
      .schema('common')
      .from('it_equipment_tasks')
      .insert(cleanedTask)
      .select()
      .single();

    if (error) {
      console.error('Error creating IT equipment task:', error);
      const errorMessage = error.message || error.details || 'Failed to create IT equipment task';
      throw new Error(errorMessage);
    }

    return data;
  },

  async updateITEquipmentTask(id: string, updates: Partial<ITEquipmentTask>): Promise<ITEquipmentTask> {
    const { data, error } = await supabase
      .schema('common')
      .from('it_equipment_tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating IT equipment task:', error);
      throw error;
    }

    return data;
  },

  async deleteITEquipmentTask(id: string): Promise<void> {
    const { error } = await supabase
      .schema('common')
      .from('it_equipment_tasks')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting IT equipment task:', error);
      throw error;
    }
  },

  // ============================================================================
  // Onboarding Tracking (from accepted offers)
  // ============================================================================

  async getOnboardingTrackingList(): Promise<OnboardingTrackingRecord[]> {
    const { data: rows, error } = await supabase
      .schema('common')
      .from('onboarding_tracking')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching onboarding tracking:', error);
      throw error;
    }
    const list = (rows || []) as OnboardingTrackingRecord[];
    if (list.length === 0) return list;

    const trackingIds = list.map(r => r.id);
    const candidateIds = [...new Set(list.map(r => r.candidate_id).filter(Boolean))] as string[];
    const offerIds = [...new Set(list.map(r => r.offer_id).filter(Boolean))] as string[];
    const userIds = [...new Set(list.map(r => (r as any).user_id).filter(Boolean))] as string[];

    const promises: Promise<any>[] = [
      supabase.schema('common').from('new_hire_packets').select('id, name'),
    ];
    if (candidateIds.length) {
      promises.push(supabase.schema('common').from('candidates').select('id, first_name, last_name, email, position_applied').in('id', candidateIds));
    } else {
      promises.push(Promise.resolve({ data: [] }));
    }
    if (offerIds.length) {
      promises.push(supabase.schema('common').from('offers').select('id, position_title, department').in('id', offerIds));
    } else {
      promises.push(Promise.resolve({ data: [] }));
    }
    const [{ data: tpData, error: tpErr }, { data: tfData, error: tfErr }, { data: tcData, error: tcErr }, { data: ttData, error: ttErr }] = await Promise.all([
      supabase.schema('common').from('onboarding_tracking_packets').select('tracking_id, packet_id').in('tracking_id', trackingIds),
      supabase.schema('common').from('onboarding_tracking_forms').select('tracking_id, form_id').in('tracking_id', trackingIds),
      supabase.schema('common').from('onboarding_tracking_checklists').select('tracking_id, checklist_id').in('tracking_id', trackingIds),
      supabase.schema('common').from('onboarding_tracking_it_tasks').select('tracking_id, task_id').in('tracking_id', trackingIds),
    ]);
    let trackingPackets: { tracking_id: string; packet_id: string }[] = (!tpErr && tpData ? tpData : []) as any[];
    const trackingForms: { tracking_id: string; form_id: string }[] = (!tfErr && tfData ? tfData : []) as any[];
    const trackingChecklists: { tracking_id: string; checklist_id: string }[] = (!tcErr && tcData ? tcData : []) as any[];
    const trackingITTasks: { tracking_id: string; task_id: string }[] = (!ttErr && ttData ? ttData : []) as any[];

    const formIds = [...new Set(trackingForms.map((tf: any) => tf.form_id))];
    let formMap = new Map<string, { id: string; name: string }>();
    if (formIds.length > 0) {
      const { data: formRows } = await supabase.schema('common').from('onboarding_e_sign_forms').select('id, name').in('id', formIds);
      (formRows || []).forEach((f: any) => formMap.set(f.id, { id: f.id, name: f.name || 'Form' }));
    }
    const formIdsByTracking = new Map<string, string[]>();
    for (const tf of trackingForms) {
      const arr = formIdsByTracking.get(tf.tracking_id) || [];
      arr.push(tf.form_id);
      formIdsByTracking.set(tf.tracking_id, arr);
    }
    const checklistIds = [...new Set(trackingChecklists.map((tc: any) => tc.checklist_id))];
    let checklistMap = new Map<string, { id: string; name: string }>();
    if (checklistIds.length > 0) {
      const { data: checklistRows } = await supabase.schema('common').from('onboarding_checklists').select('id, name').in('id', checklistIds);
      (checklistRows || []).forEach((c: any) => checklistMap.set(c.id, { id: c.id, name: c.name || 'Checklist' }));
    }
    const checklistIdsByTracking = new Map<string, string[]>();
    for (const tc of trackingChecklists) {
      const arr = checklistIdsByTracking.get(tc.tracking_id) || [];
      arr.push(tc.checklist_id);
      checklistIdsByTracking.set(tc.tracking_id, arr);
    }
    const taskIdsByTracking = new Map<string, string[]>();
    for (const tt of trackingITTasks) {
      const arr = taskIdsByTracking.get(tt.tracking_id) || [];
      arr.push(tt.task_id);
      taskIdsByTracking.set(tt.tracking_id, arr);
    }
    const taskIds = [...new Set(trackingITTasks.map((tt: any) => tt.task_id))];
    let taskMap = new Map<string, { id: string; name: string; status: string }>();
    if (taskIds.length > 0) {
      const { data: taskRows } = await supabase.schema('common').from('it_equipment_tasks').select('id, name, status').in('id', taskIds);
      (taskRows || []).forEach((t: any) => taskMap.set(t.id, { id: t.id, name: t.name || 'IT Task', status: t.status || 'pending' }));
    }

    const results = await Promise.all(promises);
    const packets = (results[0] as any)?.data ?? [];
    const candidatesRes = results[1];
    const offersRes = results[2];
    const candidates = candidatesRes?.data ?? [];
    const offers = offersRes?.data ?? [];

    let userMap = new Map<string, { id: string; email: string; name?: string }>();
    if (userIds.length > 0) {
      try {
        const { data: usersData } = await supabase.schema('common').rpc('admin_get_users');
        const allUsers = (usersData || []) as any[];
        allUsers.forEach((u: any) => {
          if (u?.id && userIds.includes(u.id)) {
            const name = u.raw_user_meta_data?.name || u.user_metadata?.name || u.email?.split('@')[0] || '';
            userMap.set(u.id, { id: u.id, email: u.email || '', name: name || undefined });
          }
        });
      } catch {
        // ignore
      }
    }

    const packetIdsByTracking = new Map<string, string[]>();
    for (const tp of trackingPackets) {
      const arr = packetIdsByTracking.get(tp.tracking_id) || [];
      arr.push(tp.packet_id);
      packetIdsByTracking.set(tp.tracking_id, arr);
    }
    const packetMap = new Map((packets || []).map((p: any) => [p.id, p]));
    const candidateMap = new Map((candidates || []).map((c: any) => [c.id, c]));
    const offerMap = new Map((offers || []).map((o: any) => [o.id, o]));

    return list.map(r => {
      const pids = packetIdsByTracking.get(r.id) || [];
      if (r.new_hire_packet_id && !pids.includes(r.new_hire_packet_id)) pids.unshift(r.new_hire_packet_id);
      const assigned_packets = pids.map(pid => ({ id: pid, name: (packetMap.get(pid) as any)?.name || 'Packet' }));
      const fids = formIdsByTracking.get(r.id) || [];
      const assigned_forms = fids.map(fid => formMap.get(fid) || { id: fid, name: 'Form' });
      const cids = checklistIdsByTracking.get(r.id) || [];
      const assigned_checklists = cids.map(cid => checklistMap.get(cid) || { id: cid, name: 'Checklist' });
      const tids = taskIdsByTracking.get(r.id) || [];
      const assigned_it_tasks = tids.map(tid => taskMap.get(tid) || { id: tid, name: 'IT Task', status: 'pending' });
      const user = (r as any).user_id ? userMap.get((r as any).user_id) : undefined;
      return {
        ...r,
        assigned_packet_ids: pids,
        assigned_packets,
        assigned_forms,
        assigned_checklists,
        assigned_it_tasks,
        candidate: r.candidate_id ? candidateMap.get(r.candidate_id) : undefined,
        offer: r.offer_id ? offerMap.get(r.offer_id) : undefined,
        user,
      };
    });
  },

  /** Get onboarding tracking record(s) for the candidate with the given email (for "My Onboarding" new-hire view). */
  async getOnboardingTrackingForCandidateEmail(email: string): Promise<OnboardingTrackingRecord[]> {
    if (!email?.trim()) return [];
    const { data: candidates, error: cErr } = await supabase
      .schema('common')
      .from('candidates')
      .select('id')
      .eq('email', email.trim());

    if (cErr || !candidates?.length) return [];
    const candidateIds = candidates.map((c: { id: string }) => c.id);

    const { data: rows, error } = await supabase
      .schema('common')
      .from('onboarding_tracking')
      .select('*')
      .in('candidate_id', candidateIds)
      .order('created_at', { ascending: false });

    if (error || !rows?.length) return [];
    const list = rows as OnboardingTrackingRecord[];

    const trackingIds = list.map(r => r.id);
    const offerIds = [...new Set(list.map(r => r.offer_id))];
    const [{ data: candidateRows }, { data: offers }, { data: packets }, { data: tpData }, { data: tfData }, { data: tcData }, { data: ttData }] = await Promise.all([
      supabase.schema('common').from('candidates').select('id, first_name, last_name, email, position_applied').in('id', candidateIds),
      supabase.schema('common').from('offers').select('id, position_title, department').in('id', offerIds),
      supabase.schema('common').from('new_hire_packets').select('id, name'),
      supabase.schema('common').from('onboarding_tracking_packets').select('tracking_id, packet_id').in('tracking_id', trackingIds),
      supabase.schema('common').from('onboarding_tracking_forms').select('tracking_id, form_id').in('tracking_id', trackingIds),
      supabase.schema('common').from('onboarding_tracking_checklists').select('tracking_id, checklist_id').in('tracking_id', trackingIds),
      supabase.schema('common').from('onboarding_tracking_it_tasks').select('tracking_id, task_id').in('tracking_id', trackingIds),
    ]);

    const trackingPackets = (tpData || []) as { tracking_id: string; packet_id: string }[];
    const trackingForms = (tfData || []) as { tracking_id: string; form_id: string }[];
    const trackingChecklists = (tcData || []) as { tracking_id: string; checklist_id: string }[];
    const trackingITTasks = (ttData || []) as { tracking_id: string; task_id: string }[];
    const packetIdsByTracking = new Map<string, string[]>();
    for (const tp of trackingPackets) {
      const arr = packetIdsByTracking.get(tp.tracking_id) || [];
      arr.push(tp.packet_id);
      packetIdsByTracking.set(tp.tracking_id, arr);
    }
    const formIdsByTracking = new Map<string, string[]>();
    for (const tf of trackingForms) {
      const arr = formIdsByTracking.get(tf.tracking_id) || [];
      arr.push(tf.form_id);
      formIdsByTracking.set(tf.tracking_id, arr);
    }
    const checklistIdsByTracking = new Map<string, string[]>();
    for (const tc of trackingChecklists) {
      const arr = checklistIdsByTracking.get(tc.tracking_id) || [];
      arr.push(tc.checklist_id);
      checklistIdsByTracking.set(tc.tracking_id, arr);
    }
    const taskIdsByTracking = new Map<string, string[]>();
    for (const tt of trackingITTasks) {
      const arr = taskIdsByTracking.get(tt.tracking_id) || [];
      arr.push(tt.task_id);
      taskIdsByTracking.set(tt.tracking_id, arr);
    }
    const formIds = [...new Set(trackingForms.map((tf: any) => tf.form_id))];
    let formMap = new Map<string, { id: string; name: string }>();
    if (formIds.length > 0) {
      const { data: formRows } = await supabase.schema('common').from('onboarding_e_sign_forms').select('id, name').in('id', formIds);
      (formRows || []).forEach((f: any) => formMap.set(f.id, { id: f.id, name: f.name || 'Form' }));
    }
    const checklistIds = [...new Set(trackingChecklists.map((tc: any) => tc.checklist_id))];
    let checklistMap = new Map<string, { id: string; name: string }>();
    if (checklistIds.length > 0) {
      const { data: checklistRows } = await supabase.schema('common').from('onboarding_checklists').select('id, name').in('id', checklistIds);
      (checklistRows || []).forEach((c: any) => checklistMap.set(c.id, { id: c.id, name: c.name || 'Checklist' }));
    }
    const taskIds = [...new Set(trackingITTasks.map((tt: any) => tt.task_id))];
    let taskMap = new Map<string, { id: string; name: string; status: string }>();
    if (taskIds.length > 0) {
      const { data: taskRows } = await supabase.schema('common').from('it_equipment_tasks').select('id, name, status').in('id', taskIds);
      (taskRows || []).forEach((t: any) => taskMap.set(t.id, { id: t.id, name: t.name || 'IT Task', status: t.status || 'pending' }));
    }
    const packetMap = new Map((packets || []).map((p: any) => [p.id, p]));
    const candidateMap = new Map((candidateRows || []).map((c: any) => [c.id, c]));
    const offerMap = new Map((offers || []).map((o: any) => [o.id, o]));

    return list.map(r => {
      const pids = packetIdsByTracking.get(r.id) || [];
      if (r.new_hire_packet_id && !pids.includes(r.new_hire_packet_id)) pids.unshift(r.new_hire_packet_id);
      const assigned_packets = pids.map(pid => ({ id: pid, name: (packetMap.get(pid) as any)?.name || 'Packet' }));
      const fids = formIdsByTracking.get(r.id) || [];
      const assigned_forms = fids.map(fid => formMap.get(fid) || { id: fid, name: 'Form' });
      const cids = checklistIdsByTracking.get(r.id) || [];
      const assigned_checklists = cids.map(cid => checklistMap.get(cid) || { id: cid, name: 'Checklist' });
      const tids = taskIdsByTracking.get(r.id) || [];
      const assigned_it_tasks = tids.map(tid => taskMap.get(tid) || { id: tid, name: 'IT Task', status: 'pending' });
      return {
        ...r,
        assigned_packet_ids: pids,
        assigned_packets,
        assigned_forms,
        assigned_checklists,
        assigned_it_tasks,
        candidate: candidateMap.get(r.candidate_id),
        offer: offerMap.get(r.offer_id),
      };
    });
  },

  /** Get onboarding tracking for an ampOS user (assigned by user_id). Used by My Onboarding. */
  async getOnboardingTrackingForUserId(userId: string): Promise<OnboardingTrackingRecord[]> {
    if (!userId?.trim()) return [];
    const { data: rows, error } = await supabase
      .schema('common')
      .from('onboarding_tracking')
      .select('*')
      .eq('user_id', userId.trim())
      .order('created_at', { ascending: false });

    if (error || !rows?.length) return [];
    const list = rows as OnboardingTrackingRecord[];

    const trackingIds = list.map(r => r.id);
    const offerIds = [...new Set(list.map(r => r.offer_id).filter(Boolean))] as string[];
    const [{ data: offers }, { data: packets }, { data: tpData }, { data: tfData }, { data: tcData }, { data: ttData }] = await Promise.all([
      offerIds.length > 0 ? supabase.schema('common').from('offers').select('id, position_title, department').in('id', offerIds) : Promise.resolve({ data: [] }),
      supabase.schema('common').from('new_hire_packets').select('id, name'),
      supabase.schema('common').from('onboarding_tracking_packets').select('tracking_id, packet_id').in('tracking_id', trackingIds),
      supabase.schema('common').from('onboarding_tracking_forms').select('tracking_id, form_id').in('tracking_id', trackingIds),
      supabase.schema('common').from('onboarding_tracking_checklists').select('tracking_id, checklist_id').in('tracking_id', trackingIds),
      supabase.schema('common').from('onboarding_tracking_it_tasks').select('tracking_id, task_id').in('tracking_id', trackingIds),
    ]);

    const trackingPackets = (tpData || []) as { tracking_id: string; packet_id: string }[];
    const trackingForms = (tfData || []) as { tracking_id: string; form_id: string }[];
    const trackingChecklists = (tcData || []) as { tracking_id: string; checklist_id: string }[];
    const trackingITTasks = (ttData || []) as { tracking_id: string; task_id: string }[];
    const packetIdsByTracking = new Map<string, string[]>();
    for (const tp of trackingPackets) {
      const arr = packetIdsByTracking.get(tp.tracking_id) || [];
      arr.push(tp.packet_id);
      packetIdsByTracking.set(tp.tracking_id, arr);
    }
    const formIdsByTracking = new Map<string, string[]>();
    for (const tf of trackingForms) {
      const arr = formIdsByTracking.get(tf.tracking_id) || [];
      arr.push(tf.form_id);
      formIdsByTracking.set(tf.tracking_id, arr);
    }
    const checklistIdsByTracking = new Map<string, string[]>();
    for (const tc of trackingChecklists) {
      const arr = checklistIdsByTracking.get(tc.tracking_id) || [];
      arr.push(tc.checklist_id);
      checklistIdsByTracking.set(tc.tracking_id, arr);
    }
    const taskIdsByTracking = new Map<string, string[]>();
    for (const tt of trackingITTasks) {
      const arr = taskIdsByTracking.get(tt.tracking_id) || [];
      arr.push(tt.task_id);
      taskIdsByTracking.set(tt.tracking_id, arr);
    }
    const formIds = [...new Set(trackingForms.map((tf: any) => tf.form_id))];
    let formMap = new Map<string, { id: string; name: string }>();
    if (formIds.length > 0) {
      const { data: formRows } = await supabase.schema('common').from('onboarding_e_sign_forms').select('id, name').in('id', formIds);
      (formRows || []).forEach((f: any) => formMap.set(f.id, { id: f.id, name: f.name || 'Form' }));
    }
    const checklistIds = [...new Set(trackingChecklists.map((tc: any) => tc.checklist_id))];
    let checklistMap = new Map<string, { id: string; name: string }>();
    if (checklistIds.length > 0) {
      const { data: checklistRows } = await supabase.schema('common').from('onboarding_checklists').select('id, name').in('id', checklistIds);
      (checklistRows || []).forEach((c: any) => checklistMap.set(c.id, { id: c.id, name: c.name || 'Checklist' }));
    }
    const taskIds = [...new Set(trackingITTasks.map((tt: any) => tt.task_id))];
    let taskMap = new Map<string, { id: string; name: string; status: string }>();
    if (taskIds.length > 0) {
      const { data: taskRows } = await supabase.schema('common').from('it_equipment_tasks').select('id, name, status').in('id', taskIds);
      (taskRows || []).forEach((t: any) => taskMap.set(t.id, { id: t.id, name: t.name || 'IT Task', status: t.status || 'pending' }));
    }
    const packetMap = new Map((packets || []).map((p: any) => [p.id, p]));
    const offerMap = new Map((offers || []).map((o: any) => [o.id, o]));

    let userMap = new Map<string, { id: string; email: string; name?: string }>();
    try {
      const { data: usersData } = await supabase.schema('common').rpc('admin_get_users');
      const allUsers = (usersData || []) as any[];
      const u = allUsers.find((x: any) => x.id === userId);
      if (u) {
        const name = u.raw_user_meta_data?.name || u.user_metadata?.name || u.email?.split('@')[0] || '';
        userMap.set(userId, { id: u.id, email: u.email || '', name: name || undefined });
      }
    } catch {
      // ignore
    }
    const userInfo = userMap.get(userId);

    return list.map(r => {
      const pids = packetIdsByTracking.get(r.id) || [];
      if (r.new_hire_packet_id && !pids.includes(r.new_hire_packet_id)) pids.unshift(r.new_hire_packet_id);
      const assigned_packets = pids.map(pid => ({ id: pid, name: (packetMap.get(pid) as any)?.name || 'Packet' }));
      const fids = formIdsByTracking.get(r.id) || [];
      const assigned_forms = fids.map(fid => formMap.get(fid) || { id: fid, name: 'Form' });
      const cids = checklistIdsByTracking.get(r.id) || [];
      const assigned_checklists = cids.map(cid => checklistMap.get(cid) || { id: cid, name: 'Checklist' });
      const tids = taskIdsByTracking.get(r.id) || [];
      const assigned_it_tasks = tids.map(tid => taskMap.get(tid) || { id: tid, name: 'IT Task', status: 'pending' });
      return {
        ...r,
        assigned_packet_ids: pids,
        assigned_packets,
        assigned_forms,
        assigned_checklists,
        assigned_it_tasks,
        offer: r.offer_id ? offerMap.get(r.offer_id) : undefined,
        user: userInfo,
      };
    });
  },

  async getTrackingByOfferId(offerId: string): Promise<OnboardingTrackingRecord | null> {
    const { data, error } = await supabase
      .schema('common')
      .from('onboarding_tracking')
      .select('*')
      .eq('offer_id', offerId)
      .single();

    if (error || !data) return null;
    return data as OnboardingTrackingRecord;
  },

  async createOnboardingFromOffer(offerId: string, userId: string): Promise<OnboardingTrackingRecord> {
    const { data: offer, error: offerErr } = await supabase
      .schema('common')
      .from('offers')
      .select('id, candidate_id, position_title, department, status')
      .eq('id', offerId)
      .single();

    if (offerErr || !offer) throw new Error('Offer not found');
    if ((offer as any).status !== 'accepted') throw new Error('Only accepted offers can be sent to onboarding');

    const existing = await this.getTrackingByOfferId(offerId);
    if (existing) throw new Error('This offer is already in onboarding');

    const { data: candidate } = await supabase
      .schema('common')
      .from('candidates')
      .select('id, first_name, last_name, email')
      .eq('id', (offer as any).candidate_id)
      .single();

    const { data: tracking, error: trackErr } = await supabase
      .schema('common')
      .from('onboarding_tracking')
      .insert({
        candidate_id: (offer as any).candidate_id,
        offer_id: offerId,
        new_hire_packet_id: null,
        status: 'pending',
        created_by: userId,
      })
      .select()
      .single();

    if (trackErr) {
      console.error('Error creating onboarding tracking:', trackErr);
      throw trackErr;
    }

    return {
      ...tracking,
      candidate: candidate || undefined,
      offer: { id: (offer as any).id, position_title: (offer as any).position_title, department: (offer as any).department },
    } as OnboardingTrackingRecord;
  },

  /** Add an ampOS user to onboarding tracking (assign person to onboarding). */
  async createOnboardingTrackingForUser(assignedUserId: string, createdBy: string): Promise<OnboardingTrackingRecord> {
    const { data: tracking, error: trackErr } = await supabase
      .schema('common')
      .from('onboarding_tracking')
      .insert({
        candidate_id: null,
        offer_id: null,
        user_id: assignedUserId,
        new_hire_packet_id: null,
        status: 'pending',
        created_by: createdBy,
      })
      .select()
      .single();

    if (trackErr) {
      console.error('Error creating onboarding tracking for user:', trackErr);
      throw trackErr;
    }
    const list = await this.getOnboardingTrackingList();
    return list.find(r => r.id === (tracking as any).id) as OnboardingTrackingRecord;
  },

  async assignPacketToTracking(trackingId: string, templatePacketId: string, userId: string): Promise<OnboardingTrackingRecord> {
    const { data: tracking, error: trackErr } = await supabase
      .schema('common')
      .from('onboarding_tracking')
      .select('*')
      .eq('id', trackingId)
      .single();

    if (trackErr || !tracking) throw new Error('Onboarding record not found');

    const template = await this.getPacketById(templatePacketId);
    if (!template) throw new Error('Packet not found');

    const trackingAny = tracking as any;
    let displayName: string;
    let offerId: string | null = trackingAny.offer_id ?? null;
    let employeeId: string | null = null;

    if (trackingAny.user_id) {
      employeeId = trackingAny.user_id;
      try {
        const { data: usersData } = await supabase.schema('common').rpc('admin_get_users');
        const allUsers = (usersData || []) as any[];
        const u = allUsers.find((x: any) => x.id === trackingAny.user_id);
        displayName = u?.raw_user_meta_data?.name || u?.user_metadata?.name || u?.email || 'User';
      } catch {
        displayName = 'User';
      }
    } else {
      const { data: candidate } = await supabase
        .schema('common')
        .from('candidates')
        .select('first_name, last_name')
        .eq('id', trackingAny.candidate_id)
        .single();
      displayName = candidate
        ? `${(candidate as any).first_name} ${(candidate as any).last_name}`.trim() || 'New Hire'
        : 'New Hire';
    }

    const packet = await this.createPacket({
      name: `${template.name} – ${displayName}`,
      description: template.description || undefined,
      packet_type: template.packet_type,
      documents: Array.isArray(template.documents) ? [...template.documents] : [],
      instructions: template.instructions || undefined,
      custom_fields: template.custom_fields ? { ...template.custom_fields } : {},
      employee_id: employeeId,
      offer_id: offerId,
      status: 'active',
      is_template: false,
      created_by: userId,
    });

    const isFirst = !(tracking as any).new_hire_packet_id;
    if (isFirst) {
      const { error: updateErr } = await supabase
        .schema('common')
        .from('onboarding_tracking')
        .update({ new_hire_packet_id: packet.id })
        .eq('id', trackingId);
      if (updateErr) throw updateErr;
    }

    const { error: linkErr } = await supabase
      .schema('common')
      .from('onboarding_tracking_packets')
      .insert({ tracking_id: trackingId, packet_id: packet.id });

    if (linkErr) {
      if (linkErr.code === '23505') {
        const list = await this.getOnboardingTrackingList();
        return list.find(r => r.id === trackingId) as OnboardingTrackingRecord;
      }
      if (linkErr.code === '42P01' || (linkErr.message && /relation.*does not exist/i.test(linkErr.message))) {
        const list = await this.getOnboardingTrackingList();
        return list.find(r => r.id === trackingId) as OnboardingTrackingRecord;
      }
      throw linkErr;
    }

    const list = await this.getOnboardingTrackingList();
    return list.find(r => r.id === trackingId) as OnboardingTrackingRecord;
  },

  /** Assign an E-Sign form to an onboarding tracking record. Employee sees it in Your Onboarding. */
  async assignFormToTracking(trackingId: string, formId: string): Promise<void> {
    const { error } = await supabase
      .schema('common')
      .from('onboarding_tracking_forms')
      .insert({ tracking_id: trackingId, form_id: formId });
    if (error) {
      if (error.code === '23505') return; // already assigned
      throw error;
    }
  },

  /** Remove an E-Sign form from an onboarding tracking record. */
  async removeFormFromTracking(trackingId: string, formId: string): Promise<void> {
    await supabase
      .schema('common')
      .from('onboarding_tracking_forms')
      .delete()
      .eq('tracking_id', trackingId)
      .eq('form_id', formId);
  },

  /** Assign a checklist to an onboarding tracking record. If tracking has user_id, also creates a checklist assignment so the employee can complete items. */
  async assignChecklistToTracking(trackingId: string, checklistId: string, assignedBy: string): Promise<void> {
    const { data: tracking, error: trackErr } = await supabase
      .schema('common')
      .from('onboarding_tracking')
      .select('user_id')
      .eq('id', trackingId)
      .single();
    if (trackErr || !tracking) throw new Error('Onboarding record not found');
    const { error } = await supabase
      .schema('common')
      .from('onboarding_tracking_checklists')
      .insert({ tracking_id: trackingId, checklist_id: checklistId });
    if (error) {
      if (error.code === '23505') return;
      throw error;
    }
    const userId = (tracking as any).user_id;
    if (userId) {
      const existing = await this.getChecklistAssignments(userId, checklistId);
      if (existing.length === 0) {
        await this.createChecklistAssignment({
          checklist_id: checklistId,
          employee_id: userId,
          assigned_by: assignedBy,
          items_completed: [],
          completion_percentage: 0,
          status: 'not_started',
          assigned_at: new Date().toISOString(),
        } as any);
      }
    }
  },

  /** Remove a checklist from an onboarding tracking record. */
  async removeChecklistFromTracking(trackingId: string, checklistId: string): Promise<void> {
    await supabase
      .schema('common')
      .from('onboarding_tracking_checklists')
      .delete()
      .eq('tracking_id', trackingId)
      .eq('checklist_id', checklistId);
  },

  /** Assign an IT/Equipment task to onboarding tracking. Clones the task and assigns to the tracking user (employee_id). */
  async assignITTaskToTracking(trackingId: string, templateTaskId: string, assignedBy: string): Promise<void> {
    const { data: tracking, error: trackErr } = await supabase
      .schema('common')
      .from('onboarding_tracking')
      .select('user_id')
      .eq('id', trackingId)
      .single();
    if (trackErr || !tracking) throw new Error('Onboarding record not found');
    const template = await this.getITEquipmentTaskById(templateTaskId);
    if (!template) throw new Error('IT task not found');
    const userId = (tracking as any).user_id;
    const newTask = await this.createITEquipmentTask({
      name: template.name,
      description: template.description,
      task_type: template.task_type,
      equipment_category: template.equipment_category,
      equipment_specs: template.equipment_specs || {},
      software_requirements: Array.isArray(template.software_requirements) ? template.software_requirements : [],
      access_requirements: Array.isArray(template.access_requirements) ? template.access_requirements : [],
      employee_id: userId || undefined,
      assigned_to_user_id: template.assigned_to_user_id,
      packet_id: template.packet_id,
      status: 'pending',
      priority: template.priority || 'medium',
      equipment_assigned: [],
      notes: template.notes,
      is_template: false,
      created_by: assignedBy,
    });
    const { error } = await supabase
      .schema('common')
      .from('onboarding_tracking_it_tasks')
      .insert({ tracking_id: trackingId, task_id: newTask.id });
    if (error) {
      if (error.code === '23505') return;
      throw error;
    }
  },

  /** Remove an IT/Equipment task link from onboarding tracking (does not delete the task). */
  async removeITTaskFromTracking(trackingId: string, taskId: string): Promise<void> {
    await supabase
      .schema('common')
      .from('onboarding_tracking_it_tasks')
      .delete()
      .eq('tracking_id', trackingId)
      .eq('task_id', taskId);
  },

  async updateOnboardingTrackingPacket(trackingId: string, new_hire_packet_id: string | null): Promise<OnboardingTrackingRecord> {
    const { data, error } = await supabase
      .schema('common')
      .from('onboarding_tracking')
      .update({ new_hire_packet_id })
      .eq('id', trackingId)
      .select()
      .single();

    if (error) throw error;
    return data as OnboardingTrackingRecord;
  },

  async updateOnboardingTrackingStatus(id: string, status: 'pending' | 'in_progress' | 'completed'): Promise<OnboardingTrackingRecord> {
    const { data, error } = await supabase
      .schema('common')
      .from('onboarding_tracking')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as OnboardingTrackingRecord;
  },

  /** Remove a person from onboarding tracking (deletes the tracking record; packets remain but are unlinked). */
  async deleteOnboardingTracking(id: string): Promise<void> {
    const { error } = await supabase
      .schema('common')
      .from('onboarding_tracking')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // ============================================================================
  // Packet document signatures (Sign and Send from document viewer)
  // ============================================================================

  async submitPacketDocumentSignature(params: {
    packet_id: string;
    document_name: string;
    document_file_url?: string;
    signer_name: string;
    signer_email: string;
    signature_image: string;
  }): Promise<void> {
    const { error } = await supabase
      .schema('common')
      .from('onboarding_packet_document_signatures')
      .insert({
        packet_id: params.packet_id,
        document_name: params.document_name,
        document_file_url: params.document_file_url || null,
        signer_name: params.signer_name,
        signer_email: params.signer_email,
        signature_image: params.signature_image,
      });

    if (error) throw error;
  },

  async getPacketDocumentSignatures(packetId?: string): Promise<Array<{
    id: string;
    packet_id: string;
    document_name: string;
    document_file_url: string | null;
    signer_name: string;
    signer_email: string;
    signed_at: string;
    created_at: string;
  }>> {
    let query = supabase
      .schema('common')
      .from('onboarding_packet_document_signatures')
      .select('id, packet_id, document_name, document_file_url, signer_name, signer_email, signed_at, created_at')
      .order('signed_at', { ascending: false });
    if (packetId) query = query.eq('packet_id', packetId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as any[];
  },
};
