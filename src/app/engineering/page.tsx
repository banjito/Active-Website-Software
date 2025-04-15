import React from 'react';
import { Card, Badge } from '@/components/ui';
import { DesignApprovalWorkflow } from '@/components/engineering/DesignApprovalWorkflow';
import { TechnicalDocumentationLibrary } from '@/components/engineering/TechnicalDocumentationLibrary';
import PageLayout from '@/components/ui/PageLayout';
import { useAuth } from '@/lib/AuthContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { usePermissions } from '@/hooks/usePermissions';

export default function EngineeringPage() {
  const { user } = useAuth();
  const { checkPermission } = usePermissions();
  const hasAdminPermission = checkPermission('canManageContent');

  return (
    <PageLayout
      title="Engineering Portal"
      subtitle="Design management, technical documentation, and standards compliance"
      actions={<Badge className="!bg-[#f26722] !text-white">Engineering</Badge>}
    >
      <Tabs defaultValue="designs" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="designs">Designs</TabsTrigger>
          <TabsTrigger value="documentation">Documentation</TabsTrigger>
          <TabsTrigger value="standards">Standards & Compliance</TabsTrigger>
          <TabsTrigger value="drawings">Drawings</TabsTrigger>
        </TabsList>
        
        <TabsContent value="designs">
          <Card className="p-4">
            <DesignApprovalWorkflow />
          </Card>
        </TabsContent>
        
        <TabsContent value="documentation">
          <Card className="p-4">
            <TechnicalDocumentationLibrary />
          </Card>
        </TabsContent>
        
        <TabsContent value="standards">
          <Card className="p-4">
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <h3 className="text-xl font-medium mb-2">Standards & Compliance Updates</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                This feature is currently in development.
              </p>
              {hasAdminPermission && (
                <p className="text-sm text-yellow-600 dark:text-yellow-500">
                  Admin Note: Implementation planned for subtask 6.3
                </p>
              )}
            </div>
          </Card>
        </TabsContent>
        
        <TabsContent value="drawings">
          <Card className="p-4">
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <h3 className="text-xl font-medium mb-2">Drawing Repository</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                This feature is currently in development.
              </p>
              {hasAdminPermission && (
                <p className="text-sm text-yellow-600 dark:text-yellow-500">
                  Admin Note: Implementation planned for subtask 6.4
                </p>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
} 