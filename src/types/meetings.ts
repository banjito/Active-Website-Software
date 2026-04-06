// TypeScript interfaces for the EOS-style meetings portal

export type ID = string;
export type ISODate = string;

// Team roles for meetings portal
export type TeamRole = 'admin' | 'manager' | 'member' | 'viewer';

// Meeting-specific types
export type AgendaItemType = 
  | 'scorecard'
  | 'rocks'
  | 'customer'
  | 'people'
  | 'headlines'
  | 'issues'
  | 'todoReview'
  | 'custom';

export type TodoStatus = 'open' | 'done' | 'blocked';
export type RockStatus = 'onTrack' | 'offTrack' | 'done';
export type IssueStatus = 'open' | 'inMeeting' | 'solved' | 'archived';
export type IssuePriority = 1 | 2 | 3; // 1=high, 2=medium, 3=low
export type RockConfidence = 0 | 1 | 2 | 3 | 4 | 5;
export type MetricCadence = 'weekly' | 'monthly';

// Core entity interfaces
export interface Person {
  id: ID;
  user_id: ID;
  team_id: ID;
  name: string;
  email: string;
  role: TeamRole;
  active: boolean;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface Team {
  id: ID;
  name: string;
  description?: string;
  created_at: ISODate;
  updated_at: ISODate;
  created_by: ID;
  active: boolean;
}

export interface Meeting {
  id: ID;
  team_id: ID;
  date: ISODate;
  title: string;
  ended: boolean;
  created_at: ISODate;
  updated_at: ISODate;
  created_by: ID;
  agenda_items?: AgendaItem[];
  notes?: Note[];
  issues_discussed?: ID[];
  todos_created?: ID[];
}

export interface AgendaItem {
  id: ID;
  meeting_id: ID;
  order_num: number;
  title: string;
  type: AgendaItemType;
  duration_min?: number;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface Note {
  id: ID;
  meeting_id: ID;
  text: string;
  created_by: ID;
  created_at: ISODate;
  linked_entity_type?: 'issue' | 'rock' | 'todo';
  linked_entity_id?: ID;
  decisions?: string[];
}

export interface Todo {
  id: ID;
  team_id: ID;
  title: string;
  owner_id?: ID;
  due_date?: string; // Date string
  status: TodoStatus;
  created_in_meeting_id?: ID;
  created_at: ISODate;
  updated_at: ISODate;
  owner?: Person; // Populated via join
}

export interface Metric {
  id: ID;
  team_id: ID;
  name: string;
  unit?: string;
  target?: number;
  threshold_low?: number;
  threshold_high?: number;
  owner_id?: ID;
  cadence: MetricCadence;
  archived: boolean;
  created_at: ISODate;
  updated_at: ISODate;
  owner?: Person; // Populated via join
  current_value?: number; // Latest metric point value
  trend?: 'up' | 'down' | 'stable'; // Calculated trend
}

export interface MetricPoint {
  id: ID;
  metric_id: ID;
  week_of: string; // Date string (Monday of week)
  value?: number;
  entered_by: ID;
  entered_at: ISODate;
}

export interface Rock {
  id: ID;
  team_id: ID;
  title: string;
  owner_id?: ID;
  quarter: string; // Format: "2024-Q1"
  status: RockStatus;
  confidence: RockConfidence;
  milestones?: RockMilestone[];
  created_at: ISODate;
  updated_at: ISODate;
  owner?: Person; // Populated via join
}

export interface RockMilestone {
  title: string;
  done: boolean;
}

export interface Issue {
  id: ID;
  team_id: ID;
  title: string;
  detail?: string;
  priority: IssuePriority;
  status: IssueStatus;
  owner_id?: ID;
  created_at: ISODate;
  resolved_at?: ISODate;
  updated_at: ISODate;
  owner?: Person; // Populated via join
}

export interface OrgNode {
  id: ID;
  team_id: ID;
  parent_id?: ID;
  title: string;
  person_id?: ID;
  roles: string[];
  order_num: number;
  created_at: ISODate;
  updated_at: ISODate;
  person?: Person; // Populated via join
  children?: OrgNode[]; // For tree structure
}

export interface VTO {
  id: ID;
  team_id: ID;
  version: number;
  sections: Record<string, string>; // JSON object with section names as keys
  updated_at: ISODate;
  updated_by: ID;
}

// Junction table interfaces
export interface MeetingIssue {
  id: ID;
  meeting_id: ID;
  issue_id: ID;
  created_at: ISODate;
}

export interface MeetingTodo {
  id: ID;
  meeting_id: ID;
  todo_id: ID;
  created_at: ISODate;
}

// API request/response interfaces
export interface CreateMeetingRequest {
  team_id: ID;
  title: string;
  date: ISODate;
  agenda_items?: Omit<AgendaItem, 'id' | 'meeting_id' | 'created_at' | 'updated_at'>[];
}

export interface UpdateMeetingRequest {
  title?: string;
  date?: ISODate;
  ended?: boolean;
}

export interface CreateNoteRequest {
  meeting_id: ID;
  text: string;
  linked_entity_type?: 'issue' | 'rock' | 'todo';
  linked_entity_id?: ID;
  decisions?: string[];
}

export interface CreateTodoRequest {
  team_id: ID;
  title: string;
  owner_id?: ID;
  due_date?: string;
  created_in_meeting_id?: ID;
}

export interface CreateIssueRequest {
  team_id: ID;
  title: string;
  detail?: string;
  priority: IssuePriority;
  owner_id?: ID;
}

export interface CreateRockRequest {
  team_id: ID;
  title: string;
  owner_id?: ID;
  quarter: string;
  milestones?: RockMilestone[];
}

export interface CreateMetricRequest {
  team_id: ID;
  name: string;
  unit?: string;
  target?: number;
  threshold_low?: number;
  threshold_high?: number;
  owner_id?: ID;
  cadence: MetricCadence;
}

export interface UpdateMetricPointRequest {
  value?: number;
}

// Meeting runner interfaces
export interface MeetingRunnerState {
  currentAgendaIndex: number;
  startTime: ISODate;
  timeSpent: Record<number, number>; // agenda index -> minutes spent
  isRunning: boolean;
  isPaused: boolean;
}

export interface QuickAddItem {
  type: 'issue' | 'todo' | 'note';
  content: string;
  priority?: IssuePriority;
  owner_id?: ID;
  due_date?: string;
}

// Weekly pack interfaces
export interface WeeklyMeetingPack {
  scorecard: {
    metrics: (Metric & { current_value?: number; previous_value?: number })[];
    alerts: MetricAlert[];
  };
  rocks: Rock[];
  todos: {
    lastWeek: Todo[];
    thisWeek: Todo[];
    completionRate: number;
  };
  issues: Issue[];
  headlines: string[];
}

export interface MetricAlert {
  metric: Metric;
  current_value: number;
  threshold_breached: 'low' | 'high';
  suggested_issue?: string;
}

// Dashboard interfaces
export interface MyWeekDashboard {
  myTodos: Todo[];
  myMetrics: (Metric & { needs_input: boolean })[];
  myRocks: Rock[];
  upcomingMeetings: Meeting[];
}

export interface QuarterDashboard {
  teams: {
    team: Team;
    rocks: Rock[];
    completion_rate: number;
    status_summary: {
      onTrack: number;
      offTrack: number;
      done: number;
    };
  }[];
  overall_completion: number;
}

// Utility types
export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  success: boolean;
}

// Form interfaces for UI components
export interface MeetingFormData {
  title: string;
  date: string;
  team_id: string;
  agenda_items: {
    title: string;
    type: AgendaItemType;
    duration_min?: number;
  }[];
}

export interface TodoFormData {
  title: string;
  owner_id?: string;
  due_date?: string;
  team_id: string;
}

export interface IssueFormData {
  title: string;
  detail?: string;
  priority: IssuePriority;
  owner_id?: string;
  team_id: string;
}

export interface RockFormData {
  title: string;
  owner_id?: string;
  quarter: string;
  team_id: string;
  milestones: { title: string; done: boolean }[];
}

export interface MetricFormData {
  name: string;
  unit?: string;
  target?: number;
  threshold_low?: number;
  threshold_high?: number;
  owner_id?: string;
  cadence: MetricCadence;
  team_id: string;
}

// Constants
export const TEAM_ROLES: TeamRole[] = ['admin', 'manager', 'member', 'viewer'];
export const ISSUE_PRIORITIES: IssuePriority[] = [1, 2, 3];
export const ROCK_CONFIDENCE_LEVELS = [0, 1, 2, 3, 4, 5] as const;
export const AGENDA_ITEM_TYPES: AgendaItemType[] = [
  'scorecard', 'rocks', 'customer', 'people', 'headlines', 'issues', 'todoReview', 'custom'
];

// Permission constants for meetings portal
export const MEETINGS_PERMISSIONS = {
  VIEW_MEETINGS: 'meetings:view',
  CREATE_MEETINGS: 'meetings:create',
  EDIT_MEETINGS: 'meetings:edit',
  DELETE_MEETINGS: 'meetings:delete',
  MANAGE_TEAM: 'team:manage',
  VIEW_ALL_TEAMS: 'teams:view_all',
  EDIT_VTO: 'vto:edit',
  MANAGE_METRICS: 'metrics:manage',
  ASSIGN_TODOS: 'todos:assign'
} as const;

// Default agenda for Level-10 meetings
export const DEFAULT_L10_AGENDA: Omit<AgendaItem, 'id' | 'meeting_id' | 'created_at' | 'updated_at'>[] = [
  { order_num: 1, title: 'Segue', type: 'custom', duration_min: 5 },
  { order_num: 2, title: 'Scorecard', type: 'scorecard', duration_min: 5 },
  { order_num: 3, title: 'Rock Review', type: 'rocks', duration_min: 5 },
  { order_num: 4, title: 'Customer/Employee Headlines', type: 'headlines', duration_min: 5 },
  { order_num: 5, title: 'To-Do List', type: 'todoReview', duration_min: 5 },
  { order_num: 6, title: 'IDS (Issues List)', type: 'issues', duration_min: 60 },
  { order_num: 7, title: 'Conclude', type: 'custom', duration_min: 5 }
];

// VTO section keys
export const VTO_SECTIONS = {
  CORE_VALUES: 'core_values',
  CORE_FOCUS: 'core_focus',
  TEN_YEAR_TARGET: 'ten_year_target',
  MARKETING_STRATEGY: 'marketing_strategy',
  THREE_YEAR_PICTURE: 'three_year_picture',
  ONE_YEAR_PLAN: 'one_year_plan',
  QUARTERLY_PRIORITIES: 'quarterly_priorities'
} as const;

export type VTOSectionKey = typeof VTO_SECTIONS[keyof typeof VTO_SECTIONS];