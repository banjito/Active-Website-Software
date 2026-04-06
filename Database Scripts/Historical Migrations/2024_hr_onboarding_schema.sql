-- HR Portal - Onboarding System
-- Schema for new hire packets, e-sign forms, checklists, welcome emails, and IT equipment tasks

-- New Hire Packets Table
CREATE TABLE IF NOT EXISTS common.new_hire_packets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    packet_type VARCHAR(50) DEFAULT 'standard' CHECK (packet_type IN ('standard', 'executive', 'contractor', 'intern', 'custom')),
    
    -- Packet Content
    documents JSONB DEFAULT '[]', -- Array of document objects: {name, file_url, file_path, required, order}
    instructions TEXT,
    custom_fields JSONB DEFAULT '{}',
    
    -- Assignment
    employee_id UUID, -- If assigned to specific employee
    offer_id UUID REFERENCES common.offers(id), -- If linked to offer
    
    -- Status
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
    is_template BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- E-Sign Forms Table (separate from offer e-signatures)
CREATE TABLE IF NOT EXISTS common.onboarding_e_sign_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    form_type VARCHAR(50) DEFAULT 'standard' CHECK (form_type IN ('standard', 'policy', 'agreement', 'disclosure', 'custom')),
    
    -- Form Content
    form_content TEXT NOT NULL, -- HTML or markdown content
    form_fields JSONB DEFAULT '[]', -- Array of form fields: {name, type, required, label, placeholder}
    signature_fields JSONB DEFAULT '[]', -- Array of signature fields: {name, label, required, signer_type}
    
    -- Assignment
    employee_id UUID, -- If assigned to specific employee
    packet_id UUID REFERENCES common.new_hire_packets(id), -- If part of a packet
    
    -- Status
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
    is_template BOOLEAN DEFAULT FALSE,
    requires_acknowledgment BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- E-Sign Form Submissions Table
CREATE TABLE IF NOT EXISTS common.onboarding_e_sign_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES common.onboarding_e_sign_forms(id) ON DELETE CASCADE,
    employee_id UUID, -- If known employee
    signer_email VARCHAR(255) NOT NULL,
    signer_name VARCHAR(255) NOT NULL,
    
    -- Signature Data
    signatures JSONB DEFAULT '[]', -- Array of signature objects: {field_name, signature_image, signature_data, signed_at}
    form_data JSONB DEFAULT '{}', -- Submitted form field values
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'declined')),
    signed_at TIMESTAMP WITH TIME ZONE,
    signing_token VARCHAR(255) UNIQUE, -- For public signing links
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Checklists Table
CREATE TABLE IF NOT EXISTS common.onboarding_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    checklist_type VARCHAR(50) DEFAULT 'standard' CHECK (checklist_type IN ('standard', 'pre-start', 'first-day', 'first-week', 'first-month', 'custom')),
    
    -- Checklist Items
    items JSONB DEFAULT '[]', -- Array of checklist items: {id, title, description, category, required, order, assignee_type, due_days}
    
    -- Assignment
    employee_id UUID, -- If assigned to specific employee
    packet_id UUID REFERENCES common.new_hire_packets(id), -- If part of a packet
    
    -- Status
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
    is_template BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Checklist Assignments Table (tracks checklist completion for employees)
CREATE TABLE IF NOT EXISTS common.onboarding_checklist_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id UUID NOT NULL REFERENCES common.onboarding_checklists(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL, -- Employee assigned to
    assigned_by UUID NOT NULL REFERENCES auth.users(id),
    
    -- Completion Tracking
    items_completed JSONB DEFAULT '[]', -- Array of completed items: {item_id, completed_by, completed_at, notes}
    completion_percentage INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('not_started', 'in_progress', 'completed', 'overdue')),
    
    -- Dates
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    due_date DATE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Welcome Emails Table
CREATE TABLE IF NOT EXISTS common.welcome_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    email_type VARCHAR(50) DEFAULT 'standard' CHECK (email_type IN ('standard', 'pre-start', 'first-day', 'first-week', 'custom')),
    
    -- Email Content
    subject VARCHAR(500) NOT NULL,
    email_body TEXT NOT NULL, -- HTML email content
    email_body_text TEXT, -- Plain text version
    template_variables JSONB DEFAULT '[]', -- Available variables: {name, email, start_date, position, etc.}
    
    -- Sending Configuration
    send_automatically BOOLEAN DEFAULT FALSE,
    send_days_before_start INTEGER DEFAULT 0, -- Days before start date to send
    send_time TIME DEFAULT '09:00:00', -- Time of day to send
    
    -- Assignment
    employee_id UUID, -- If assigned to specific employee
    offer_id UUID REFERENCES common.offers(id), -- If linked to offer
    
    -- Status
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
    is_template BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Welcome Email Sends Table (tracks sent emails)
