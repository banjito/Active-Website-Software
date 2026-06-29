import { supabase } from '../supabase';
import { SCHEMAS } from '../schema';
import { 
  TechnicianAvailability,
  TechnicianException,
  TechnicianSkill,
  TechnicianAssignment,
  JobSkillRequirement,
  AvailableTechnician,
  TechnicianMatch,
  CalendarEvent, 
  PortalType,
  AssignmentStatus,
  TimeOffRequest,
  TimeOffStatus
} from '../types/scheduling';
import { PostgrestError } from '@supabase/supabase-js';
import dayjs from 'dayjs';

/**
 * Helper functions to always derive name from email (firstname.lastname format)
 */
const deriveNameFromEmail = (email?: string | null): string | null => {
  if (!email) return null;
  const lower = String(email).toLowerCase();
  const m = lower.match(/^([a-z]+)\.([a-z]+)@ampqes\.com$/i);
  if (!m) return null;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return `${cap(m[1])} ${cap(m[2])}`;
};

// Set of user ids that have been deactivated (soft-deleted). Used to hide
// removed staff from technician pickers without touching the DB views/RPCs.
const getDeactivatedUserIds = async (): Promise<Set<string>> => {
  try {
    const { data, error } = await supabase
      .schema('common')
      .from('profiles')
      .select('id')
      .eq('is_active', false);
    if (error || !data) return new Set();
    return new Set(data.map((r: { id: string }) => r.id));
  } catch {
    // If the column/migration isn't present yet, fail open (show everyone).
    return new Set();
  }
};

const formatDisplayName = (name?: string, email?: string): string => {
  // Always prioritize email-derived name (firstname.lastname format)
  const derived = deriveNameFromEmail(email);
  if (derived) return derived;
  
  // Fallback to provided name or email
  const n = (name || '').trim();
  return n || email || 'Unknown';
};

/**
 * Service for managing technician scheduling
 */
