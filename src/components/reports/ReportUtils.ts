/**
 * Utility functions for report components
 */

/**
 * Navigates back to the job details page, optionally directly to the assets tab
 * @param navigate - The navigate function from useNavigate
 * @param jobId - The ID of the job to navigate back to
 * @param location - The location object from useLocation
 */
export const navigateAfterSave = (
  navigate: (path: string) => void,
  jobId: string | undefined,
  location: { search: string }
) => {
  if (!jobId) return;
  const searchParams = new URLSearchParams(location.search);
  const fromApproval = searchParams.get('fromApproval') === 'true';
  const returnToAssets = searchParams.get('returnToAssets') === 'true';

  // If we came from the approval viewer, stay on the same page (no redirect)
  if (fromApproval) {
    return;
  }

  // Otherwise, keep existing behavior
  if (returnToAssets || true) {
    navigate(`/jobs/${jobId}?tab=assets`);
  } else {
    navigate(`/jobs/${jobId}`);
  }
}; 