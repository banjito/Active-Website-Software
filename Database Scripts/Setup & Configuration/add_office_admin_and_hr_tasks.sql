-- =====================================================
-- Office Admin Tasks & HR Tasks
--
-- Mirrors the IT/Equipment Tasks pattern (common.it_equipment_tasks +
-- common.onboarding_tracking_it_tasks) so Admin and HR can:
--   1) maintain reusable task templates, and
--   2) assign copies to a person via Onboarding Tracking with
--      progress visible in Your Onboarding and a "who needs what"
--      dashboard per task type.
--
-- These tables deliberately skip the IT-specific fields
-- (equipment_specs / software_requirements / access_requirements)
-- and keep just the general fields that apply to Admin/HR work.
-- =====================================================

-- ---------- Office Admin Tasks ----------
CREATE TABLE IF NOT EXISTS common.office_admin_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    task_type VARCHAR(50) DEFAULT 'standard' CHECK (task_type IN ('standard', 'workspace', 'supplies', 'access_badge', 'phone', 'mail', 'travel', 'custom')),

    -- Assignment
    employee_id UUID,                                  -- The new hire this is for (null for templates)
    assigned_to_user_id UUID REFERENCES auth.users(id),-- The Admin person responsible

    -- Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

    due_date DATE,
    completed_at TIMESTAMP WITH TIME ZONE,

    notes TEXT,
    is_template BOOLEAN DEFAULT FALSE,

    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_office_admin_tasks_employee_id ON common.office_admin_tasks(employee_id);
CREATE INDEX IF NOT EXISTS idx_office_admin_tasks_assigned_to ON common.office_admin_tasks(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_office_admin_tasks_status ON common.office_admin_tasks(status);
CREATE INDEX IF NOT EXISTS idx_office_admin_tasks_is_template ON common.office_admin_tasks(is_template);

ALTER TABLE common.office_admin_tasks DISABLE ROW LEVEL SECURITY;
GRANT ALL ON common.office_admin_tasks TO authenticated;
GRANT ALL ON common.office_admin_tasks TO anon;

COMMENT ON TABLE common.office_admin_tasks IS 'Office Admin task templates and per-person assignments (setting up workspace, supplies, badges, etc.)';
COMMENT ON COLUMN common.office_admin_tasks.is_template IS 'When true, task is a reusable template for assigning to employees from Onboarding Tracking.';


-- ---------- HR Tasks ----------
CREATE TABLE IF NOT EXISTS common.hr_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    task_type VARCHAR(50) DEFAULT 'standard' CHECK (task_type IN ('standard', 'paperwork', 'i9', 'benefits', 'payroll', 'training', 'policy', 'orientation', 'custom')),

    employee_id UUID,
    assigned_to_user_id UUID REFERENCES auth.users(id),-- The HR person responsible

    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

    due_date DATE,
    completed_at TIMESTAMP WITH TIME ZONE,

    notes TEXT,
    is_template BOOLEAN DEFAULT FALSE,

    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_tasks_employee_id ON common.hr_tasks(employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_tasks_assigned_to ON common.hr_tasks(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_hr_tasks_status ON common.hr_tasks(status);
CREATE INDEX IF NOT EXISTS idx_hr_tasks_is_template ON common.hr_tasks(is_template);

ALTER TABLE common.hr_tasks DISABLE ROW LEVEL SECURITY;
GRANT ALL ON common.hr_tasks TO authenticated;
GRANT ALL ON common.hr_tasks TO anon;

COMMENT ON TABLE common.hr_tasks IS 'HR task templates and per-person assignments (I-9 verification, benefits enrollment, payroll setup, orientation, etc.)';
COMMENT ON COLUMN common.hr_tasks.is_template IS 'When true, task is a reusable template for assigning to employees from Onboarding Tracking.';


-- ---------- Onboarding tracking link tables ----------
CREATE TABLE IF NOT EXISTS common.onboarding_tracking_office_admin_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracking_id UUID NOT NULL REFERENCES common.onboarding_tracking(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES common.office_admin_tasks(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tracking_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_ot_office_admin_tasks_tracking_id ON common.onboarding_tracking_office_admin_tasks(tracking_id);
CREATE INDEX IF NOT EXISTS idx_ot_office_admin_tasks_task_id ON common.onboarding_tracking_office_admin_tasks(task_id);

ALTER TABLE common.onboarding_tracking_office_admin_tasks DISABLE ROW LEVEL SECURITY;
GRANT ALL ON common.onboarding_tracking_office_admin_tasks TO authenticated;
GRANT ALL ON common.onboarding_tracking_office_admin_tasks TO anon;

COMMENT ON TABLE common.onboarding_tracking_office_admin_tasks IS 'Office Admin tasks assigned to an onboarding tracking record; employee sees them in Your Onboarding.';


CREATE TABLE IF NOT EXISTS common.onboarding_tracking_hr_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracking_id UUID NOT NULL REFERENCES common.onboarding_tracking(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES common.hr_tasks(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tracking_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_ot_hr_tasks_tracking_id ON common.onboarding_tracking_hr_tasks(tracking_id);
CREATE INDEX IF NOT EXISTS idx_ot_hr_tasks_task_id ON common.onboarding_tracking_hr_tasks(task_id);

ALTER TABLE common.onboarding_tracking_hr_tasks DISABLE ROW LEVEL SECURITY;
GRANT ALL ON common.onboarding_tracking_hr_tasks TO authenticated;
GRANT ALL ON common.onboarding_tracking_hr_tasks TO anon;

COMMENT ON TABLE common.onboarding_tracking_hr_tasks IS 'HR tasks assigned to an onboarding tracking record; employee sees them in Your Onboarding.';
