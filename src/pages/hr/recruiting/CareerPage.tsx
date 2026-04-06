import React, { useState, useEffect } from 'react';
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/Dialog';
import { Globe, Eye, Edit, Plus, Search, MapPin, Briefcase, DollarSign } from 'lucide-react';
import { jobRequisitionsService, JobRequisition, getJobRequisitionDisplayHtml } from '../../../services/hr/jobRequisitionsService';
import { toast } from '../../../components/ui/toast';

export const CareerPage: React.FC = () => {
  const [postedRequisitions, setPostedRequisitions] = useState<JobRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [selectedRequisition, setSelectedRequisition] = useState<JobRequisition | null>(null);

  useEffect(() => {
    fetchPostedRequisitions();
  }, []);

  const fetchPostedRequisitions = async () => {
    try {
      setLoading(true);
      const all = await jobRequisitionsService.getAll();
      // Show both approved and posted requisitions on career page
      const posted = all.filter(req => req.status === 'approved' || req.status === 'posted');
      setPostedRequisitions(posted);
    } catch (error: any) {
      console.error('Error fetching posted requisitions:', error);
      toast({
        title: 'Error',
        description: 'Failed to load career page listings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePost = async (id: string) => {
    try {
      await jobRequisitionsService.post(id);
      toast({
        title: 'Success',
        description: 'Job posted to career page',
        variant: 'success',
      });
      fetchPostedRequisitions();
    } catch (error: any) {
      console.error('Error posting requisition:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to post job',
        variant: 'destructive',
      });
    }
  };

  const openPreviewModal = (requisition: JobRequisition) => {
    setSelectedRequisition(requisition);
    setIsPreviewModalOpen(true);
  };

  const filteredRequisitions = postedRequisitions.filter(req => {
    const matchesSearch = req.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         req.department.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterDepartment === 'all' || req.department === filterDepartment;
    return matchesSearch && matchesFilter;
  });

  const departments = Array.from(new Set(postedRequisitions.map(req => req.department)));

  const formatSalaryRange = (min?: number, max?: number) => {
    if (!min && !max) return 'Competitive';
    if (min && max) return `$${min.toLocaleString()} - $${max.toLocaleString()}`;
    if (min) return `$${min.toLocaleString()}+`;
    if (max) return `Up to $${max.toLocaleString()}`;
    return 'Competitive';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Career Page</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage public job listings
          </p>
        </div>
        <Button 
          className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
          onClick={() => window.open('/careers', '_blank')}
        >
          <Globe className="mr-2 h-4 w-4" />
          View Public Page
        </Button>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search jobs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-dark-150 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
              />
            </div>
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-dark-150 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
            >
              <option value="all">All Departments</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Posted Jobs */}
      {loading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#f26722]"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
            </div>
          </CardContent>
        </Card>
      ) : filteredRequisitions.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Briefcase className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">No jobs available</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Approved and posted requisitions will appear here
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredRequisitions.map((req) => (
            <Card key={req.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-xl">{req.title}</CardTitle>
                    <CardDescription className="flex flex-wrap items-center gap-4 mt-2">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {req.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-4 w-4" />
                        {req.department}
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4" />
                        {formatSalaryRange(req.salary_range_min, req.salary_range_max)}
                      </span>
                    </CardDescription>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    req.status === 'posted' 
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                      : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  }`}>
                    {req.status === 'posted' ? 'Posted' : 'Approved'}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                {(req.description || req.requirements) && (
                  <div
                    className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2 prose prose-sm max-w-none [&_p]:m-0 [&_p]:inline"
                    dangerouslySetInnerHTML={{ __html: getJobRequisitionDisplayHtml(req) }}
                  />
                )}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {req.status === 'posted' && req.posted_at 
                      ? `Posted: ${new Date(req.posted_at).toLocaleDateString()}`
                      : req.status === 'approved' && req.approved_at
                      ? `Approved: ${new Date(req.approved_at).toLocaleDateString()}`
                      : 'N/A'}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openPreviewModal(req)}>
                      <Eye className="mr-2 h-4 w-4" />
                      Preview
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      <Dialog open={isPreviewModalOpen} onOpenChange={setIsPreviewModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedRequisition?.title}</DialogTitle>
            <DialogDescription>
              Preview how this job appears on the career page
            </DialogDescription>
          </DialogHeader>
          {selectedRequisition && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Department</label>
                  <p className="text-gray-900 dark:text-white">{selectedRequisition.department}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Location</label>
                  <p className="text-gray-900 dark:text-white">{selectedRequisition.location}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Employment Type</label>
                  <p className="text-gray-900 dark:text-white">{selectedRequisition.employment_type}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Salary Range</label>
                  <p className="text-gray-900 dark:text-white">
                    {formatSalaryRange(selectedRequisition.salary_range_min, selectedRequisition.salary_range_max)}
                  </p>
                </div>
              </div>
              {(selectedRequisition.description || selectedRequisition.requirements || selectedRequisition.notes) && (
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 block">Job Description & Requirements</label>
                  <div
                    className="text-gray-900 dark:text-white prose prose-sm dark:prose-invert max-w-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_p]:mb-2"
                    dangerouslySetInnerHTML={{ __html: getJobRequisitionDisplayHtml(selectedRequisition) }}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPreviewModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
