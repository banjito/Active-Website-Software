import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BriefcaseIcon, CalendarIcon, CheckCircle, ChevronRight, Clock, FileText, Users2, Building, Wrench } from 'lucide-react';
import Card from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { supabase, isConnectionError, isSchemaError } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useDemoMode } from '@/lib/DemoModeContext';

interface CountsData {
  customers: number;
  contacts: number;
  jobs: number;
  activeJobs: number;
  upcomingJobs: number;
  completedJobs: number;
  documents?: number;
}

interface JobItem {
  id: string;
  title: string;
  status: string;
  division?: string;
  job_number?: string;
  due_date?: string;
  customers: {
    company_name?: string | null;
    name: string;
  };
}

const FIELD_TECH_DIVISIONS = ['north_alabama', 'tennessee', 'georgia', 'international'];

export const FieldTechDashboard: React.FC = () => {
  const { user } = useAuth();
  const { maskCustomerName, maskJobTitle } = useDemoMode();
  const [recentJobs, setRecentJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const technicians = useMemo(() => [], []);
  const equipment = useMemo(() => [], []);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const [counts, jobs] = await Promise.all([
          fetchCounts(),
          fetchRecentJobs()
        ]);

        setCounts(counts);
        const transformed = (jobs || []).map((job: any) => ({
          id: job.id,
          title: job.title,
          status: job.status,
          division: job.division,
          job_number: job.job_number,
          due_date: job.due_date,
          customers: {
            company_name: job.customer?.company_name || null,
            name: job.customer?.name || 'Unknown Customer'
          }
        }));
        setRecentJobs(transformed);
      } catch (err: any) {
        setError(err?.message || 'Failed to load dashboard.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user]);

  const [counts, setCounts] = useState<CountsData>({
    customers: 0,
    contacts: 0,
    jobs: 0,
    activeJobs: 0,
    upcomingJobs: 0,
    completedJobs: 0,
    documents: 0
  });

  async function fetchCounts(): Promise<CountsData> {
    try {
      const customersQuery = supabase.schema('common').from('customers').select('*', { count: 'exact', head: true });
      const contactsQuery = supabase.schema('common').from('contacts').select('*', { count: 'exact', head: true });

      let jobsQuery = supabase.schema('neta_ops').from('jobs').select('*', { count: 'exact', head: true }).is('deleted_at', null).in('division', FIELD_TECH_DIVISIONS);
      let activeJobsQuery = supabase.schema('neta_ops').from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'in_progress').is('deleted_at', null).in('division', FIELD_TECH_DIVISIONS);
      let upcomingJobsQuery = supabase.schema('neta_ops').from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'pending').is('deleted_at', null).in('division', FIELD_TECH_DIVISIONS);
      let completedJobsQuery = supabase.schema('neta_ops').from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'completed').is('deleted_at', null).in('division', FIELD_TECH_DIVISIONS);

      const queries = [customersQuery, contactsQuery, jobsQuery, activeJobsQuery, upcomingJobsQuery, completedJobsQuery];
      const results = await Promise.all(queries);

      for (const r of results) {
        if (r.error) {
          if (isSchemaError(r.error)) {
            throw new Error('Database schema error. Required tables may be missing.');
          }
          if (isConnectionError(r.error)) {
            throw new Error('Unable to connect to the database.');
          }
        }
      }

      return {
        customers: results[0].count || 0,
        contacts: results[1].count || 0,
        jobs: results[2].count || 0,
        activeJobs: results[3].count || 0,
        upcomingJobs: results[4].count || 0,
        completedJobs: results[5].count || 0,
        documents: 0
      };
    } catch (e) {
      throw e;
    }
  }

  async function fetchRecentJobs() {
    const { data, error } = await supabase
      .schema('neta_ops')
      .from('jobs')
      .select('id, title, status, division, job_number, due_date, customer_id')
      .in('division', FIELD_TECH_DIVISIONS)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;

    // Batch-fetch all customers in one query (avoids N+1)
    const customerIds = [...new Set((data || []).filter(j => j.customer_id).map(j => j.customer_id))];
    let customerMap: Record<string, any> = {};
    if (customerIds.length > 0) {
      const { data: customersData } = await supabase
        .schema('common')
        .from('customers')
        .select('id, name, company_name')
        .in('id', customerIds);
      if (customersData) {
        customersData.forEach((c: any) => { customerMap[c.id] = c; });
      }
    }

    return (data || []).map(job => ({
      ...job,
      customer: job.customer_id ? (customerMap[job.customer_id] || null) : null,
    }));
  }

  function getJobStatusColor(status: string) {
    switch ((status || '').toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
      case 'in-progress':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8">
      {error && (
        <div className="mb-4 p-3 sm:p-4 bg-red-100 text-red-800 rounded-md text-sm">{error}</div>
      )}

      <p className="mb-6 sm:mb-8 text-sm sm:text-base text-gray-600 dark:text-dark-400">
        Alabama, Tennessee, Georgia, and International
      </p>

      <div className="mb-6 sm:mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="hover:shadow-md hover:border-blue-200 transition-all cursor-pointer">
          <Link to="/field-tech/jobs" className="block p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center min-w-0 flex-1">
                <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-full mr-2 sm:mr-3 flex-shrink-0">
                  <BriefcaseIcon className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-gray-900 dark:text-white text-sm sm:text-base truncate">Job Management</h3>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-white line-clamp-2">View all jobs across divisions</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 flex-shrink-0 ml-2" />
            </div>
          </Link>
        </Card>

        <Card className="hover:shadow-md hover:border-green-200 transition-all cursor-pointer">
          <Link to="/field-tech/customers" className="block p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center min-w-0 flex-1">
                <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-full mr-2 sm:mr-3 flex-shrink-0">
                  <Building className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-gray-900 dark:text-white text-sm sm:text-base truncate">Customers</h3>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-white line-clamp-2">Browse customer accounts</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 flex-shrink-0 ml-2" />
            </div>
          </Link>
        </Card>

        <Card className="hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer">
          <Link to="/field-tech/contacts" className="block p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center min-w-0 flex-1">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-full mr-2 sm:mr-3 flex-shrink-0">
                  <Users2 className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-gray-900 dark:text-white text-sm sm:text-base truncate">Contacts</h3>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-white line-clamp-2">View customer contacts</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 flex-shrink-0 ml-2" />
            </div>
          </Link>
        </Card>

        <Card className="hover:shadow-md hover:border-green-200 transition-all cursor-pointer">
          <Link to="/field-tech/equipment" className="block p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center min-w-0 flex-1">
                <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-full mr-2 sm:mr-3 flex-shrink-0">
                  <Wrench className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-gray-900 dark:text-white text-sm sm:text-base truncate">Equipment</h3>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-white line-clamp-2">Manage equipment</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 flex-shrink-0 ml-2" />
            </div>
          </Link>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8 mt-8 sm:mt-12">
        <Card>
          <div className="flex items-center justify-between p-4 sm:p-6">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground dark:text-white/70">Customers</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{counts.customers}</p>
              <Link to="/field-tech/customers">
                <Button variant="ghost" size="sm" className="mt-1 sm:mt-2 h-6 sm:h-8 px-0 text-xs text-[#f26722] hover:text-[#f26722]/90 dark:text-[#f26722] dark:hover:text-[#f26722]/90">
                  View all customers
                  <ChevronRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </div>
            <div className="rounded-md bg-black/5 dark:bg-white/5 p-2 flex-shrink-0">
              <Building className="h-4 w-4 text-black dark:text-[#8D5F3D]" />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between p-4 sm:p-6">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground dark:text-white/70">Contacts</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{counts.contacts}</p>
              <Link to="/field-tech/contacts">
                <Button variant="ghost" size="sm" className="mt-1 sm:mt-2 h-6 sm:h-8 px-0 text-xs text-[#f26722] hover:text-[#f26722]/90 dark:text-[#f26722] dark:hover:text-[#f26722]/90">
                  View all contacts
                  <ChevronRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </div>
            <div className="rounded-md bg-black/5 dark:bg-white/5 p-2 flex-shrink-0">
              <Users2 className="h-4 w-4 text-black dark:text-[#8D5F3D]" />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between p-4 sm:p-6">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground dark:text-white/70">Documents</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{counts.documents}</p>
              <Link to="/field-tech/reports">
                <Button variant="ghost" size="sm" className="mt-1 sm:mt-2 h-6 sm:h-8 px-0 text-xs text-[#f26722] hover:text-[#f26722]/90 dark:text-[#f26722] dark:hover:text-[#f26722]/90">
                  View all documents
                  <ChevronRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </div>
            <div className="rounded-md bg-black/5 dark:bg-white/5 p-2 flex-shrink-0">
              <FileText className="h-4 w-4 text-black dark:text-[#8D5F3D]" />
            </div>
          </div>
        </Card>
      </div>

      <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">Job Status</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <Card>
          <div className="flex items-center justify-between p-4 sm:p-6">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground dark:text-white/70">Active Jobs</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{counts.activeJobs}</p>
            </div>
            <div className="rounded-full bg-black/5 dark:bg-white/5 p-2 flex-shrink-0">
              <Clock className="h-4 w-4 text-black dark:text-[#8D5F3D]" />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between p-4 sm:p-6">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground dark:text-white/70">Upcoming Jobs</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{counts.upcomingJobs}</p>
            </div>
            <div className="rounded-full bg-black/5 dark:bg-white/5 p-2 flex-shrink-0">
              <CalendarIcon className="h-4 w-4 text-black dark:text-[#8D5F3D]" />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between p-4 sm:p-6">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground dark:text-white/70">Completed Jobs</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{counts.completedJobs}</p>
            </div>
            <div className="rounded-full bg-black/5 dark:bg-white/5 p-2 flex-shrink-0">
              <CheckCircle className="h-4 w-4 text-black dark:text-[#8D5F3D]" />
            </div>
          </div>
        </Card>
      </div>

      <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">Recent Activity</h2>
      <Card>
        <Tabs defaultValue="jobs" className="w-full">
          <TabsList className="flex justify-between bg-transparent space-x-0 border-b overflow-x-auto">
            <TabsTrigger className="data-[state=active]:border-b-2 data-[state=active]:border-[#f26722] data-[state=active]:text-[#f26722] data-[state=active]:shadow-none rounded-none bg-transparent flex-1 h-12 sm:h-16 text-sm sm:text-base min-w-0" value="jobs">
              <div className="flex flex-col items-center justify-center px-2">
                <span className="truncate">Recent Jobs</span>
                <span className="text-xs text-muted-foreground mt-1">{recentJobs.length} jobs</span>
              </div>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="jobs" className="p-3 sm:p-6">
            <div className="grid grid-cols-1 gap-3 sm:gap-4">
              {recentJobs.length === 0 ? (
                <div className="text-center py-6 text-gray-500 text-sm sm:text-base">No recent jobs found</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {recentJobs.map((job) => (
                      <Link to={`/jobs/${job.id}`} key={job.id}>
                        <Card className="h-full hover:shadow-md transition-shadow duration-200 cursor-pointer">
                          <div className="p-3 sm:p-4 flex flex-col h-full">
                            <div className="flex justify-between items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-[#f26722] truncate text-sm sm:text-base">{maskJobTitle(job.title)}</p>
                                <p className="text-xs sm:text-sm text-gray-600 dark:text-white mt-1 line-clamp-2">{maskCustomerName(job.customers?.company_name || job.customers?.name) || 'No customer'}</p>
                              </div>
                              <Badge className={`${getJobStatusColor(job.status)} px-1.5 sm:px-2 py-1 text-xs font-normal whitespace-nowrap flex-shrink-0`}>
                                {(job.status || '').replace(/_/g, ' ')}
                              </Badge>
                            </div>
                            <div className="flex justify-between mt-auto pt-2 sm:pt-3 text-xs sm:text-sm text-gray-500 dark:text-white border-t border-gray-100 dark:border-gray-700 mt-2 sm:mt-3">
                              <div className="flex items-center min-w-0 flex-1">
                                <BriefcaseIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 flex-shrink-0" />
                                <span className="truncate">{job.job_number || 'No number'}</span>
                              </div>
                              {job.due_date && (
                                <div className="flex items-center flex-shrink-0 ml-2">
                                  <CalendarIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1" />
                                  <span>{new Date(job.due_date).toLocaleDateString()}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>

                  <div className="flex justify-center mt-4 sm:mt-6">
                    <Link to="/field-tech/jobs">
                      <Button variant="outline" size="sm">
                        View all jobs
                        <ChevronRight className="ml-1 h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
};

export default FieldTechDashboard;


