import React, { useState, useEffect } from 'react';
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { Select } from '../../../components/ui/Select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/Dialog';
import { Laptop, Plus, Edit, Trash2, Eye, X, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 15;
import { onboardingService, ITEquipmentTask } from '../../../services/hr/onboardingService';
import { useAuth } from '../../../lib/AuthContext';
import { toast } from '../../../components/ui/toast';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export const ITEquipmentTasks: React.FC = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<ITEquipmentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');
  const [page, setPage] = useState(1);
  
  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ITEquipmentTask | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    task_type: 'standard' as const,
    equipment_category: '',
    equipment_specs: {} as Record<string, any>,
    software_requirements: [] as Array<{ name: string; version?: string; required: boolean }>,
    access_requirements: [] as Array<{ system: string; role?: string; permissions?: string[] }>,
    status: 'pending' as const,
    priority: 'medium' as const,
    is_template: false,
    notes: '',
  });

  useEffect(() => {
    fetchData();
  }, [filter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const filters: any = {};
      
      if (filter !== 'all') {
        filters.status = filter;
      }
      
      const data = await onboardingService.getITEquipmentTasks(filters);
      setTasks(data);
    } catch (error: any) {
      console.error('Error fetching tasks:', error);
      toast({
        title: 'Error',
        description: 'Failed to load tasks. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSoftwareAdd = () => {
    setFormData(prev => ({
      ...prev,
      software_requirements: [
        ...prev.software_requirements,
        { name: '', required: true },
      ],
    }));
  };

  const handleSoftwareChange = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      software_requirements: prev.software_requirements.map((s, i) =>
        i === index ? { ...s, [field]: value } : s
      ),
    }));
  };

  const handleSoftwareRemove = (index: number) => {
    setFormData(prev => ({
      ...prev,
      software_requirements: prev.software_requirements.filter((_, i) => i !== index),
    }));
  };

  const handleAccessAdd = () => {
    setFormData(prev => ({
      ...prev,
      access_requirements: [
        ...prev.access_requirements,
        { system: '', role: '', permissions: [] },
      ],
    }));
  };

  const handleAccessChange = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      access_requirements: prev.access_requirements.map((a, i) =>
        i === index ? { ...a, [field]: value } : a
      ),
    }));
  };

  const handleAccessRemove = (index: number) => {
    setFormData(prev => ({
      ...prev,
      access_requirements: prev.access_requirements.filter((_, i) => i !== index),
    }));
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a task name',
        variant: 'destructive',
      });
      return;
    }

    if (!user) return;

    try {
      await onboardingService.createITEquipmentTask({
        ...formData,
        created_by: user.id,
        equipment_assigned: [],
      });

      toast({
        title: 'Success',
        description: 'IT equipment task created successfully',
        variant: 'success',
      });
      setIsCreateModalOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create task',
        variant: 'destructive',
      });
    }
  };

  const handleUpdate = async () => {
    if (!selectedTask) return;

    if (!formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a task name',
        variant: 'destructive',
      });
      return;
    }

    try {
      await onboardingService.updateITEquipmentTask(selectedTask.id, formData);

      toast({
        title: 'Success',
        description: 'IT equipment task updated successfully',
        variant: 'success',
      });
      setIsEditModalOpen(false);
      setSelectedTask(null);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update task',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      await onboardingService.deleteITEquipmentTask(id);
      toast({
        title: 'Success',
        description: 'Task deleted successfully',
        variant: 'success',
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete task',
        variant: 'destructive',
      });
    }
  };

  const openEditModal = (task: ITEquipmentTask) => {
    setSelectedTask(task);
    setFormData({
      name: task.name,
      description: task.description || '',
      task_type: task.task_type,
      equipment_category: task.equipment_category || '',
      equipment_specs: task.equipment_specs || {},
      software_requirements: task.software_requirements || [],
      access_requirements: task.access_requirements || [],
      status: task.status,
      priority: task.priority,
      is_template: task.is_template ?? false,
      notes: task.notes || '',
    });
    setIsEditModalOpen(true);
  };

  const openViewModal = (task: ITEquipmentTask) => {
    setSelectedTask(task);
    setIsViewModalOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      task_type: 'standard',
      equipment_category: '',
      equipment_specs: {},
      software_requirements: [],
      access_requirements: [],
      status: 'pending',
      priority: 'medium',
      is_template: false,
      notes: '',
    });
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status as keyof typeof colors] || colors.pending}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const colors = {
      low: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
      medium: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      urgent: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[priority as keyof typeof colors] || colors.medium}`}>
        {priority}
      </span>
    );
  };

  const filteredTasks = tasks.filter(t => {
    if (filter === 'all') return true;
    return t.status === filter;
  });
  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE));
  const paginatedTasks = filteredTasks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">IT Equipment Tasks</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Create and manage IT equipment provisioning tasks for new employees
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setIsCreateModalOpen(true);
          }}
          className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Task
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setFilter('all'); setPage(1); }}
        >
          All
        </Button>
        <Button
          variant={filter === 'pending' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setFilter('pending'); setPage(1); }}
        >
          Pending
        </Button>
        <Button
          variant={filter === 'in_progress' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setFilter('in_progress'); setPage(1); }}
        >
          In Progress
        </Button>
        <Button
          variant={filter === 'completed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setFilter('completed'); setPage(1); }}
        >
          Completed
        </Button>
      </div>

      {/* Tasks List */}
      {loading ? (
        <div className="text-center py-12"><LoadingSpinner size="md" /></div>
      ) : filteredTasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Laptop className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400">No tasks found</p>
          </CardContent>
        </Card>
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginatedTasks.map((task) => (
            <Card key={task.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{task.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {task.description || 'No description'}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  <div className="flex gap-2">
                    {getStatusBadge(task.status)}
                    {getPriorityBadge(task.priority)}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Type:</span> {task.task_type}
                  </div>
                  {task.equipment_category && (
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      <span className="font-medium">Category:</span> {task.equipment_category}
                    </div>
                  )}
                  {task.is_template && (
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      <span className="font-medium">Template</span>
                    </div>
                  )}
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Software:</span> {task.software_requirements?.length || 0}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Access:</span> {task.access_requirements?.length || 0}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openViewModal(task)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditModal(task)}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(task.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {filteredTasks.length > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Page {page} of {totalPages} ({filteredTasks.length} total)
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
        </>
      )}

      {/* Create Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create IT Equipment Task</DialogTitle>
            <DialogDescription>
              Create a new IT equipment provisioning task
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Name *</label>
              <Input
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g., Laptop Setup for New Hire"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <Textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Brief description of this task"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Task Type</label>
                <Select
                  name="task_type"
                  value={formData.task_type}
                  onChange={handleInputChange}
                  options={[
                    { value: 'standard', label: 'Standard' },
                    { value: 'laptop', label: 'Laptop' },
                    { value: 'phone', label: 'Phone' },
                    { value: 'access', label: 'Access' },
                    { value: 'software', label: 'Software' },
                    { value: 'hardware', label: 'Hardware' },
                    { value: 'custom', label: 'Custom' },
                  ]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <Select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  options={[
                    { value: 'pending', label: 'Pending' },
                    { value: 'in_progress', label: 'In Progress' },
                    { value: 'completed', label: 'Completed' },
                    { value: 'cancelled', label: 'Cancelled' },
                  ]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Priority</label>
                <Select
                  name="priority"
                  value={formData.priority}
                  onChange={handleInputChange}
                  options={[
                    { value: 'low', label: 'Low' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'high', label: 'High' },
                    { value: 'urgent', label: 'Urgent' },
                  ]}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Equipment Category</label>
              <Input
                name="equipment_category"
                value={formData.equipment_category}
                onChange={handleInputChange}
                placeholder="e.g., Laptop, Monitor, Phone"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="create-is_template"
                checked={formData.is_template}
                onChange={(e) => setFormData((prev) => ({ ...prev, is_template: e.target.checked }))}
                className="rounded border-gray-300"
              />
              <label htmlFor="create-is_template" className="text-sm font-medium">
                Save as template (use this set for standard new hires; assign from Onboarding Tracking)
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Notes</label>
              <Textarea
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                placeholder="Additional notes or instructions"
                rows={3}
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium">Software Requirements</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSoftwareAdd}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Software
                </Button>
              </div>
              <div className="space-y-2">
                {formData.software_requirements.map((software, index) => (
                  <div key={index} className="flex gap-2 items-center p-2 border rounded">
                    <Input
                      placeholder="Software name"
                      value={software.name}
                      onChange={(e) => handleSoftwareChange(index, 'name', e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Version (optional)"
                      value={software.version || ''}
                      onChange={(e) => handleSoftwareChange(index, 'version', e.target.value)}
                      className="flex-1"
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={software.required}
                        onChange={(e) => handleSoftwareChange(index, 'required', e.target.checked)}
                        className="rounded"
                      />
                      Required
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleSoftwareRemove(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium">Access Requirements</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAccessAdd}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Access
                </Button>
              </div>
              <div className="space-y-2">
                {formData.access_requirements.map((access, index) => (
                  <div key={index} className="p-2 border rounded space-y-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="System name"
                        value={access.system}
                        onChange={(e) => handleAccessChange(index, 'system', e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        placeholder="Role (optional)"
                        value={access.role || ''}
                        onChange={(e) => handleAccessChange(index, 'role', e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleAccessRemove(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <Input
                      placeholder="Permissions (comma-separated)"
                      value={access.permissions?.join(', ') || ''}
                      onChange={(e) => handleAccessChange(index, 'permissions', e.target.value.split(',').map(p => p.trim()).filter(p => p))}
                      className="text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            >
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal - Similar to Create */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit IT Equipment Task</DialogTitle>
            <DialogDescription>
              Update the task details and requirements
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Name *</label>
              <Input
                name="name"
                value={formData.name}
                onChange={handleInputChange}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <Textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Task Type</label>
                <Select
                  name="task_type"
                  value={formData.task_type}
                  onChange={handleInputChange}
                  options={[
                    { value: 'standard', label: 'Standard' },
                    { value: 'laptop', label: 'Laptop' },
                    { value: 'phone', label: 'Phone' },
                    { value: 'access', label: 'Access' },
                    { value: 'software', label: 'Software' },
                    { value: 'hardware', label: 'Hardware' },
                    { value: 'custom', label: 'Custom' },
                  ]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <Select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  options={[
                    { value: 'pending', label: 'Pending' },
                    { value: 'in_progress', label: 'In Progress' },
                    { value: 'completed', label: 'Completed' },
                    { value: 'cancelled', label: 'Cancelled' },
                  ]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Priority</label>
                <Select
                  name="priority"
                  value={formData.priority}
                  onChange={handleInputChange}
                  options={[
                    { value: 'low', label: 'Low' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'high', label: 'High' },
                    { value: 'urgent', label: 'Urgent' },
                  ]}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Equipment Category</label>
              <Input
                name="equipment_category"
                value={formData.equipment_category}
                onChange={handleInputChange}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-is_template"
                checked={formData.is_template}
                onChange={(e) => setFormData((prev) => ({ ...prev, is_template: e.target.checked }))}
                className="rounded border-gray-300"
              />
              <label htmlFor="edit-is_template" className="text-sm font-medium">
                Save as template (assign from Onboarding Tracking)
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Notes</label>
              <Textarea
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                rows={3}
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium">Software Requirements</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSoftwareAdd}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Software
                </Button>
              </div>
              <div className="space-y-2">
                {formData.software_requirements.map((software, index) => (
                  <div key={index} className="flex gap-2 items-center p-2 border rounded">
                    <Input
                      placeholder="Software name"
                      value={software.name}
                      onChange={(e) => handleSoftwareChange(index, 'name', e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Version (optional)"
                      value={software.version || ''}
                      onChange={(e) => handleSoftwareChange(index, 'version', e.target.value)}
                      className="flex-1"
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={software.required}
                        onChange={(e) => handleSoftwareChange(index, 'required', e.target.checked)}
                        className="rounded"
                      />
                      Required
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleSoftwareRemove(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium">Access Requirements</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAccessAdd}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Access
                </Button>
              </div>
              <div className="space-y-2">
                {formData.access_requirements.map((access, index) => (
                  <div key={index} className="p-2 border rounded space-y-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="System name"
                        value={access.system}
                        onChange={(e) => handleAccessChange(index, 'system', e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        placeholder="Role (optional)"
                        value={access.role || ''}
                        onChange={(e) => handleAccessChange(index, 'role', e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleAccessRemove(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <Input
                      placeholder="Permissions (comma-separated)"
                      value={access.permissions?.join(', ') || ''}
                      onChange={(e) => handleAccessChange(index, 'permissions', e.target.value.split(',').map(p => p.trim()).filter(p => p))}
                      className="text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            >
              Update Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTask?.name}</DialogTitle>
            <DialogDescription>
              {selectedTask?.description || 'No description'}
            </DialogDescription>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm font-medium">Type:</span>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{selectedTask.task_type}</p>
                </div>
                <div>
                  <span className="text-sm font-medium">Status:</span>
                  <div className="mt-1">{getStatusBadge(selectedTask.status)}</div>
                </div>
                <div>
                  <span className="text-sm font-medium">Priority:</span>
                  <div className="mt-1">{getPriorityBadge(selectedTask.priority)}</div>
                </div>
                {selectedTask.is_template && (
                  <div>
                    <span className="text-sm font-medium">Template:</span>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Yes (reusable for assignments)</p>
                  </div>
                )}
              </div>
              {selectedTask.equipment_category && (
                <div>
                  <span className="text-sm font-medium">Equipment Category:</span>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{selectedTask.equipment_category}</p>
                </div>
              )}
              {selectedTask.software_requirements && selectedTask.software_requirements.length > 0 && (
                <div>
                  <span className="text-sm font-medium">Software Requirements ({selectedTask.software_requirements.length}):</span>
                  <div className="mt-2 space-y-2">
                    {selectedTask.software_requirements.map((software, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 border rounded">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-sm flex-1">
                          {software.name} {software.version && `(${software.version})`}
                        </span>
                        {software.required && (
                          <span className="text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 px-2 py-1 rounded">
                            Required
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedTask.access_requirements && selectedTask.access_requirements.length > 0 && (
                <div>
                  <span className="text-sm font-medium">Access Requirements ({selectedTask.access_requirements.length}):</span>
                  <div className="mt-2 space-y-2">
                    {selectedTask.access_requirements.map((access, index) => (
                      <div key={index} className="p-2 border rounded">
                        <div className="text-sm font-medium">{access.system}</div>
                        {access.role && (
                          <div className="text-xs text-gray-600 dark:text-gray-400">Role: {access.role}</div>
                        )}
                        {access.permissions && access.permissions.length > 0 && (
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            Permissions: {access.permissions.join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedTask.notes && (
                <div>
                  <span className="text-sm font-medium">Notes:</span>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">
                    {selectedTask.notes}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
