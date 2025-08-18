import React, { useEffect, useState, useMemo, useLayoutEffect } from 'react';
import {
  BriefcaseIcon,
  CalendarIcon,
  CheckCircle,
  ChevronRight,
  Clock,
  Users,
  Users2,
  MapPin,
  Building,
  FileText,
  TrendingUp,
  DollarSign,
  BarChart,
  CheckCheck,
  Clipboard,
  AlertTriangle,
  Battery,
  ListChecks,
  PanelTop,
  AreaChart,
  Workflow,
  Plug,
  Wrench,
  FileLineChart,
  Gauge,
  Settings
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { supabase, isConnectionError, isSchemaError, tryWithFallbackSchema } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { NETAMetrics } from '@/components/metrics/NETAMetrics';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useMobileDetection } from '@/hooks/useMobileDetection';

interface CountsData {
  customers: number;
  contacts: number;
  jobs: number;
  activeJobs: number;
  upcomingJobs: number;
  completedJobs: number;
  opportunities?: number;
  awardedOpportunities?: number;
  documents?: number;
}

interface Job {
  id: string;
  title: string;
  status: string;
  division?: string;
  job_number?: string;
  due_date?: string;
  customers: {
    company_name?: string | null;
    name: string;
  } | null;
}

interface Opportunity {
  id: string;
  quote_number: string;
  title: string;
  status: string;
  expected_value: number | null;
  customer_id: string;
  customers: {
    company_name?: string | null;
    name: string;
  } | null;
  created_at: string;
}

interface DivisionDashboardProps {
  division: string;
  divisionName: string;
  showTechnicians?: boolean;
  showEquipment?: boolean;
  showCalibrations?: boolean;
  showDocumentation?: boolean;
  customMetrics?: any[];
  metricsComponent?: React.ReactNode;
}

