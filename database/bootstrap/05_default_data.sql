-- Default rows a new instance starts with.
-- 02_schema.sql is a schema-only dump, so table contents never carry over.
-- Every insert here must be safe to re-run (ON CONFLICT DO NOTHING).
-- When a migration seeds defaults, copy its insert block here.

-- Project checklist steps (source: database/migrations/job_checklist.sql + job_checklist_steps_nov11.sql)
INSERT INTO neta_ops.job_checklist_steps (key, name, phase, sort_order, due_anchor, due_offset_days, auto_rule)
VALUES
  ('contract_signed',     'Contract signed',          'Sales',    10, NULL,       0,  NULL),
  ('pm_contacted',        'PM contacted customer',    'Setup',    20, 'contract', 2,  NULL),
  ('coi_issued',          'COI issued',               'Setup',    30, 'contract', 5,  NULL),
  ('lead_assigned',       'Lead assigned',            'Setup',    40, 'contract', 5,  'lead_assigned'),
  ('quickbooks_linked',   'Job in QuickBooks',        'Setup',    50, 'contract', 5,  'quickbooks_linked'),
  ('sov_created',         'SOV created',              'Setup',    55, NULL,       0,  'sov_created'),
  ('mobilization_billed', 'Mobilization billed',      'Setup',    57, 'contract', 0,  NULL),
  ('site_visit',          'Initial site visit',       'Field',    60, 'start',    -7, NULL),
  ('reports_sent',        'Reports sent to customer', 'Closeout', 80, 'end',      10, NULL),
  ('final_invoice',       'Final invoice sent',       'Closeout', 90, NULL,       0,  'job_billed')
ON CONFLICT (key) DO NOTHING;
