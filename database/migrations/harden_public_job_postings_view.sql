-- Close a gap in common.v_posted_job_requisitions.
--
-- ampqes.com/careers now reads this view as its ONLY definition of a public
-- job posting. As part of that change the website deleted its own filters,
-- including is_template=is.false. The view's WHERE clause never covered
-- is_template, so a template row left in 'posted' status would publish itself
-- to the public careers page with nothing to catch it.
--
-- No template rows exist today and nothing in ampOS sets is_template on
-- requisitions, so this is closing a latent gap rather than fixing live
-- breakage. It matters because the website deliberately has no safety net now.
--
-- IS NOT TRUE rather than = false: the column is nullable, and a NULL should
-- be treated as "not a template", not filtered out.
--
-- The column projection is unchanged. It is a published contract for
-- ampqes.com: do not remove or reorder columns here without telling that repo.

CREATE OR REPLACE VIEW common.v_posted_job_requisitions AS
 SELECT id,
    title,
    department,
    location,
    employment_type,
    salary_range_min,
    salary_range_max,
    description,
    requirements,
    requisition_number,
    posted_at,
    application_deadline,
    posting_end_date,
    pay_type
   FROM common.job_requisitions
  WHERE deleted_at IS NULL
    AND is_template IS NOT TRUE
    AND status::text = 'posted'::text
    AND (posting_end_date IS NULL OR posting_end_date >= CURRENT_DATE)
  ORDER BY posted_at DESC;

COMMENT ON VIEW common.v_posted_job_requisitions IS
  'Public contract for ampqes.com/careers. The sole definition of a publicly '
  'visible job posting. Read by the anon role at website build time. Changing '
  'the WHERE clause changes what the public sees; removing or reordering '
  'columns breaks the ampqes.com build by design. Coordinate with that repo.';

GRANT SELECT ON common.v_posted_job_requisitions TO anon;
GRANT SELECT ON common.v_posted_job_requisitions TO authenticated;
