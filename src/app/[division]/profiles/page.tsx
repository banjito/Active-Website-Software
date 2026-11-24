import { useCan } from "@/lib/permissions";
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useDivision } from '@/App';
import { PageLayout } from '@/components/ui/PageLayout';
import { TechnicianProfileManagement } from '@/components/profile/TechnicianProfileManagement';
import { PortalType } from '@/lib/types/scheduling';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function TechnicianProfilesPage() {
  const params = useParams();
  const { user } = useAuth();
  const { can: canDo } = useCan();
  const { division, setDivision } = useDivision();
  const navigate = useNavigate();
  const [portalType, setPortalType] = useState<PortalType>('neta');
  
  useEffect(() => {
    if (params.division && params.division !== division) {
      setDivision(params.division as string);
    }
  }, [params.division, division, setDivision]);

  useEffect(() => {
    if (division) {
      // Every field tech division (including ones added from the sidebar) is neta.
      if (division === 'scavenger') {
        setPortalType('scavenger');
      } else {
        setPortalType('neta');
      }
    }
  }, [division]);

  // Check access permissions
  const canAccessProfiles = canDo("schedule.edit");

  useEffect(() => {
    if (!user || !canAccessProfiles) {
      console.warn('User not logged in or does not have permission to access technician profiles.');
      navigate('/portal');
    }
  }, [user, canAccessProfiles, navigate]);

  if (!division || !user || !canAccessProfiles) {
    return <div className="flex min-h-[60vh] items-center justify-center"><LoadingSpinner size="md" /></div>;
  }

  const formattedDivision = division
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return (
    <PageLayout
      title={`${formattedDivision} Division - Technician Profiles`}
      subtitle="Manage technician skills, certifications, and qualifications"
    >
      <TechnicianProfileManagement portalType={portalType} division={division} />
    </PageLayout>
  );
} 