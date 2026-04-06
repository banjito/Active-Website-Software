/**
 * Help Center Type Definitions
 * 
 * These types define the structure for help center guides and content blocks.
 * Guides are composed of reusable content blocks that can be customized and arranged.
 */

// ============================================================================
// Content Block Types - Building blocks for guides
// ============================================================================

export enum ContentBlockType {
  TEXT = 'text',
  HEADING = 'heading',
  IMAGE = 'image',
  TABLE = 'table',
  BULLET_LIST = 'bullet-list',
  NUMBERED_LIST = 'numbered-list',
  CODE_BLOCK = 'code-block',
  CALLOUT = 'callout',
  DIVIDER = 'divider',
  VIDEO = 'video',
  STEP = 'step',
}

// ============================================================================
// Text Formatting Options
// ============================================================================

export interface TextFormatting {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  color?: string;
  backgroundColor?: string;
  fontSize?: 'small' | 'normal' | 'large' | 'xlarge';
  align?: 'left' | 'center' | 'right';
}

// ============================================================================
// Content Block Configurations
// ============================================================================

export interface TextBlockConfig {
  content: string;
  formatting?: TextFormatting;
  indent?: number; // 0-4 levels of indentation
}

export interface HeadingBlockConfig {
  content: string;
  level: 1 | 2 | 3 | 4;
  formatting?: TextFormatting;
}

export interface ImageBlockConfig {
  url: string;
  alt?: string;
  caption?: string;
  width?: string; // CSS width (e.g., "100%", "500px")
  alignment?: 'left' | 'center' | 'right';
}

export interface TableBlockConfig {
  headers: string[];
  rows: string[][];
  headerStyle?: TextFormatting;
  cellStyle?: TextFormatting;
}

export interface ListBlockConfig {
  items: {
    content: string;
    indent?: number;
    formatting?: TextFormatting;
    subItems?: {
      content: string;
      formatting?: TextFormatting;
    }[];
  }[];
}

export interface CodeBlockConfig {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
}

export interface CalloutBlockConfig {
  type: 'info' | 'warning' | 'success' | 'error' | 'tip';
  title?: string;
  content: string;
}

export interface StepBlockConfig {
  stepNumber: number;
  title: string;
  content: string;
  image?: ImageBlockConfig;
}

export interface VideoBlockConfig {
  url: string;
  title?: string;
  width?: string;
}

// ============================================================================
// Content Block Structure
// ============================================================================

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  order: number;
  config: 
    | TextBlockConfig 
    | HeadingBlockConfig 
    | ImageBlockConfig 
    | TableBlockConfig 
    | ListBlockConfig 
    | CodeBlockConfig 
    | CalloutBlockConfig 
    | StepBlockConfig
    | VideoBlockConfig
    | Record<string, never>; // For divider
}

// ============================================================================
// Portal Categories
// ============================================================================

export enum PortalCategory {
  OPERATIONS = 'operations',
  SALES = 'sales',
  OFFICE_ADMIN = 'office-admin',
  ENGINEERING = 'engineering',
  HR = 'hr',
  LAB = 'lab',
  FIELD_TECH = 'field-tech',
  GENERAL = 'general',
}

export const PORTAL_CATEGORY_LABELS: Record<PortalCategory, string> = {
  [PortalCategory.OPERATIONS]: 'Operations Portals',
  [PortalCategory.SALES]: 'Sales Portals',
  [PortalCategory.OFFICE_ADMIN]: 'Office Admin Portals',
  [PortalCategory.ENGINEERING]: 'Engineering Portal',
  [PortalCategory.HR]: 'HR Portal',
  [PortalCategory.LAB]: 'Lab Portal',
  [PortalCategory.FIELD_TECH]: 'Field Tech Portal',
  [PortalCategory.GENERAL]: 'General Guides',
};

// ============================================================================
// Guide Template Structure
// ============================================================================

export interface HelpGuide {
  id?: string;
  title: string;
  description?: string;
  category: PortalCategory;
  tags?: string[];
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  isPublished?: boolean;
  viewCount?: number;
  
  // The actual content structure
  content: {
    blocks: ContentBlock[];
    settings: {
      showTableOfContents: boolean;
      allowComments: boolean;
      showLastUpdated: boolean;
    };
  };
}

// ============================================================================
// Content Block Library Definition
// ============================================================================

export interface ContentBlockDefinition {
  id: ContentBlockType;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  defaultConfig: Partial<ContentBlock['config']>;
}

