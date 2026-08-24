-- Give public websites a single authoritative source for "open roles".
--
-- Background: ampqes.com/careers reads Supabase with the anon key. Because anon
-- holds a blanket SELECT on common.job_requisitions, that site was querying the
-- raw table and applying its own status filter, which drifted from ampOS and
-- kept showing roles after they were closed.
--
-- common.v_posted_job_requisitions already encodes the correct rule and exposes
-- only public-safe columns (no notes, no approval history, no internal fields).
-- It just was not readable by anon. This grants that read and adds pay_type so
-- hourly roles render correctly rather than being shown as annual salaries.
--
-- pay_type is appended LAST on purpose: CREATE OR REPLACE VIEW can only add
-- columns at the end of the existing list, never insert into the middle.

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
    AND status::text = 'posted'::text
    AND (posting_end_date IS NULL OR posting_end_date >= CURRENT_DATE)
  ORDER BY posted_at DESC;

GRANT SELECT ON common.v_posted_job_requisitions TO anon;
GRANT SELECT ON common.v_posted_job_requisitions TO authenticated;
