-- Assign IT/Equipment tasks to onboarding tracking. Each assignment creates a copy of the task for the employee.

CREATE TABLE IF NOT EXISTS common.onboarding_tracking_it_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracking_id UUID NOT NULL REFERENCES common.onboarding_tracking(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES common.it_equipment_tasks(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tracking_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_tracking_it_tasks_tracking_id ON common.onboarding_tracking_it_tasks(tracking_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_tracking_it_tasks_task_id ON common.onboarding_tracking_it_tasks(task_id);

ALTER TABLE common.onboarding_tracking_it_tasks DISABLE ROW LEVEL SECURITY;
GRANT ALL ON common.onboarding_tracking_it_tasks TO authenticated;
GRANT ALL ON common.onboarding_tracking_it_tasks TO anon;

COMMENT ON TABLE common.onboarding_tracking_it_tasks IS 'IT/Equipment tasks assigned to onboarding tracking; employee sees them in Your Onboarding';