export const CONTENT_BLOCK_LIBRARY: ContentBlockDefinition[] = [
  {
    id: ContentBlockType.HEADING,
    name: 'Heading',
    description: 'Section title or subtitle',
    icon: 'Heading',
    defaultConfig: { content: 'New Heading', level: 2 } as HeadingBlockConfig,
  },
  {
    id: ContentBlockType.TEXT,
    name: 'Text Block',
    description: 'Rich text paragraph with formatting',
    icon: 'Type',
    defaultConfig: { content: 'Enter your text here...', formatting: { fontSize: 'normal' } } as TextBlockConfig,
  },
  {
    id: ContentBlockType.BULLET_LIST,
    name: 'Bullet List',
    description: 'Unordered list with bullet points',
    icon: 'List',
    defaultConfig: { items: [{ content: 'List item 1' }, { content: 'List item 2' }] } as ListBlockConfig,
  },
  {
    id: ContentBlockType.NUMBERED_LIST,
    name: 'Numbered List',
    description: 'Ordered list with numbers',
    icon: 'ListOrdered',
    defaultConfig: { items: [{ content: 'Step 1' }, { content: 'Step 2' }] } as ListBlockConfig,
  },
  {
    id: ContentBlockType.STEP,
    name: 'Step',
    description: 'Tutorial step with number and content',
    icon: 'CircleDot',
    defaultConfig: { stepNumber: 1, title: 'Step Title', content: 'Step description...' } as StepBlockConfig,
  },
  {
    id: ContentBlockType.IMAGE,
    name: 'Image',
    description: 'Upload or link an image',
    icon: 'Image',
    defaultConfig: { url: '', alt: 'Image', alignment: 'center', width: '100%' } as ImageBlockConfig,
  },
  {
    id: ContentBlockType.TABLE,
    name: 'Table',
    description: 'Data table with headers and rows',
    icon: 'Table',
    defaultConfig: { headers: ['Column 1', 'Column 2'], rows: [['Cell 1', 'Cell 2']] } as TableBlockConfig,
  },
  {
    id: ContentBlockType.CALLOUT,
    name: 'Callout',
    description: 'Highlighted info, warning, or tip box',
    icon: 'MessageSquare',
    defaultConfig: { type: 'info', title: 'Note', content: 'Important information...' } as CalloutBlockConfig,
  },
  {
    id: ContentBlockType.CODE_BLOCK,
    name: 'Code Block',
    description: 'Formatted code snippet',
    icon: 'Code',
    defaultConfig: { code: '// Your code here', language: 'javascript' } as CodeBlockConfig,
  },
  {
    id: ContentBlockType.VIDEO,
    name: 'Video',
    description: 'Embed a video (YouTube, Vimeo, etc.)',
    icon: 'Video',
    defaultConfig: { url: '', title: 'Video' } as VideoBlockConfig,
  },
  {
    id: ContentBlockType.DIVIDER,
    name: 'Divider',
    description: 'Horizontal line separator',
    icon: 'Minus',
    defaultConfig: {},
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

export function getBlockDefinition(type: ContentBlockType): ContentBlockDefinition | undefined {
  return CONTENT_BLOCK_LIBRARY.find(block => block.id === type);
}

export function createEmptyBlock(type: ContentBlockType, order: number): ContentBlock {
  const definition = getBlockDefinition(type);
  return {
    id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    order,
    config: definition?.defaultConfig || {},
  };
}

// ============================================================================
// Help Center PDF Documents
// ============================================================================

export interface HelpCenterDocument {
  id?: string;
  name: string;
  category: PortalCategory;
  file_path: string;
  file_url: string;
  file_size: number;
  file_type?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  viewCount?: number;
}

/** True if the document is a video (by MIME type or file extension). */
export function isVideoDocument(doc: HelpCenterDocument): boolean {
  const t = (doc.file_type || '').toLowerCase();
  if (t.startsWith('video/')) return true;
  const url = (doc.file_url || doc.file_path || '').toLowerCase();
  return /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
}

// ============================================================================
// Example Guides / Templates
// ============================================================================

export const EXAMPLE_GUIDES: Partial<HelpGuide>[] = [
  {
    title: 'Creating an Opportunity',
    description: 'Learn how to create and manage opportunities in the sales portal',
    category: PortalCategory.SALES,
    tags: ['opportunity', 'sales', 'getting started'],
  },
  {
    title: 'Creating a T&M Opportunity',
    description: 'Step-by-step guide for creating Time & Materials opportunities',
    category: PortalCategory.SALES,
    tags: ['opportunity', 'T&M', 'sales'],
  },
  {
    title: 'Converting an Opportunity to a Job',
    description: 'How to convert a won opportunity into an active job',
    category: PortalCategory.OPERATIONS,
    tags: ['opportunity', 'job', 'conversion'],
  },
  {
    title: 'Creating a Test Report (Online)',
    description: 'Guide to creating test reports using the online software',
    category: PortalCategory.FIELD_TECH,
    tags: ['report', 'testing', 'online'],
  },
  {
    title: 'Creating a Test Report (Offline)',
    description: 'Guide to creating test reports using the offline desktop software',
    category: PortalCategory.FIELD_TECH,
    tags: ['report', 'testing', 'offline', 'desktop'],
  },
  {
    title: 'Creating a Cover Letter & Executive Summary',
    description: 'How to create professional cover letters and executive summaries',
    category: PortalCategory.OPERATIONS,
    tags: ['deliverable', 'cover letter', 'executive summary'],
  },
  {
    title: 'Creating & Printing a Deliverable',
    description: 'Complete guide to creating, managing, and printing deliverables',
    category: PortalCategory.OPERATIONS,
    tags: ['deliverable', 'printing', 'pdf'],
  },
  {
    title: 'Printing Test Reports',
    description: 'Different methods and options for printing test reports',
    category: PortalCategory.OPERATIONS,
    tags: ['report', 'printing', 'pdf'],
  },
];