export const DivisionDashboard: React.FC<DivisionDashboardProps> = ({
  division,
  divisionName,
  showTechnicians = false,
  showEquipment = false,
  showCalibrations = false,
  showDocumentation = false,
  customMetrics = [],
  metricsComponent
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isMobile, deviceType } = useMobileDetection();
  
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Add opportunities state
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [opportunitiesLoading, setOpportunitiesLoading] = useState(false);
  
  // Stats state
  const [counts, setCounts] = useState<CountsData>({
    customers: 0,
    contacts: 0,
    jobs: 0,
    activeJobs: 0,
    upcomingJobs: 0,
    completedJobs: 0,
    documents: 0
  });

  // Sample data for tabs that might not exist yet
  const technicians = useMemo(() => [], []);
  const equipment = useMemo(() => [], []);
  const calibrations = useMemo(() => [], []);

  // Scroll to top when the component mounts or division changes
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [division]);

  useEffect(() => {
    if (user) {
      setLoading(true);
      setError(null);
      
      const loadData = async () => {
        try {
          // Load all necessary data
          const [countsData, jobs] = await Promise.all([
            fetchCounts(),
            fetchRecentJobs()
          ]);

          setCounts(countsData);
          
          // Transform and set jobs
          const transformedJobs = (jobs || []).map((job: any) => ({
            id: job.id,
            title: job.title,
            status: job.status,
            division: job.division,
            job_number: job.job_number,
            due_date: job.due_date,
            customers: job.customers ? {
              company_name: job.customers.company_name || null,
              name: job.customers.name || 'Unknown Customer'
            } : null
          }));
          
          setRecentJobs(transformedJobs);

          // Fetch opportunities for NETA divisions
          if (isNETADivision) {
            const opportunitiesData = await fetchOpportunities();
            setOpportunities(opportunitiesData);
          }

        } catch (err: any) {
          console.error(`${divisionName} Dashboard - Error loading data:`, err);
          setError(err.message || 'Failed to load dashboard data.');
        } finally {
          setLoading(false);
        }
      };

      loadData();
    } else {
      setLoading(false); // Not logged in, stop loading
    }
  }, [user, division, divisionName]);

  async function fetchCounts(): Promise<CountsData> {
    try {
      console.log(`${divisionName} Dashboard - Fetching counts for division:`, division);
      
      // Base queries
      const customersQuery = supabase.schema('common').from('customers').select('*', { count: 'exact', head: true });
      const contactsQuery = supabase.schema('common').from('contacts').select('*', { count: 'exact', head: true });
      let jobsQuery = supabase.schema('neta_ops').from('jobs').select('*', { count: 'exact', head: true });
      let activeJobsQuery = supabase.schema('neta_ops').from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'in_progress');
      let upcomingJobsQuery = supabase.schema('neta_ops').from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      let completedJobsQuery = supabase.schema('neta_ops').from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'completed');
      
      // Documents query
      let documentsQuery = supabase.schema('common').from('documents').select('*', { count: 'exact', head: true });
      
      // Initialize opportunity counts (will remain 0 if that module is disabled)
      const opportunitiesCount = 0;
      const awardedOpportunitiesCount = 0;
      let documentsCount = 0;
      
      // Add division filter for relevant queries
      jobsQuery = jobsQuery.eq('division', division);
      activeJobsQuery = activeJobsQuery.eq('division', division);
      upcomingJobsQuery = upcomingJobsQuery.eq('division', division);
      completedJobsQuery = completedJobsQuery.eq('division', division);
      
      // Add division filter to documents query if applicable
      if (showDocumentation) {
        documentsQuery = documentsQuery.eq('division', division);
      }
      
      // Log the queries being prepared
      console.log(`${divisionName} Dashboard - Preparing queries with schemas:`, {
        customers: 'common',
        contacts: 'common',
        jobs: 'neta_ops',
        opportunities: 'not used',
        documents: showDocumentation ? 'common' : 'not used'
      });
      
      // Handle opportunity counts - currently disabled
      // Uncomment and fix the condition below when we're ready to show opportunities
      /*
      if (showOpportunities) {
        try {
          const getOpportunityCounts = async (schema: string) => {
            const results = { total: 0, awarded: 0 };
            
            try {
              let totalQuery = supabase.schema(schema).from('opportunities').select('*', { count: 'exact', head: true });
              let awardedQuery = supabase.schema(schema).from('opportunities').select('*', { count: 'exact', head: true }).eq('status', 'awarded');
              
              // Try to apply division filter if that column exists
              try {
                const { data: columnInfo, error: columnError } = await supabase
                  .schema(schema)
                  .rpc('get_columns_info', { table_name: 'opportunities' });
                  
                if (!columnError && columnInfo) {
                  const hasColumn = columnInfo.some((col: any) => col.column_name === 'division');
                  if (hasColumn) {
                    console.log(`${divisionName} Dashboard - Applying division filter to opportunity counts`);
                    totalQuery = totalQuery.eq('division', division);
                    awardedQuery = awardedQuery.eq('division', division);
                  } else {
                    console.log(`${divisionName} Dashboard - Division column not found in opportunities table, skipping filter for counts`);
                  }
                }
              } catch (columnError) {
                console.warn(`${divisionName} Dashboard - Could not check if division column exists:`, columnError);
                // Continue without division filter
              }
              
              const [totalResult, awardedResult] = await Promise.all([totalQuery, awardedQuery]);
              
              if (totalResult.error) throw totalResult.error;
              if (awardedResult.error) throw awardedResult.error;
              
              results.total = totalResult.count || 0;
              results.awarded = awardedResult.count || 0;
            } catch (error) {
              if (isSchemaError(error)) {
                console.error(`Schema error in ${schema}.opportunities:`, error);
              } else {
                console.error(`Error fetching opportunity counts from ${schema}:`, error);
              }
              throw error;
            }
            
            return results;
          };
          
          const opportunityCounts = await tryWithFallbackSchema(getOpportunityCounts, 'business', 'common');
          opportunitiesCount = opportunityCounts.total;
          awardedOpportunitiesCount = opportunityCounts.awarded;
          
          console.log(`${divisionName} Dashboard - Fetched opportunity counts:`, {
            total: opportunitiesCount,
            awarded: awardedOpportunitiesCount
          });
        } catch (err) {
          console.error(`${divisionName} Dashboard - Error fetching opportunity counts:`, err);
          // Keep zeros for the counts
        }
      }
      */

      // Handle documents count
      if (showDocumentation) {
        try {
          const { count, error } = await documentsQuery;
          
          if (error) {
            if (isSchemaError(error)) {
              console.warn(`Schema error for documents table. It may not exist yet:`, error);
            } else {
              console.error(`Error fetching document counts:`, error);
            }
            // Keep zero for documents count on error
          } else {
            documentsCount = count || 0;
          }
        } catch (err) {
          console.error(`${divisionName} Dashboard - Error fetching document counts:`, err);
          // Keep zero for documents count
        }
      }

      // Prepare queries array for the base counts
      const queries = [
        customersQuery,
        contactsQuery,
        jobsQuery,
        activeJobsQuery,
        upcomingJobsQuery,
        completedJobsQuery
      ];
      
      console.log(`${divisionName} Dashboard - Executing ${queries.length} base queries`);
      
      // Execute all base queries in parallel
      const results = await Promise.all(queries);

      // Check for errors in results
      let hasSchemaErrors = false;
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.error) {
          console.error(`${divisionName} Dashboard - Error fetching count for query #${i}:`, result.error);
          
          // Check specifically for schema-related errors
          if (isSchemaError(result.error)) {
            hasSchemaErrors = true;
          }
          
          if (isConnectionError(result.error)) {
            throw new Error('Unable to connect to the database. Please check your connection.');
          }
        }
      }
      
      // If we have schema errors, throw a specific error
      if (hasSchemaErrors) {
        console.error(`${divisionName} Dashboard - Schema-related errors detected. Database structure may be incorrect.`);
        throw new Error('Database schema error. The required tables may not exist or permissions may be incorrect.');
      }
      
      // Base counts - use 0 as fallback if errors occurred
      const countsData: CountsData = {
        customers: results[0].count || 0,
        contacts: results[1].count || 0,
        jobs: results[2].count || 0,
        activeJobs: results[3].count || 0,
        upcomingJobs: results[4].count || 0,
        completedJobs: results[5].count || 0
      };
      
      // Add documents count
      if (showDocumentation) {
        countsData.documents = documentsCount;
      }

      console.log(`${divisionName} Dashboard - Successfully fetched counts:`, countsData);
      return countsData;
    } catch (error) {
      console.error(`Unexpected error in ${divisionName} fetchCounts:`, error);
      // Return zeros for all counts in case of error, to prevent UI from breaking
      const defaultData: CountsData = {
        customers: 0,
        contacts: 0,
        jobs: 0,
        activeJobs: 0,
        upcomingJobs: 0,
        completedJobs: 0,
        documents: 0
      };
      // Re-throw to allow the component to show an error state
      throw error;
    }
  }
  
  async function fetchRecentJobs(): Promise<Job[]> {
    try {
      console.log(`${divisionName} Dashboard - Fetching recent jobs for division:`, division);
      
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .select(`
          id,
          title,
          status,
          division,
          job_number,
          due_date,
          customer_id
        `)
        .eq('division', division)
        .order('created_at', { ascending: false })
        .limit(6);

      if (error) {
        console.error(`Error fetching recent jobs for ${divisionName}:`, error);
        throw error;
      }

      console.log(`${divisionName} Dashboard - Fetched ${data?.length || 0} recent jobs`);

      // Fetch customer data for each job
      const jobsWithCustomers = await Promise.all((data || []).map(async (job) => {
        if (!job.customer_id) {
          return { ...job, customers: null };
        }

        const { data: customerData, error: customerError } = await supabase
          .schema('common')
          .from('customers')
          .select('id, name, company_name')
          .eq('id', job.customer_id)
          .single();

        if (customerError) {
          console.warn(`Error fetching customer for job ${job.id}:`, customerError);
          return { ...job, customers: null };
        }

        return { ...job, customers: customerData };
      }));

      return jobsWithCustomers;
    } catch (error) {
      console.error(`Unexpected error in ${divisionName} fetchRecentJobs:`, error);
      throw error;
    }
  }

  // Function to fetch opportunities for NETA divisions
  async function fetchOpportunities(): Promise<Opportunity[]> {
    if (!isNETADivision) return [];
    
    try {
      setOpportunitiesLoading(true);
      console.log(`${divisionName} Dashboard - Fetching opportunities for division:`, division);
      
      const { data, error } = await supabase
        .schema('business')
        .from('opportunities')
        .select(`
          id,
          quote_number,
          title,
          status,
          expected_value,
          customer_id,
          created_at
        `)
        .eq('amp_division', division)
        .in('status', ['awarded', 'decision - forecasted win', 'quote'])
        .order('created_at', { ascending: false })
        .limit(6);

      if (error) {
        console.error(`Error fetching opportunities for ${divisionName}:`, error);
        throw error;
      }

      console.log(`${divisionName} Dashboard - Fetched ${data?.length || 0} opportunities`);

      // Fetch customer data for each opportunity
      const opportunitiesWithCustomers = await Promise.all((data || []).map(async (opp) => {
        if (!opp.customer_id) {
          return { ...opp, customers: null };
        }

        const { data: customerData, error: customerError } = await supabase
          .schema('common')
          .from('customers')
          .select('id, name, company_name')
          .eq('id', opp.customer_id)
          .single();

        if (customerError) {
          console.warn(`Error fetching customer for opportunity ${opp.id}:`, customerError);
          return { ...opp, customers: null };
        }

        return { ...opp, customers: customerData };
      }));

      return opportunitiesWithCustomers;
    } catch (error) {
      console.error(`Unexpected error in ${divisionName} fetchOpportunities:`, error);
      return [];
    } finally {
      setOpportunitiesLoading(false);
    }
  }

  // Function to create a job from an opportunity
  async function createJobFromOpportunity(opportunity: Opportunity) {
    try {
      if (!user?.id || !opportunity.customer_id) {
        alert('Unable to create job: Missing user or customer information');
        return;
      }

      // Create the job
      const { data: jobData, error: jobError } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .insert({
          title: opportunity.title,
          customer_id: opportunity.customer_id,
          division: division,
          status: 'pending',
          user_id: user.id,
          opportunity_id: opportunity.id
        })
        .select()
        .single();

      if (jobError) {
        console.error('Error creating job:', jobError);
        alert('Failed to create job. Please try again.');
        return;
      }

      // Update the opportunity to link it to the job
      const { error: updateError } = await supabase
        .schema('business')
        .from('opportunities')
        .update({ job_id: jobData.id })
        .eq('id', opportunity.id);

      if (updateError) {
        console.warn('Warning: Job created but could not link to opportunity:', updateError);
      }

      alert(`Job created successfully! Job ID: ${jobData.job_number || jobData.id}`);
      
      // Refresh the data
      const [newCountsData, newJobs] = await Promise.all([
        fetchCounts(),
        fetchRecentJobs()
      ]);
      setCounts(newCountsData);
      setRecentJobs(newJobs.map((job: any) => ({
        id: job.id,
        title: job.title,
        status: job.status,
        division: job.division,
        job_number: job.job_number,
        due_date: job.due_date,
        customers: job.customers ? {
          company_name: job.customers.company_name || null,
          name: job.customers.name || 'Unknown Customer'
        } : null
      })));

      // Navigate to the new job
      navigate(`/jobs/${jobData.id}`);
    } catch (error) {
      console.error('Error creating job from opportunity:', error);
      alert('Failed to create job. Please try again.');
    }
  }

  function getJobStatusColor(status: string) {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  // Check if the division is one with special metrics
  const hasCustomMetricsComponent = ['calibration', 'armadillo', 'scavenger'].includes(division);

  // Add formatDate helper function
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  // Check if the division is a NETA division
  const isNETADivision = ['north_alabama', 'tennessee', 'georgia', 'international'].includes(division);

  return (
    <div className={`w-full max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8 no-horizontal-scroll ${isMobile ? 'mobile-container mobile-force-small' : ''}`}>
      {error && (
        <div className="mb-4 p-3 sm:p-4 bg-red-100 text-red-800 rounded-md text-sm">
          Error loading dashboard: {error}
        </div>
      )}
      
      {/* Title section */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-dark-900 mobile-dashboard-title">
          {divisionName} Dashboard
        </h1>
        <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600 dark:text-dark-400 mobile-text-sm">
          {`Welcome to the ${divisionName} portal`}
        </p>
      </div>
      
      {/* Quick Actions Section - Add for NETA Divisions */}
      {isNETADivision && (
        <div className="mb-6 sm:mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mobile-gap-2">
          <Card className="hover:shadow-md hover:border-green-200 transition-all cursor-pointer touch-target">
            <Link to={`/${division}/equipment`} className="block p-3 sm:p-4 mobile-card-sm">
              <div className="flex items-center justify-between mobile-gap-2">
                <div className="flex items-center min-w-0 flex-1 mobile-gap-2">
                  <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-full mr-2 sm:mr-3 flex-shrink-0 mobile-p-2">
                    <Wrench className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 mobile-icon-sm" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-gray-900 dark:text-white text-sm sm:text-base truncate mobile-card-title">Equipment Management</h3>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mobile-text-xs">Track, assign, and maintain equipment</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 flex-shrink-0 ml-2 mobile-icon-sm" />
              </div>
            </Link>
          </Card>
          
          <Card className="hover:shadow-md hover:border-orange-200 transition-all cursor-pointer touch-target">
            <Link to={`/${division}/maintenance`} className="block p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center min-w-0 flex-1">
                  <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-full mr-2 sm:mr-3 flex-shrink-0">
                    <Wrench className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-gray-900 dark:text-white text-sm sm:text-base truncate">Equipment Maintenance</h3>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 line-clamp-2">Schedule and track maintenance</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 flex-shrink-0 ml-2 mobile-icon-sm" />
              </div>
            </Link>
          </Card>

          {/* Opportunities Quick Action - Only for NETA Divisions */}
          {isNETADivision && (
            <Card className="hover:shadow-md hover:border-blue-200 transition-all cursor-pointer touch-target">
              <Link to="/sales-dashboard/opportunities" className="block p-3 sm:p-4 mobile-card-sm">
                <div className="flex items-center justify-between mobile-gap-2">
                  <div className="flex items-center min-w-0 flex-1 mobile-gap-2">
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-full mr-2 sm:mr-3 flex-shrink-0 mobile-p-2">
                      <BriefcaseIcon className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500 mobile-icon-sm" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium text-gray-900 dark:text-white text-sm sm:text-base truncate mobile-card-title">Sales Opportunities</h3>
                      <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mobile-text-xs">View and convert opportunities to jobs</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 flex-shrink-0 ml-2 mobile-icon-sm" />
                </div>
              </Link>
            </Card>
          )}
          
          <Card className="hover:shadow-md hover:border-blue-200 transition-all cursor-pointer touch-target">
            <Link to={`/${division}/profiles`} className="block p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center min-w-0 flex-1">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-full mr-2 sm:mr-3 flex-shrink-0">
                    <Users className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-gray-900 dark:text-white text-sm sm:text-base truncate">Technician Profiles</h3>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 line-clamp-2">Manage skills and certifications</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 flex-shrink-0 ml-2" />
              </div>
            </Link>
          </Card>
          
          <Card className="hover:shadow-md hover:border-blue-200 transition-all cursor-pointer touch-target">
            <Link to={`/${division}/jobs`} className="block p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center min-w-0 flex-1">
                  <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-full mr-2 sm:mr-3 flex-shrink-0">
                    <BriefcaseIcon className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-gray-900 dark:text-white text-sm sm:text-base truncate">Job Management</h3>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 line-clamp-2">View and manage jobs</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 flex-shrink-0 ml-2" />
              </div>
            </Link>
          </Card>
          

        </div>
      )}
      
      {/* 1. Performance Metrics Section - For NETA divisions use NETAMetrics, otherwise use provided component */}
      {metricsComponent ? (
        <div className="mb-12">
          {metricsComponent}
        </div>
      ) : !hasCustomMetricsComponent && (
        <div className="mb-12">
          <NETAMetrics division={division} />
        </div>
      )}
      
      {/* Performance metrics placeholder for special divisions with no metrics component */}
      {hasCustomMetricsComponent && !metricsComponent && <div className="mb-12"></div>}

      {/* 2. Core Business Metrics (Customers, Contacts, Documents) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8 mt-8 sm:mt-12">
        {/* Customers Card */}
        <Card>
          <div className="flex items-center justify-between p-4 sm:p-6 mobile-card-sm">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground dark:text-white/70 mobile-text-xs">Customers</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mobile-text-lg">{counts.customers}</p>
              <Link to={`/${division}/customers`}>
                <Button variant="ghost" size="sm" className="mt-1 sm:mt-2 h-6 sm:h-8 px-0 text-xs text-[#f26722] hover:text-[#f26722]/90 dark:text-[#f26722] dark:hover:text-[#f26722]/90 mobile-btn-sm mobile-text-xs">
                  View all customers
                  <ChevronRight className="ml-1 h-3 w-3 mobile-icon-xs" />
                </Button>
              </Link>
            </div>
            <div className="rounded-md bg-black/5 dark:bg-white/5 p-2 flex-shrink-0 mobile-p-2">
              <Building className="h-4 w-4 text-black dark:text-[#8D5F3D] mobile-icon-sm" />
            </div>
          </div>
        </Card>

        {/* Contacts Card */}
        <Card>
          <div className="flex items-center justify-between p-4 sm:p-6">
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground dark:text-white/70">Contacts</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{counts.contacts}</p>
              <Link to={`/${division}/contacts`}>
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

        {/* Documents Card (conditionally shown) */}
        {showDocumentation && (
          <Card>
            <div className="flex items-center justify-between p-4 sm:p-6">
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-medium text-muted-foreground dark:text-white/70">Documents</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{counts.documents}</p>
                <Link to={`/${division}/reports`}>
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
        )}
      </div>

      {/* 3. Job Status Section */}
      <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4 mobile-section-title">Job Status</h2>
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

      {/* 4. Recent Activity Tabs */}
      <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4 mobile-section-title">Recent Activity</h2>
      <Card>
        <Tabs defaultValue="jobs" className="w-full">
          <TabsList className="flex justify-between bg-transparent space-x-0 border-b overflow-x-auto mobile-scroll">
            <TabsTrigger 
              className="data-[state=active]:border-b-2 data-[state=active]:border-[#f26722] data-[state=active]:text-[#f26722] data-[state=active]:shadow-none rounded-none bg-transparent flex-1 h-12 sm:h-16 text-sm sm:text-base min-w-0"
              value="jobs"
            >
              <div className="flex flex-col items-center justify-center px-2">
                <span className="truncate">Recent Jobs</span>
                <span className="text-xs text-muted-foreground mt-1">
                  {recentJobs.length} jobs
                </span>
              </div>
            </TabsTrigger>
            
            {showDocumentation && (
              <TabsTrigger 
                className="data-[state=active]:border-b-2 data-[state=active]:border-[#f26722] data-[state=active]:text-[#f26722] data-[state=active]:shadow-none rounded-none bg-transparent flex-1 h-12 sm:h-16 text-sm sm:text-base min-w-0"
                value="documents"
              >
                <div className="flex flex-col items-center justify-center px-2">
                  <span className="truncate">Recent Documents</span>
                  <span className="text-xs text-muted-foreground mt-1">
                    {recentJobs.length} documents
                  </span>
                </div>
              </TabsTrigger>
            )}
            
            {showTechnicians && (
              <TabsTrigger 
                className="data-[state=active]:border-b-2 data-[state=active]:border-[#f26722] data-[state=active]:text-[#f26722] data-[state=active]:shadow-none rounded-none bg-transparent flex-1 h-12 sm:h-16 text-sm sm:text-base min-w-0"
                value="technicians"
              >
                <div className="flex flex-col items-center justify-center px-2">
                  <span className="truncate">Technicians</span>
                  <span className="text-xs text-muted-foreground mt-1">
                    {technicians.length} technicians
                  </span>
                </div>
              </TabsTrigger>
            )}

            {showEquipment && (
              <TabsTrigger 
                className="data-[state=active]:border-b-2 data-[state=active]:border-[#f26722] data-[state=active]:text-[#f26722] data-[state=active]:shadow-none rounded-none bg-transparent flex-1 h-12 sm:h-16 text-sm sm:text-base min-w-0"
                value="equipment"
              >
                <div className="flex flex-col items-center justify-center px-2">
                  <span className="truncate">Equipment</span>
                  <span className="text-xs text-muted-foreground mt-1">
                    {equipment.length} items
                  </span>
                </div>
              </TabsTrigger>
            )}

            {showCalibrations && (
              <TabsTrigger 
                className="data-[state=active]:border-b-2 data-[state=active]:border-[#f26722] data-[state=active]:text-[#f26722] data-[state=active]:shadow-none rounded-none bg-transparent flex-1 h-12 sm:h-16 text-sm sm:text-base min-w-0"
                value="calibrations"
              >
                <div className="flex flex-col items-center justify-center px-2">
                  <span className="truncate">Calibrations</span>
                  <span className="text-xs text-muted-foreground mt-1">
                    {calibrations.length} calibrations
                  </span>
                </div>
              </TabsTrigger>
            )}

            {/* Opportunities Tab - Only for NETA Divisions */}
            {isNETADivision && (
              <TabsTrigger 
                className="data-[state=active]:border-b-2 data-[state=active]:border-[#f26722] data-[state=active]:text-[#f26722] data-[state=active]:shadow-none rounded-none bg-transparent flex-1 h-12 sm:h-16 text-sm sm:text-base min-w-0"
                value="opportunities"
              >
                <div className="flex flex-col items-center justify-center px-2">
                  <span className="truncate">Opportunities</span>
                  <span className="text-xs text-muted-foreground mt-1">
                    {counts.opportunities || 0} opportunities
                  </span>
                </div>
              </TabsTrigger>
            )}
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
                        <Card className="h-full hover:shadow-md transition-shadow duration-200 cursor-pointer touch-target mobile-tap-highlight">
                          <div className="p-3 sm:p-4 flex flex-col h-full mobile-card-compact">
                            <div className="flex justify-between items-start gap-2 mobile-gap-1">
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-[#f26722] truncate text-sm sm:text-base mobile-card-title">{job.title}</p>
                                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2 mobile-text-xs">
                                  {job.customers?.company_name || job.customers?.name || 'No customer'}
                                </p>
                              </div>
                              <Badge 
                                className={`
                                  px-1.5 sm:px-2 py-1 text-xs font-normal whitespace-nowrap flex-shrink-0 mobile-badge
                                  ${job.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' : ''}
                                  ${job.status === 'in-progress' || job.status === 'in_progress' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' : ''}
                                  ${job.status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' : ''}
                                `}
                              >
                                {job.status?.replace(/_/g, ' ')}
                              </Badge>
                            </div>
                            
                            <div className="flex justify-between mt-auto pt-2 sm:pt-3 text-xs sm:text-sm text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 mt-2 sm:mt-3">
                              <div className="flex items-center min-w-0 flex-1">
                                <BriefcaseIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 flex-shrink-0" />
                                <span className="truncate">{job.job_number || 'No number'}</span>
                              </div>
                              {/* Due date is optional */}
                              {job.due_date && (
                                <div className="flex items-center flex-shrink-0 ml-2">
                                  <CalendarIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1" />
                                  <span className="hidden sm:inline">{formatDate(job.due_date)}</span>
                                  <span className="sm:hidden">{new Date(job.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>
                  
                  <div className="flex justify-center mt-4 sm:mt-6">
                    <Link to={`/${division}/jobs`}>
                      <Button variant="outline" size="sm" className="touch-target">
                        View all jobs
                        <ChevronRight className="ml-1 h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                </>
              )}
            </div>
          </TabsContent>
          
          {showDocumentation && (
            <TabsContent value="documents" className="p-3 sm:p-6">
              <Card>
                <div className="p-4 sm:p-6 text-center py-6 sm:py-8">
                  <FileText className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 text-gray-300 dark:text-gray-600" />
                  <h3 className="text-base sm:text-lg font-medium mb-2">Documentation Module</h3>
                  <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mb-4">
                    Access to division-specific documentation and files.
                  </p>
                  <Button className="touch-target">Browse Documentation</Button>
                </div>
              </Card>
            </TabsContent>
          )}

          {showCalibrations && (
            <TabsContent value="calibrations" className="p-3 sm:p-6">
              <Card>
                <div className="p-4 sm:p-6 text-center py-6 sm:py-8">
                  <Wrench className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 text-gray-300 dark:text-gray-600" />
                  <h3 className="text-base sm:text-lg font-medium mb-2">Calibrations Module</h3>
                  <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mb-4">
                    Access to calibration services and equipment management.
                  </p>
                  <Button className="touch-target">Browse Calibrations</Button>
                </div>
              </Card>
            </TabsContent>
          )}

          {/* Opportunities Tab Content - Only for NETA Divisions */}
          {isNETADivision && (
            <TabsContent value="opportunities" className="p-3 sm:p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Sales Opportunities</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    View opportunities that can be converted to jobs
                  </p>
                </div>
                
                {/* Opportunities List */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {opportunitiesLoading ? (
                    <Card className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600">
                      <div className="text-center py-6">
                        <BriefcaseIcon className="h-12 w-12 mx-auto mb-3 text-gray-400 dark:text-gray-500" />
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Loading Opportunities</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Fetching available opportunities...
                        </p>
                      </div>
                    </Card>
                  ) : opportunities.length === 0 ? (
                    <Card className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600">
                      <div className="text-center py-6">
                        <BriefcaseIcon className="h-12 w-12 mx-auto mb-3 text-gray-400 dark:text-gray-500" />
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">No Opportunities Found</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          No opportunities found for this division.
                        </p>
                      </div>
                    </Card>
                  ) : (
                    opportunities.map((opportunity) => (
                      <Card key={opportunity.id} className="p-4 hover:shadow-md transition-shadow duration-200">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <h4 className="font-medium text-gray-900 dark:text-white text-sm sm:text-base truncate">{opportunity.title}</h4>
                            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{opportunity.customers?.company_name || opportunity.customers?.name || 'No customer'}</p>
                          </div>
                          <Badge 
                            className={`
                              px-1.5 sm:px-2 py-1 text-xs font-normal whitespace-nowrap flex-shrink-0 mobile-badge
                              ${opportunity.status === 'awarded' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' : ''}
                              ${opportunity.status === 'decision - forecasted win' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' : ''}
                              ${opportunity.status === 'quote' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' : ''}
                            `}
                          >
                            {opportunity.status?.replace(/-/g, ' ')}
                          </Badge>
                        </div>
                        <div className="flex justify-between mt-auto pt-2 sm:pt-3 text-xs sm:text-sm text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 mt-2 sm:mt-3">
                          <div className="flex items-center min-w-0 flex-1">
                            <DollarSign className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 flex-shrink-0" />
                            <span className="truncate">{opportunity.quote_number || 'No quote number'}</span>
                          </div>
                          <div className="flex items-center flex-shrink-0 ml-2">
                            <CalendarIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1" />
                            <span className="hidden sm:inline">{formatDate(opportunity.created_at)}</span>
                            <span className="sm:hidden">{new Date(opportunity.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                          </div>
                        </div>
                        <div className="flex justify-end mt-3">
                          <Button
                            variant="outline"
                            size="sm"
                            className="touch-target"
                            onClick={() => createJobFromOpportunity(opportunity)}
                          >
                            Convert to Job
                          </Button>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
                
                <div className="flex justify-center mt-6">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="touch-target"
                    onClick={() => navigate('/sales-dashboard/opportunities')}
                  >
                    View All Opportunities
                    <ChevronRight className="ml-1 h-3 w-3" />
                  </Button>
                </div>
                
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <BriefcaseIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="ml-3">
                      <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">Create Jobs from Opportunities</h4>
                      <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                        Click "Convert to Job" on any opportunity to create a new job. This will automatically link the opportunity to the job and set the job status to pending.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </Card>
    </div>
  );
};

export default DivisionDashboard;