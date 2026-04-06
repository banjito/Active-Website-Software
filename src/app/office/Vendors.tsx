import React from 'react';
import { PageLayout } from '@/components/ui/PageLayout';
import VendorManagement from '@/components/office/VendorManagement';

const Vendors: React.FC = () => {
  return (
    <PageLayout
      title="Vendors"
      subtitle="Manage vendor information, contacts, and contracts"
      breadcrumbs={[
        { label: 'Home', to: '/' },
        { label: 'Vendors', to: '/office/vendors' },
      ]}
    >
      <VendorManagement />
    </PageLayout>
  );
};

export default Vendors;








