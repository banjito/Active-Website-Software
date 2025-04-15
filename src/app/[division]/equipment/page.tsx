import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useDivision } from '@/App';
import EquipmentManagement from '@/components/equipment/EquipmentManagement';
import { EquipmentTracking } from '@/components/equipment/EquipmentTracking';
import { VehicleTracking } from '@/components/equipment/VehicleTracking';
import { Layout } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Plus, Truck, Wrench } from 'lucide-react';
import { PageLayout } from '@/components/ui/PageLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';

// Define PortalType type if not imported
type PortalType = 'neta' | 'lab' | 'scavenger';

export default function EquipmentPage() {
  const params = useParams();
  const { user } = useAuth();
  const { division, setDivision } = useDivision();
  const navigate = useNavigate();
  const [portalType, setPortalType] = useState<PortalType>('neta');
  const [activeTab, setActiveTab] = useState('equipment');
  
  useEffect(() => {
    if (params.division && params.division !== division) {
      setDivision(params.division as string);
    }
  }, [params.division, division, setDivision]);

  useEffect(() => {
    if (division) {
      if (['north_alabama', 'tennessee', 'georgia', 'international'].includes(division)) {
        setPortalType('neta');
      } else if (['calibration', 'armadillo'].includes(division)) {
        setPortalType('lab');
      } else if (division === 'scavenger') {
        setPortalType('scavenger');
      }
    }
  }, [division]);

  // Check user permissions
  const canAccessEquipment = user?.user_metadata?.role === 'Admin' || 
                            user?.user_metadata?.permissions?.includes('equipment_manage') || 
                            user?.user_metadata?.permissions?.includes('equipment_view');

  useEffect(() => {
    if (!user || !canAccessEquipment) {
      console.warn('User not logged in or does not have permission to access equipment.');
      navigate('/portal');
    }
  }, [user, canAccessEquipment, navigate]);

  if (!division || !user || !canAccessEquipment) {
    return <div>Loading or checking access...</div>;
  }

  const formattedDivision = division
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return (
    <PageLayout
      title={`${formattedDivision} Division - Equipment Management`}
      subtitle="Manage equipment inventory, vehicles, assignments, and maintenance schedules"
      actions={
        <div className="flex space-x-2">
          <Button onClick={() => console.log('Add new equipment')}>
            <Plus className="mr-2 h-4 w-4" />
            Add Equipment
          </Button>
          <Button onClick={() => console.log('Add new vehicle')}>
            <Plus className="mr-2 h-4 w-4" />
            Add Vehicle
          </Button>
        </div>
      }
    >
      <Tabs defaultValue="equipment" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="equipment">
            <Wrench className="mr-2 h-4 w-4" />
            Equipment
          </TabsTrigger>
          <TabsTrigger value="vehicles">
            <Truck className="mr-2 h-4 w-4" />
            Vehicles
          </TabsTrigger>
          <TabsTrigger value="management">Management</TabsTrigger>
        </TabsList>
        
        <TabsContent value="equipment" className="space-y-4">
          <EquipmentTracking division={division} />
        </TabsContent>
        
        <TabsContent value="vehicles" className="space-y-4">
          <VehicleTracking division={division} />
        </TabsContent>
        
        <TabsContent value="management" className="space-y-4">
          <EquipmentManagement 
            division={division}
            portal={portalType}
          />
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
} 