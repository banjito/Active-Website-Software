-- Reports by Hayden or Alonzo on job 1ae71929-383b-489e-99b0-383260f252ac
-- Window: June 29 - July 3, 2026 (created_at in [2026-06-29, 2026-07-04))
-- Paste straight into the Supabase SQL editor.
--
-- Only the two report tables that actually contain hits for these users/job/dates are
-- included (mv circuit breaker MTS + mv switch MTS). Names resolved via common.profiles.

SELECT
  r.report_type,
  r.id            AS report_id,
  p.full_name     AS created_by,
  r.user_id,
  r.created_at
FROM (
  SELECT 'medium_voltage_circuit_breaker_mts_reports' AS report_type, id, user_id, job_id, created_at, deleted_at
  FROM neta_ops.medium_voltage_circuit_breaker_mts_reports
  UNION ALL
  SELECT 'medium_voltage_switch_mts_reports', id, user_id, job_id, created_at, NULL::timestamptz
  FROM neta_ops.medium_voltage_switch_mts_reports
) AS r
LEFT JOIN common.profiles p ON p.id = r.user_id
WHERE r.job_id = '1ae71929-383b-489e-99b0-383260f252ac'
  AND r.user_id IN (
    'b42b14a9-f1ba-4001-a0b9-9d5ae6a3c56b',  -- Hayden
    'eb43c015-7cf0-4297-b1fa-06ad78f256a8'   -- Alonzo
  )
  AND r.created_at >= '2026-06-29'
  AND r.created_at <  '2026-07-04'
  AND r.deleted_at IS NULL
ORDER BY r.created_at;
