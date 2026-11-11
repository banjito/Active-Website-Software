-- Rented equipment.
--
-- Field techs asked to filter Field Equipment down to just what is rented. Nothing marked
-- an item as rented, so the list could not tell a rental from something we own.
--
-- Rental company and return date ride along so "who do we send it back to, and by when"
-- is answerable from the same row.
--
-- Safe to re-run.

SET lock_timeout = '5s';

ALTER TABLE neta_ops.field_equipment
  ADD COLUMN IF NOT EXISTS is_rented          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rental_vendor      TEXT,
  ADD COLUMN IF NOT EXISTS rental_return_date DATE;

COMMENT ON COLUMN neta_ops.field_equipment.is_rented IS
  'True when this item is rented, not owned. Drives the "Rented only" filter.';
COMMENT ON COLUMN neta_ops.field_equipment.rental_vendor IS
  'Who it is rented from. Only meaningful when is_rented is true.';
COMMENT ON COLUMN neta_ops.field_equipment.rental_return_date IS
  'When the rental is due back. Only meaningful when is_rented is true.';