CREATE TABLE IF NOT EXISTS common.welcome_email_sends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id UUID NOT NULL REFERENCES common.welcome_emails(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(255),
    
    -- Email Details
    subject VARCHAR(500) NOT NULL,
    email_body TEXT NOT NULL,
    email_body_text TEXT,
    
    -- Sending Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
    sent_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    
    -- Metadata
    sent_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- IT Equipment Tasks Table
CREATE TABLE IF NOT EXISTS common.it_equipment_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    task_type VARCHAR(50) DEFAULT 'standard' CHECK (task_type IN ('standard', 'laptop', 'phone', 'access', 'software', 'hardware', 'custom')),
    
    -- Task Details
    equipment_category VARCHAR(100), -- laptop, phone, monitor, keyboard, etc.
    equipment_specs JSONB DEFAULT '{}', -- Specific equipment requirements
    software_requirements JSONB DEFAULT '[]', -- Array of required software
    access_requirements JSONB DEFAULT '[]', -- Array of access needs: {system, role, permissions}
    
    -- Assignment
    employee_id UUID, -- If assigned to specific employee
    assigned_to_user_id UUID REFERENCES auth.users(id), -- IT person assigned
    packet_id UUID REFERENCES common.new_hire_packets(id), -- If part of a packet
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    
    -- Dates
    due_date DATE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Completion Details
    equipment_assigned JSONB DEFAULT '[]', -- Array of assigned equipment: {equipment_id, serial_number, assigned_date}
    notes TEXT,
    
    -- Metadata
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_new_hire_packets_employee_id ON common.new_hire_packets(employee_id);
CREATE INDEX IF NOT EXISTS idx_new_hire_packets_offer_id ON common.new_hire_packets(offer_id);
CREATE INDEX IF NOT EXISTS idx_new_hire_packets_status ON common.new_hire_packets(status);
CREATE INDEX IF NOT EXISTS idx_new_hire_packets_is_template ON common.new_hire_packets(is_template);

CREATE INDEX IF NOT EXISTS idx_onboarding_e_sign_forms_employee_id ON common.onboarding_e_sign_forms(employee_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_e_sign_forms_packet_id ON common.onboarding_e_sign_forms(packet_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_e_sign_forms_status ON common.onboarding_e_sign_forms(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_e_sign_submissions_form_id ON common.onboarding_e_sign_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_e_sign_submissions_employee_id ON common.onboarding_e_sign_submissions(employee_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_e_sign_submissions_status ON common.onboarding_e_sign_submissions(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_e_sign_submissions_token ON common.onboarding_e_sign_submissions(signing_token);

CREATE INDEX IF NOT EXISTS idx_onboarding_checklists_employee_id ON common.onboarding_checklists(employee_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_checklists_packet_id ON common.onboarding_checklists(packet_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_checklists_status ON common.onboarding_checklists(status);
CREATE INDEX IF NOT EXISTS idx_checklist_assignments_checklist_id ON common.onboarding_checklist_assignments(checklist_id);
CREATE INDEX IF NOT EXISTS idx_checklist_assignments_employee_id ON common.onboarding_checklist_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_checklist_assignments_status ON common.onboarding_checklist_assignments(status);

CREATE INDEX IF NOT EXISTS idx_welcome_emails_employee_id ON common.welcome_emails(employee_id);
CREATE INDEX IF NOT EXISTS idx_welcome_emails_offer_id ON common.welcome_emails(offer_id);
CREATE INDEX IF NOT EXISTS idx_welcome_emails_status ON common.welcome_emails(status);
CREATE INDEX IF NOT EXISTS idx_welcome_email_sends_email_id ON common.welcome_email_sends(email_id);
CREATE INDEX IF NOT EXISTS idx_welcome_email_sends_employee_id ON common.welcome_email_sends(employee_id);
CREATE INDEX IF NOT EXISTS idx_welcome_email_sends_status ON common.welcome_email_sends(status);

CREATE INDEX IF NOT EXISTS idx_it_equipment_tasks_employee_id ON common.it_equipment_tasks(employee_id);
CREATE INDEX IF NOT EXISTS idx_it_equipment_tasks_assigned_to ON common.it_equipment_tasks(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_it_equipment_tasks_packet_id ON common.it_equipment_tasks(packet_id);
CREATE INDEX IF NOT EXISTS idx_it_equipment_tasks_status ON common.it_equipment_tasks(status);
CREATE INDEX IF NOT EXISTS idx_it_equipment_tasks_priority ON common.it_equipment_tasks(priority);

-- Disable Row Level Security (matching pattern from other HR tables)
ALTER TABLE common.new_hire_packets DISABLE ROW LEVEL SECURITY;
ALTER TABLE common.onboarding_e_sign_forms DISABLE ROW LEVEL SECURITY;
ALTER TABLE common.onboarding_e_sign_submissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE common.onboarding_checklists DISABLE ROW LEVEL SECURITY;
ALTER TABLE common.onboarding_checklist_assignments DISABLE ROW LEVEL SECURITY;
ALTER TABLE common.welcome_emails DISABLE ROW LEVEL SECURITY;
ALTER TABLE common.welcome_email_sends DISABLE ROW LEVEL SECURITY;
ALTER TABLE common.it_equipment_tasks DISABLE ROW LEVEL SECURITY;

-- Grant explicit permissions to authenticated users
GRANT ALL ON common.new_hire_packets TO authenticated;
GRANT ALL ON common.new_hire_packets TO anon;
GRANT ALL ON common.onboarding_e_sign_forms TO authenticated;
GRANT ALL ON common.onboarding_e_sign_forms TO anon;
GRANT ALL ON common.onboarding_e_sign_submissions TO authenticated;
GRANT ALL ON common.onboarding_e_sign_submissions TO anon;
GRANT ALL ON common.onboarding_checklists TO authenticated;
GRANT ALL ON common.onboarding_checklists TO anon;
GRANT ALL ON common.onboarding_checklist_assignments TO authenticated;
GRANT ALL ON common.onboarding_checklist_assignments TO anon;
GRANT ALL ON common.welcome_emails TO authenticated;
GRANT ALL ON common.welcome_emails TO anon;
GRANT ALL ON common.welcome_email_sends TO authenticated;
GRANT ALL ON common.welcome_email_sends TO anon;
GRANT ALL ON common.it_equipment_tasks TO authenticated;
GRANT ALL ON common.it_equipment_tasks TO anon;

-- Add comments
COMMENT ON TABLE common.new_hire_packets IS 'New hire onboarding packets containing documents and instructions';
COMMENT ON TABLE common.onboarding_e_sign_forms IS 'E-signature forms for onboarding (separate from offer e-signatures)';
COMMENT ON TABLE common.onboarding_e_sign_submissions IS 'E-signature form submissions and signatures';
COMMENT ON TABLE common.onboarding_checklists IS 'Onboarding checklists with tasks and items';
COMMENT ON TABLE common.onboarding_checklist_assignments IS 'Checklist assignments and completion tracking for employees';
COMMENT ON TABLE common.welcome_emails IS 'Welcome email templates for new hires';
COMMENT ON TABLE common.welcome_email_sends IS 'Tracks sent welcome emails and engagement';
COMMENT ON TABLE common.it_equipment_tasks IS 'IT equipment provisioning tasks for new hires';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_new_hire_packets_updated_at ON common.new_hire_packets;
CREATE TRIGGER update_new_hire_packets_updated_at
    BEFORE UPDATE ON common.new_hire_packets
    FOR EACH ROW
    EXECUTE FUNCTION common.update_updated_at_column();

DROP TRIGGER IF EXISTS update_onboarding_e_sign_forms_updated_at ON common.onboarding_e_sign_forms;
CREATE TRIGGER update_onboarding_e_sign_forms_updated_at
    BEFORE UPDATE ON common.onboarding_e_sign_forms
    FOR EACH ROW
    EXECUTE FUNCTION common.update_updated_at_column();

DROP TRIGGER IF EXISTS update_onboarding_e_sign_submissions_updated_at ON common.onboarding_e_sign_submissions;
CREATE TRIGGER update_onboarding_e_sign_submissions_updated_at
    BEFORE UPDATE ON common.onboarding_e_sign_submissions
    FOR EACH ROW
    EXECUTE FUNCTION common.update_updated_at_column();

DROP TRIGGER IF EXISTS update_onboarding_checklists_updated_at ON common.onboarding_checklists;
CREATE TRIGGER update_onboarding_checklists_updated_at
    BEFORE UPDATE ON common.onboarding_checklists
    FOR EACH ROW
    EXECUTE FUNCTION common.update_updated_at_column();

DROP TRIGGER IF EXISTS update_onboarding_checklist_assignments_updated_at ON common.onboarding_checklist_assignments;
CREATE TRIGGER update_onboarding_checklist_assignments_updated_at
    BEFORE UPDATE ON common.onboarding_checklist_assignments
    FOR EACH ROW
    EXECUTE FUNCTION common.update_updated_at_column();

DROP TRIGGER IF EXISTS update_welcome_emails_updated_at ON common.welcome_emails;
CREATE TRIGGER update_welcome_emails_updated_at
    BEFORE UPDATE ON common.welcome_emails
    FOR EACH ROW
    EXECUTE FUNCTION common.update_updated_at_column();

DROP TRIGGER IF EXISTS update_welcome_email_sends_updated_at ON common.welcome_email_sends;
CREATE TRIGGER update_welcome_email_sends_updated_at
    BEFORE UPDATE ON common.welcome_email_sends
    FOR EACH ROW
    EXECUTE FUNCTION common.update_updated_at_column();

DROP TRIGGER IF EXISTS update_it_equipment_tasks_updated_at ON common.it_equipment_tasks;
CREATE TRIGGER update_it_equipment_tasks_updated_at
    BEFORE UPDATE ON common.it_equipment_tasks
    FOR EACH ROW
    EXECUTE FUNCTION common.update_updated_at_column();