export const schedulingService = {
  /**
   * Fetch all availabilities for a technician
   */
  async getTechnicianAvailability(technicianId: string, portalType: PortalType): Promise<{
    data: TechnicianAvailability[] | null;
    error: PostgrestError | null;
  }> {
    return supabase
      .schema('common')
      .from('technician_availability')
      .select('*')
      .eq('user_id', technicianId)
      .eq('portal_type', portalType)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });
  },

  /**
   * Create or update technician availability
   */
  async saveTechnicianAvailability(availability: Omit<TechnicianAvailability, 'id' | 'created_at' | 'updated_at'>): Promise<{
    data: TechnicianAvailability | null;
    error: PostgrestError | null;
  }> {
    // Check if this availability already exists
    const { data: existing } = await supabase
      .schema('common')
      .from('technician_availability')
      .select('id')
      .eq('user_id', availability.user_id)
      .eq('day_of_week', availability.day_of_week)
      .eq('start_time', availability.start_time)
      .eq('portal_type', availability.portal_type)
      .eq('division', availability.division || '')
      .maybeSingle();

    if (existing) {
      // Update existing
      return supabase
        .schema('common')
        .from('technician_availability')
        .update({
          end_time: availability.end_time,
          recurring: availability.recurring
        })
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      // Insert new
      return supabase
        .schema('common')
        .from('technician_availability')
        .insert(availability)
        .select()
        .single();
    }
  },

  /**
   * Delete a technician availability slot
   */
  async deleteTechnicianAvailability(availabilityId: string): Promise<{
    error: PostgrestError | null;
  }> {
    return supabase
      .schema('common')
      .from('technician_availability')
      .delete()
      .eq('id', availabilityId);
  },

  /**
   * Fetch exceptions for a technician in a date range
   */
  async getTechnicianExceptions(
    technicianId: string, 
    portalType: PortalType, 
    startDate: string, 
    endDate: string
  ): Promise<{
    data: TechnicianException[] | null;
    error: PostgrestError | null;
  }> {
    return supabase
      .schema('common')
      .from('technician_exceptions')
      .select('*')
      .eq('user_id', technicianId)
      .eq('portal_type', portalType)
      .gte('exception_date', startDate)
      .lte('exception_date', endDate)
      .order('exception_date', { ascending: true });
  },

  /**
   * Create or update technician exception
   */
  async saveTechnicianException(exception: Omit<TechnicianException, 'id' | 'created_at' | 'updated_at'>): Promise<{
    data: TechnicianException | null;
    error: PostgrestError | null;
  }> {
    // Check if this exception already exists
    const { data: existing } = await supabase
      .schema('common')
      .from('technician_exceptions')
      .select('id')
      .eq('user_id', exception.user_id)
      .eq('exception_date', exception.exception_date)
      .eq('portal_type', exception.portal_type)
      .eq('division', exception.division || '')
      .maybeSingle();

    if (existing) {
      // Update existing
      return supabase
        .schema('common')
        .from('technician_exceptions')
        .update({
          is_available: exception.is_available,
          start_time: exception.start_time,
          end_time: exception.end_time,
          reason: exception.reason
        })
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      // Insert new
      return supabase
        .schema('common')
        .from('technician_exceptions')
        .insert(exception)
        .select()
        .single();
    }
  },

  /**
   * Delete a technician exception
   */
  async deleteTechnicianException(exceptionId: string): Promise<{
    error: PostgrestError | null;
  }> {
    return supabase
      .schema('common')
      .from('technician_exceptions')
      .delete()
      .eq('id', exceptionId);
  },

  /**
   * Fetch skills for a technician
   */
  async getTechnicianSkills(technicianId: string, portalType: PortalType): Promise<{
    data: TechnicianSkill[] | null;
    error: PostgrestError | null;
  }> {
    return supabase
      .from(SCHEMAS.TECH_SKILLS)
      .select('*')
      .eq('user_id', technicianId)
      .eq('portal_type', portalType)
      .order('skill_name', { ascending: true });
  },

  /**
   * Save a technician skill
   */
  async saveTechnicianSkill(skill: Omit<TechnicianSkill, 'id' | 'created_at' | 'updated_at'>): Promise<{
    data: TechnicianSkill | null;
    error: PostgrestError | null;
  }> {
    // Check if this skill already exists
    const { data: existing } = await supabase
      .from(SCHEMAS.TECH_SKILLS)
      .select('id')
      .eq('user_id', skill.user_id)
      .eq('skill_name', skill.skill_name)
      .eq('portal_type', skill.portal_type)
      .maybeSingle();

    if (existing) {
      // Update existing
      return supabase
        .from(SCHEMAS.TECH_SKILLS)
        .update({
          proficiency_level: skill.proficiency_level,
          certification: skill.certification,
          certification_date: skill.certification_date,
          expiration_date: skill.expiration_date,
          notes: skill.notes
        })
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      // Insert new
      return supabase
        .from(SCHEMAS.TECH_SKILLS)
        .insert(skill)
        .select()
        .single();
    }
  },

  /**
   * Delete a technician skill
   */
  async deleteTechnicianSkill(skillId: string): Promise<{
    error: PostgrestError | null;
  }> {
    return supabase
      .from(SCHEMAS.TECH_SKILLS)
      .delete()
      .eq('id', skillId);
  },

  /**
   * Fetch assignments for a technician in a date range
   */
  async getTechnicianAssignments(
    technicianId: string | undefined,
    portalType: PortalType,
    startDate: string,
    endDate: string,
    division?: string
  ): Promise<{
    data: TechnicianAssignment[] | null;
    error: PostgrestError | null;
  }> {
    // Select required fields and join with users and jobs
    // Note: Joining jobs might need adjustment based on portalType
    // This example assumes neta_ops.jobs for portalType 'neta'
    // Avoid cross-schema embeds to prevent PostgREST 400s; fetch flat rows
    let query = supabase
      .schema('common')
      .from('technician_assignments')
      .select('*')
      .eq('portal_type', portalType)
      .gte('assignment_date', startDate)
      .lte('assignment_date', endDate);

    if (technicianId) {
      query = query.eq('user_id', technicianId);
    }
    if (division) {
      query = query.eq('division', division);
    }

    query = query.order('assignment_date', { ascending: true }).order('start_time', { ascending: true });
    
    // Execute base query
    const base = await query;
    if (base.error || !base.data || base.data.length === 0) {
      return { data: base.data as any, error: base.error };
    }

    // Enrich with user/job in parallel (best-effort; tolerate failures)
    const rows = base.data as any[];
    const enriched = await Promise.all(rows.map(async (r) => {
      let user = undefined as any;
      let job = undefined as any;
      try {
        const u = await supabase
          .schema('auth')
          .from('users')
          .select('id, email, raw_user_meta_data')
          .eq('id', r.user_id)
          .single();
        if (!u.error && u.data) {
          // Map raw_user_meta_data to user_metadata for consistency
          user = {
            id: u.data.id,
            email: u.data.email,
            user_metadata: u.data.raw_user_meta_data
          };
          console.log('[schedulingService] Enriched user:', { user_id: r.user_id, email: u.data.email });
        } else {
          console.warn('[schedulingService] No user data for:', r.user_id, u.error);
        }
      } catch (e) {
        console.error('[schedulingService] Error fetching user:', r.user_id, e);
      }
      try {
        const j = await supabase
          .schema('neta_ops')
          .from('jobs')
          .select('id, job_number, title')
          .eq('id', r.job_id)
          .single();
        if (!j.error) job = j.data;
      } catch {}
      return { ...r, user, job };
    }));

    return { data: enriched as any, error: null };
  },

  /**
   * Save a technician assignment
   */
  async saveTechnicianAssignment(
    assignment: Omit<TechnicianAssignment, 'id' | 'created_at' | 'updated_at' | 'user' | 'job' | 'createdBy'>
  ): Promise<{
    data: TechnicianAssignment | null;
    error: PostgrestError | null;
  }> {
    const { data: existing } = await supabase
      .schema('common')
      .from('technician_assignments')
      .select('id')
      .eq('user_id', assignment.user_id)
      .eq('job_id', assignment.job_id)
      .eq('assignment_date', assignment.assignment_date)
      .eq('start_time', assignment.start_time)
      .maybeSingle();

    let result;
    if (existing) {
      // Update existing
      result = await supabase
        .schema('common')
        .from('technician_assignments')
        .update({
          end_time: assignment.end_time,
          status: assignment.status,
          notes: assignment.notes
        })
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      // Insert new
      result = await supabase
        .schema('common')
        .from('technician_assignments')
        .insert(assignment)
        .select()
        .single();
    }

    if (result.error || !result.data) {
      return result;
    }

    // Enrich with user and job data
    let user = undefined as any;
    let job = undefined as any;
    
    try {
      const u = await supabase
        .schema('auth')
        .from('users')
        .select('id, email, raw_user_meta_data')
        .eq('id', result.data.user_id)
        .single();
      if (!u.error && u.data) {
        user = {
          id: u.data.id,
          email: u.data.email,
          user_metadata: u.data.raw_user_meta_data
        };
      }
    } catch {}
    
    try {
      const j = await supabase
        .schema('neta_ops')
        .from('jobs')
        .select('id, job_number, title')
        .eq('id', result.data.job_id)
        .single();
      if (!j.error) job = j.data;
    } catch {}

    return { data: { ...result.data, user, job } as any, error: null };
  },

  /**
   * Update assignment status
   */
  async updateAssignmentStatus(
    assignmentId: string, 
    status: AssignmentStatus
  ): Promise<{
    data: TechnicianAssignment | null;
    error: PostgrestError | null;
  }> {
    const result = await supabase
      .schema('common')
      .from('technician_assignments')
      .update({ status })
      .eq('id', assignmentId)
      .select()
      .single();

    if (result.error || !result.data) {
      return result;
    }

    // Enrich with user and job data
    let user = undefined as any;
    let job = undefined as any;
    
    try {
      const u = await supabase
        .schema('auth')
        .from('users')
        .select('id, email, raw_user_meta_data')
        .eq('id', result.data.user_id)
        .single();
      if (!u.error && u.data) {
        user = {
          id: u.data.id,
          email: u.data.email,
          user_metadata: u.data.raw_user_meta_data
        };
      }
    } catch {}
    
    try {
      const j = await supabase
        .schema('neta_ops')
        .from('jobs')
        .select('id, job_number, title')
        .eq('id', result.data.job_id)
        .single();
      if (!j.error) job = j.data;
    } catch {}

    return { data: { ...result.data, user, job } as any, error: null };
  },

  /**
   * Delete a technician assignment
   */
  async deleteTechnicianAssignment(assignmentId: string): Promise<{
    error: PostgrestError | null;
  }> {
    return supabase
      .schema('common')
      .from('technician_assignments')
      .delete()
      .eq('id', assignmentId);
  },

  /**
   * Delete assignments by job, optionally scoped from a start date (inclusive),
   * and optionally constrained by portal/division.
   */
  async deleteAssignmentsByJob(options: {
    jobId: string;
    fromDate?: string; // YYYY-MM-DD
    portalType?: PortalType;
    division?: string;
  }): Promise<{ error: PostgrestError | null }> {
    let q = supabase
      .schema('common')
      .from('technician_assignments')
      .delete()
      .eq('job_id', options.jobId);

    if (options.fromDate) {
      q = q.gte('assignment_date', options.fromDate);
    }
    if (options.portalType) {
      q = q.eq('portal_type', options.portalType);
    }
    if (options.division) {
      q = q.eq('division', options.division);
    }

    const { error } = await q;
    return { error };
  },

  /**
   * Fetch job skill requirements
   */
  async getJobSkillRequirements(jobId: string, portalType: PortalType): Promise<{
    data: JobSkillRequirement[] | null;
    error: PostgrestError | null;
  }> {
    return supabase
      .from(SCHEMAS.JOB_SKILL_REQUIREMENTS)
      .select('*')
      .eq('job_id', jobId)
      .eq('portal_type', portalType)
      .order('is_required', { ascending: false })
      .order('skill_name', { ascending: true });
  },

  /**
   * Save a job skill requirement
   */
  async saveJobSkillRequirement(
    requirement: Omit<JobSkillRequirement, 'id' | 'created_at' | 'updated_at' | 'job'>
  ): Promise<{
    data: JobSkillRequirement | null;
    error: PostgrestError | null;
  }> {
    const { data: existing } = await supabase
      .from(SCHEMAS.JOB_SKILL_REQUIREMENTS)
      .select('id')
      .eq('job_id', requirement.job_id)
      .eq('skill_name', requirement.skill_name)
      .maybeSingle();

    if (existing) {
      // Update existing
      return supabase
        .from(SCHEMAS.JOB_SKILL_REQUIREMENTS)
        .update({
          minimum_proficiency: requirement.minimum_proficiency,
          is_required: requirement.is_required
        })
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      // Insert new
      return supabase
        .from(SCHEMAS.JOB_SKILL_REQUIREMENTS)
        .insert(requirement)
        .select()
        .single();
    }
  },

  /**
   * Delete a job skill requirement
   */
  async deleteJobSkillRequirement(requirementId: string): Promise<{
    error: PostgrestError | null;
  }> {
    return supabase
      .from(SCHEMAS.JOB_SKILL_REQUIREMENTS)
      .delete()
      .eq('id', requirementId);
  },

  /**
   * Find available technicians with skill matching
   */
  async findAvailableTechnicians(
    jobId: string,
    assignmentDate: string,
    startTime: string,
    endTime: string,
    portalType: PortalType
  ): Promise<{
    data: TechnicianMatch[] | null;
    error: PostgrestError | null;
  }> {
    // Call the stored procedure
    const result = await supabase
      .rpc('find_available_technicians', {
        job_id: jobId,
        assignment_date: assignmentDate,
        start_time: startTime,
        end_time: endTime,
        portal: portalType
      });

    // Drop any deactivated (soft-deleted) technicians from the picker.
    if (!result.error && Array.isArray(result.data)) {
      const deactivated = await getDeactivatedUserIds();
      if (deactivated.size) {
        return {
          ...result,
          data: result.data.filter(
            (t: TechnicianMatch) => !deactivated.has(t.user_id),
          ),
        };
      }
    }
    return result;
  },

  /**
   * Get all available technicians and their schedules
   */
  async getAvailableTechnicians(portalType: PortalType, division?: string): Promise<{
    data: AvailableTechnician[] | null;
    error: PostgrestError | null;
  }> {
    // First try the common.available_technicians view
    let query = supabase
      .schema('common')
      .from('available_technicians')
      .select('*')
      .eq('portal_type', portalType);

    if (division) {
      query = query.eq('division', division);
    }

    // Ids of removed staff, so they don't appear as schedulable technicians.
    const deactivated = await getDeactivatedUserIds();
    const stripDeactivated = (rows: any[] | null) =>
      deactivated.size && Array.isArray(rows)
        ? rows.filter((r) => !deactivated.has(r.user_id))
        : rows;

    const first = await query.order('division').order('full_name').order('day_of_week').order('start_time');
    if (!first.error && first.data && first.data.length) {
      return { ...first, data: stripDeactivated(first.data) } as any;
    }

    // Fallback to neta_ops.available_technicians if common view isn't present
    const fallback = await supabase
      .schema('common')
      .from('technician_availability')
      .select(`
        user_id,
        full_name: user_id!inner ( raw_user_meta_data ),
        email: user_id!inner ( email ),
        division,
        portal_type,
        day_of_week,
        start_time,
        end_time
      `)
      .eq('portal_type', portalType)
      .order('division')
      .order('day_of_week')
      .order('start_time');
    if (!fallback.error && Array.isArray(fallback.data)) {
      return { ...fallback, data: stripDeactivated(fallback.data) } as any;
    }
    return fallback as any;
  },

  /**
   * Convert assignments and exceptions to calendar events
   */
  convertToCalendarEvents(
    assignments: TechnicianAssignment[],
    exceptions: TechnicianException[] = []
  ): CalendarEvent[] {
    const events: CalendarEvent[] = [];

    // Group assignments by job + date + exact time window
    const groups = new Map<string, {
      jobId: string;
      jobNumber: string;
      jobTitle: string;
      date: string;
      startTime: string;
      endTime: string;
      status: AssignmentStatus;
      technicians: Array<{ id: string; name?: string; start_time?: string; end_time?: string; assignment_id?: string }>
    }>();

    assignments.forEach((assignment) => {
      const date = assignment.assignment_date;
      const jobId = assignment.job_id ?? 'unknown-job';
      const key = `${date}|${jobId}|${assignment.start_time}|${assignment.end_time}`;
      const jobTitle = assignment.job?.title ?? 'Job Details Missing';
      const jobNumber = assignment.job?.job_number ?? '';
      const techName = formatDisplayName(assignment.user?.user_metadata?.name, assignment.user?.email);
      const techId = assignment.user_id ?? 'unknown-user';

      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          jobId,
          jobNumber,
          jobTitle,
          date,
          startTime: assignment.start_time,
          endTime: assignment.end_time,
          status: assignment.status,
          technicians: [{ id: techId, name: techName, start_time: assignment.start_time, end_time: assignment.end_time, assignment_id: String(assignment.id) }],
        });
      } else {
        // Prefer non-cancelled status if any
        if (existing.status === 'cancelled' && assignment.status !== 'cancelled') {
          existing.status = assignment.status;
        }
        existing.technicians.push({ id: techId, name: techName, start_time: assignment.start_time, end_time: assignment.end_time, assignment_id: String(assignment.id) });
      }
    });

    // Create one event per group
    for (const [, group] of groups) {
      // Check if it's an all-day event (00:00 to 23:59)
      const isAllDay = (group.startTime.startsWith('00:00') && 
                       (group.endTime.startsWith('23:59') || group.endTime.startsWith('23:58')));
      
      events.push({
        id: `assignment-group-${group.jobId}-${group.date}`,
        title: `${group.jobNumber ? `[${group.jobNumber}] ` : ''}${group.jobTitle}`,
        start: `${group.date}T${group.startTime}`,
        end: `${group.date}T${group.endTime}`,
        allDay: isAllDay,
        source: 'assignment_group',
        status: group.status,
        color: this.getStatusColor(group.status),
        job: {
          id: group.jobId,
          number: group.jobNumber,
          title: group.jobTitle,
        },
        technicians: group.technicians,
        editable: group.status !== 'completed' && group.status !== 'cancelled',
        tooltip: `Technicians: ${group.technicians.map(t => t.name || t.id).join(', ')}`,
      });
    }

    // Add exceptions
    exceptions.forEach(exception => {
      // Exception data might not have user joined, fallback safely
      const technicianName = exception.user?.user_metadata?.name ?? exception.user?.email ?? 'Unknown Technician';
      const technicianId = exception.user_id ?? 'unknown-user';
      
      if (!exception.is_available) {
        // All-day unavailability
        events.push({
          id: `exception-${exception.id}`,
          title: `Unavailable: ${technicianName}`,
          start: exception.exception_date,
          end: exception.exception_date,
          allDay: true,
          source: 'exception',
          color: '#e57373', // Light red
          technician: {
            id: technicianId,
            name: technicianName
          },
          editable: true,
          tooltip: exception.reason ? `Reason: ${exception.reason}` : 'Technician unavailable'
        });
      } else if (exception.start_time && exception.end_time) {
        // Partial day availability
        events.push({
          id: `exception-${exception.id}`,
          title: `Available: ${technicianName}`,
          start: `${exception.exception_date}T${exception.start_time}`,
          end: `${exception.exception_date}T${exception.end_time}`,
          allDay: false,
          source: 'exception',
          color: '#81c784', // Light green
          technician: {
            id: technicianId,
            name: technicianName
          },
          editable: true,
          tooltip: exception.reason ? `Reason: ${exception.reason}` : 'Technician available'
        });
      }
    });

    return events;
  },

  /**
   * Get color code for assignment status
   */
  getStatusColor(status?: AssignmentStatus): string {
    switch (status) {
      case 'scheduled':
        return '#42a5f5'; // Light blue
      case 'in-progress':
        return '#ffb74d'; // Light orange
      case 'completed':
        return '#81c784'; // Light green
      case 'cancelled':
        return '#e57373'; // Light red
      default:
        return '#90a4ae'; // Light blue-grey
    }
  },

  /**
   * Fetch all time-off requests for a technician or for approval
   */
  async getTimeOffRequests(options: {
    technicianId?: string;
    portalType: PortalType;
    division?: string;
    status?: TimeOffStatus;
    startDate?: string;
    endDate?: string;
    forApproval?: boolean;
  }): Promise<{
    data: TimeOffRequest[] | null;
    error: PostgrestError | null;
  }> {
    let query = supabase
      .from(SCHEMAS.TECH_TIME_OFF)
      .select(`
        *,
        user:user_id(
          id,
          email,
          user_metadata
        ),
        approver:approver_id(
          id,
          email,
          user_metadata
        )
      `)
      .eq('portal_type', options.portalType);
    
    if (options.technicianId) {
      query = query.eq('user_id', options.technicianId);
    }
    
    if (options.division) {
      query = query.eq('division', options.division);
    }
    
    if (options.status) {
      query = query.eq('status', options.status);
    }
    
    if (options.startDate && options.endDate) {
      // Find any requests that overlap with the specified date range
      query = query.or(`start_date.lte.${options.endDate},end_date.gte.${options.startDate}`);
    }

    // If for approval, get only pending requests that the current user can approve
    if (options.forApproval) {
      query = query.eq('status', 'pending');
    }
    
    // Sort by start date (most recent first) and status (pending first)
    return query
      .order('status', { ascending: true })
      .order('start_date', { ascending: false });
  },

  /**
   * Create a new time-off request
   */
  async createTimeOffRequest(request: Omit<TimeOffRequest, 'id' | 'created_at' | 'updated_at' | 'user' | 'approver'>): Promise<{
    data: TimeOffRequest | null;
    error: PostgrestError | null;
  }> {
    return supabase
      .from(SCHEMAS.TECH_TIME_OFF)
      .insert(request)
      .select(`
        *,
        user:user_id(
          id,
          email,
          user_metadata
        )
      `)
      .single();
  },

  /**
   * Update time-off request status (approve/reject)
   */
  async updateTimeOffRequestStatus(
    requestId: string,
    status: TimeOffStatus,
    approverId: string,
    notes?: string
  ): Promise<{
    data: TimeOffRequest | null;
    error: PostgrestError | null;
  }> {
    return supabase
      .from(SCHEMAS.TECH_TIME_OFF)
      .update({
        status,
        approver_id: approverId,
        notes: notes || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId)
      .select(`
        *,
        user:user_id(
          id,
          email,
          user_metadata
        ),
        approver:approver_id(
          id,
          email,
          user_metadata
        )
      `)
      .single();
  },

  /**
   * Cancel a time-off request
   */
  async cancelTimeOffRequest(requestId: string): Promise<{
    data: null;
    error: PostgrestError | null;
  }> {
    return supabase
      .from(SCHEMAS.TECH_TIME_OFF)
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId);
  },

  /**
   * Delete a time-off request (for administrators only)
   */
  async deleteTimeOffRequest(requestId: string): Promise<{
    data: null;
    error: PostgrestError | null;
  }> {
    return supabase
      .from(SCHEMAS.TECH_TIME_OFF)
      .delete()
      .eq('id', requestId);
  },
}; 