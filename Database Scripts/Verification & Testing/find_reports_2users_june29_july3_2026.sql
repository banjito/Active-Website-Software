-- Reports on job 1ae71929-383b-489e-99b0-383260f252ac
-- Window: June 29 - July 3, 2026 (created_at in [2026-06-29, 2026-07-04))
-- Users: 51e9f999-5cfd-4e35-b3ef-dd78d71a500e and b86267ec-9c34-4c72-bfbc-54afdc8b8bbd
-- Full 45-table sweep; names resolved via common.profiles. Paste into Supabase SQL editor.

SELECT r.table_name, r.id AS report_id, p.full_name AS created_by, r.user_id, r.created_at
FROM (
  SELECT 'applied_voltage_test_ats_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.applied_voltage_test_ats_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04'
  UNION ALL
  SELECT 'automatic_transfer_switch_ats_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.automatic_transfer_switch_ats_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'current_transformer_test_ats_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.current_transformer_test_ats_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'current_transformer_test_mts_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.current_transformer_test_mts_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'gfi_trip_test_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.gfi_trip_test_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04'
  UNION ALL
  SELECT 'grounding_fall_of_potential_slope_method_test_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.grounding_fall_of_potential_slope_method_test_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04'
  UNION ALL
  SELECT 'grounding_system_master_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.grounding_system_master_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04'
  UNION ALL
  SELECT 'job_hazard_analysis_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.job_hazard_analysis_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04'
  UNION ALL
  SELECT 'large_dry_type_transformer_mts_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.large_dry_type_transformer_mts_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'large_dry_type_xfmr_mts_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.large_dry_type_xfmr_mts_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04'
  UNION ALL
  SELECT 'large_transformer_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.large_transformer_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'liquid_filled_transformer_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.liquid_filled_transformer_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'liquid_filled_xfmr_ats25_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.liquid_filled_xfmr_ats25_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04'
  UNION ALL
  SELECT 'liquid_xfmr_visual_mts_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.liquid_xfmr_visual_mts_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'low_voltage_circuit_breaker_thermal_magnetic_mts_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.low_voltage_circuit_breaker_thermal_magnetic_mts_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'low_voltage_panelboard_small_breaker_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.low_voltage_panelboard_small_breaker_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'low_voltage_switch_maint_mts_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.low_voltage_switch_maint_mts_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04'
  UNION ALL
  SELECT 'low_voltage_switch_multi_device_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.low_voltage_switch_multi_device_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04'
  UNION ALL
  SELECT 'low_voltage_switch_multi_device_test_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.low_voltage_switch_multi_device_test_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04'
  UNION ALL
  SELECT 'low_voltage_switch_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.low_voltage_switch_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'medium_voltage_cable_vlf_test_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.medium_voltage_cable_vlf_test_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04'
  UNION ALL
  SELECT 'medium_voltage_circuit_breaker_mts_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.medium_voltage_circuit_breaker_mts_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'medium_voltage_circuit_breaker_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.medium_voltage_circuit_breaker_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'medium_voltage_motor_starter_mts_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.medium_voltage_motor_starter_mts_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'medium_voltage_switch_mts_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.medium_voltage_switch_mts_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04'
  UNION ALL
  SELECT 'medium_voltage_switch_oil_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.medium_voltage_switch_oil_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'medium_voltage_switch_sf6_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.medium_voltage_switch_sf6_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'medium_voltage_vlf_mts_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.medium_voltage_vlf_mts_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'medium_voltage_vlf_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.medium_voltage_vlf_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04'
  UNION ALL
  SELECT 'metal_enclosed_busway_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.metal_enclosed_busway_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'oil_inspection_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.oil_inspection_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'panelboard_assemblies_ats25_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.panelboard_assemblies_ats25_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04'
  UNION ALL
  SELECT 'panelboard_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.panelboard_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'potential_transformer_ats_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.potential_transformer_ats_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'small_lv_dry_type_transformer_ats25_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.small_lv_dry_type_transformer_ats25_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04'
  UNION ALL
  SELECT 'switchgear_panelboard_mts_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.switchgear_panelboard_mts_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'switchgear_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.switchgear_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'switchgear_switchboard_ats25_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.switchgear_switchboard_ats25_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04'
  UNION ALL
  SELECT 'tandelta_mts_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.tandelta_mts_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'tandelta_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.tandelta_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'technical_reports' AS table_name, id::text AS id, submitted_by AS user_id, created_at FROM neta_ops.technical_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND submitted_by IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04'
  UNION ALL
  SELECT 'transformer_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.transformer_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'two_small_dry_type_xfmr_ats_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.two_small_dry_type_xfmr_ats_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'two_small_dry_type_xfmr_mts_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.two_small_dry_type_xfmr_mts_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
  UNION ALL
  SELECT 'voltage_potential_transformer_mts_reports' AS table_name, id::text AS id, user_id, created_at FROM neta_ops.voltage_potential_transformer_mts_reports WHERE job_id = '1ae71929-383b-489e-99b0-383260f252ac' AND user_id IN ('51e9f999-5cfd-4e35-b3ef-dd78d71a500e','b86267ec-9c34-4c72-bfbc-54afdc8b8bbd') AND created_at >= '2026-06-29' AND created_at < '2026-07-04' AND deleted_at IS NULL
) AS r
LEFT JOIN common.profiles p ON p.id = r.user_id
ORDER BY r.created_at;
