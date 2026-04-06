-- Add is_template to IT equipment tasks. Template tasks (e.g. standard laptop + mouse + case) can be assigned to new hires from Onboarding Tracking; a copy is created per person.

ALTER TABLE common.it_equipment_tasks
ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_it_equipment_tasks_is_template ON common.it_equipment_tasks(is_template);

COMMENT ON COLUMN common.it_equipment_tasks.is_template IS 'When true, task is a reusable template for assigning to employees from Onboarding Tracking';
