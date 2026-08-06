-- Adds a human-readable employee ID (badge number) to common.profiles.
--
-- Named employee_number, NOT employee_id: "employee_id" is already used across
-- ~20 tables (hr.attendance, common.employee_documents, etc.) as a uuid foreign
-- key to profiles.id. Reusing that name would be permanently confusing.
--
-- Text, not integer: real IDs include leading zeros (0001, 0008, 0027) and an
-- alpha prefix (S0002). An integer column would destroy both.
--
-- Purely additive. Nothing in the report path reads this column.

ALTER TABLE common.profiles
  ADD COLUMN IF NOT EXISTS employee_number text;

COMMENT ON COLUMN common.profiles.employee_number IS
  'Human-readable employee ID / badge number from the company roster (e.g. 1001, 0034, S0002). Assigned manually, not auto-generated. Distinct from employee_id columns elsewhere, which are uuid FKs to profiles.id.';

-- Partial unique index: two employees can never share a number, but any number
-- of profiles may have none yet.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_employee_number_key
  ON common.profiles (employee_number)
  WHERE employee_number IS NOT NULL;
