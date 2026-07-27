-- Audience targeting for announcements.
-- NULL means visible to all employees (default, matches existing rows).
-- Targeted format: {"type": "selected", "employees": [{"id": "...", "email": "...", "name": "..."}]}
ALTER TABLE common.announcements
  ADD COLUMN IF NOT EXISTS audience jsonb;
