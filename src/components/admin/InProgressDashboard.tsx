import React, { useState, useEffect } from 'react';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { supabase } from '@/lib/supabase';
import { 
  MapPin, 
  Building2, 
  DollarSign, 
  Calendar,
  Users,
  Clock,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Filter,
  Search,
  RefreshCw,
  Eye,
  Edit,
  Plus
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/Chart';

interface Job {
  id: string;
  title: string;
  status: string;
  start_date: string | null;
  due_date: string | null;
  budget: number | null;
  priority: string;
  job_number: string | null;
  division: string | null;
  description: string | null;
  customer_id: string | null;
  opportunity_id: string | null;
  customers?: {
    id: string;
    name: string;
    company_name: string;
  } | null;
  opportunities?: {
    id: string;
    quoted_amount: number | null;
    expected_value: number | null;
    title: string | null;
    status: string | null;
  } | null;
}

interface RegionData {
  region: string;
  jobs: Job[];
  totalQuotedValue: number;
  totalBudget: number;
  activeJobs: number;
}

type TimeframeType = 'quarterly' | '6months' | 'yearly' | 'custom';
type StatusFilterType = 'all' | 'active' | 'billed' | 'to_be_billed' | 'pending' | 'completed' | 'on_hold';

const InProgressDashboard: React.FC = () => {
  const [regionData, setRegionData] = useState<RegionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showOppModal, setShowOppModal] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [showJobModal, setShowJobModal] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [opportunityDetails, setOpportunityDetails] = useState<any | null>(null);
  const [jobDetails, setJobDetails] = useState<any | null>(null);
  
  // Filter state
  const [timeframe, setTimeframe] = useState<TimeframeType>('quarterly');
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [selectedQuarter, setSelectedQuarter] = useState<1 | 2 | 3 | 4>(() => {
    const month = new Date().getMonth();
    if (month >= 0 && month <= 2) return 1;
    if (month >= 3 && month <= 5) return 2;
    if (month >= 6 && month <= 8) return 3;
    return 4;
  });

  // Fetch real data from database - fetch ALL data once
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch ALL jobs from neta_ops.jobs - no date filtering on server side
        let jobs, jobsError;
        
        try {
          // Get ALL jobs from neta_ops schema
          const jobsResult = await supabase
            .schema('neta_ops')
            .from('jobs')
            .select('*')
            .is('deleted_at', null);
          
          jobs = jobsResult.data;
          jobsError = jobsResult.error;
          
          console.log('Jobs query result:', { jobs, jobsError });
          
          // If we have jobs, try to get their opportunity data from business schema
          if (jobs && jobs.length > 0) {
            console.log('Fetching opportunity data for jobs...');
            
            // Get all unique opportunity_ids from jobs
            const opportunityIds = jobs
              .map(job => job.opportunity_id)
              .filter(id => id !== null && id !== undefined);
            
            console.log('Opportunity IDs found:', opportunityIds);
            console.log('Sample job data to check fields:', jobs[0]);
            console.log('All job opportunity_id values:', jobs.map(job => ({ id: job.id, title: job.title, opportunity_id: job.opportunity_id })));
            
            // Check if there are any other opportunity-related fields
            const sampleJob = jobs[0];
            const opportunityFields = Object.keys(sampleJob).filter(key => 
              key.toLowerCase().includes('opportunity') || 
              key.toLowerCase().includes('quote') ||
              key.toLowerCase().includes('proposal')
            );
            console.log('Fields that might contain opportunity data:', opportunityFields);
            
            if (opportunityIds.length > 0) {
              // Fetch opportunities from business schema
              const { data: opportunities, error: opportunitiesError } = await supabase
                .schema('business')
                .from('opportunities')
                .select('id, quoted_amount, expected_value, title, status')
                .in('id', opportunityIds);
              
              console.log('Opportunities query result:', { opportunities, opportunitiesError });
              
              // Also fetch letter proposals to get real quoted amounts
              let letterProposals = null;
              if (opportunities && opportunities.length > 0) {
                console.log('Fetching letter proposals for quoted amounts...');
                const { data: proposals, error: proposalsError } = await supabase
                  .schema('business')
                  .from('letter_proposals')
                  .select('opportunity_id, html, created_at, data')
                  .in('opportunity_id', opportunityIds);
                
                letterProposals = proposals;
                console.log('Letter proposals query result:', { proposals, proposalsError });
              }
              
              console.log('Opportunities query result:', { opportunities, opportunitiesError });
              
              if (opportunities && !opportunitiesError) {
                console.log('Raw opportunities data:', opportunities);
                
                // Create a map of opportunity data
                const opportunityMap = new Map();
                
                // Create a map of letter proposals by opportunity_id
                const proposalMap = new Map();
                if (letterProposals) {
                  console.log('Processing letter proposals:', letterProposals.length);
                  // Sort newest-first per opportunity
                  const byOpp: Record<string, any[]> = {} as any;
                  (letterProposals as any[]).forEach((lp: any) => {
                    if (!byOpp[lp.opportunity_id]) byOpp[lp.opportunity_id] = [];
                    byOpp[lp.opportunity_id].push(lp);
                  });
                  Object.keys(byOpp).forEach((k) => {
                    byOpp[k].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                  });

                  Object.values(byOpp).forEach((proposalsForOpp: any[]) => {
                    const proposal = proposalsForOpp[0]; // newest
                    console.log('Raw proposal data:', {
                      opportunity_id: proposal.opportunity_id,
                      hasHtml: !!proposal.html,
                      dataKeys: proposal.data ? Object.keys(proposal.data) : 'no data'
                    });
                    
                    // Log the complete data structure for one proposal
                    if (proposal.data) {
                      console.log('Complete proposal data structure:', JSON.stringify(proposal.data, null, 2));
                    }
                    
                    if (proposal.data) {
                      // Try different possible data structures
                      let quotedAmount = null;
                      
                      // Try parsing from HTML first (authoritative)
                      if (!quotedAmount && proposal.html) {
                        try {
                          const html: string = proposal.html as string;
                          const m = html.match(/Option\s*1:\s*Where\s*NET\s*30\s*Terms\s*are\s*applicable[^$]*\$([0-9,]+(?:\.[0-9]{2})?)/i);
                          if (m && m[1]) {
                            quotedAmount = Number(m[1].replace(/,/g, '')) || null;
                            console.log('Parsed NET30 from HTML:', quotedAmount);
                          }
                        } catch (e) {
                          console.warn('Failed parsing NET30 from HTML:', e);
                        }
                      }
                      
                      // Check for calculatedValues structure
                      if (!quotedAmount && proposal.data.calculatedValues) {
                        quotedAmount = proposal.data.calculatedValues.net30Price || 
                                     proposal.data.calculatedValues.totalPrice ||
                                     proposal.data.calculatedValues.finalPrice;
                        console.log('Found calculatedValues:', proposal.data.calculatedValues);
                      }
                      
                      // Check for direct price fields
                      if (!quotedAmount) {
                        quotedAmount = proposal.data.net30Price || 
                                     proposal.data.totalPrice ||
                                     proposal.data.finalPrice ||
                                     proposal.data.price;
                        console.log('Found direct price fields:', {
                          net30Price: proposal.data.net30Price,
                          totalPrice: proposal.data.totalPrice,
                          finalPrice: proposal.data.finalPrice,
                          price: proposal.data.price
                        });
                      }
                      
                      // Check for hoursSummary structure
                      if (!quotedAmount && proposal.data.hoursSummary) {
                        quotedAmount = proposal.data.hoursSummary.totalCost ||
                                     proposal.data.hoursSummary.finalCost;
                        console.log('Found hoursSummary:', proposal.data.hoursSummary);
                      }
                      
                      console.log('Final quoted amount from proposal:', quotedAmount);
                      if (quotedAmount) {
                        proposalMap.set(proposal.opportunity_id, quotedAmount);
                      }
                    }
                  });
                } else {
                  console.log('No letter proposals found');
                }
                
                opportunities.forEach(opp => {
                  // Get quoted amount from letter proposal if available
                  const proposalQuotedAmount = proposalMap.get(opp.id);
                  
                  console.log('Processing opportunity:', {
                    id: opp.id,
                    quoted_amount: opp.quoted_amount,
                    quoted_amount_raw: JSON.stringify(opp.quoted_amount),
                    expected_value: opp.expected_value,
                    proposalQuotedAmount: proposalQuotedAmount,
                    title: opp.title,
                    status: opp.status,
                    hasQuotedAmount: 'quoted_amount' in opp,
                    quotedAmountType: typeof opp.quoted_amount,
                    expectedValueType: typeof opp.expected_value
                  });
                  
                  opportunityMap.set(opp.id, {
                    id: opp.id,
                    quoted_amount: proposalQuotedAmount || opp.quoted_amount || null,
                    expected_value: opp.expected_value || null,
                    title: opp.title || null,
                    status: opp.status || null
                  });
                });
                
                console.log('Opportunity map created:', Array.from(opportunityMap.entries()));
                
                // Attach opportunity data to jobs
                jobs = jobs.map(job => {
                  const opportunityData = job.opportunity_id ? opportunityMap.get(job.opportunity_id) || null : null;
                  console.log(`Job ${job.id} (${job.title}) -> Opportunity ${job.opportunity_id} -> Data:`, opportunityData);
                  
                  return {
                    ...job,
                    opportunities: opportunityData
                  };
                });
                
                console.log('Jobs with attached opportunity data:', jobs);
              } else {
                console.log('No opportunities found or error:', opportunitiesError);
              }
            }
          }
        } catch (error) {
          console.error('Error in jobs query:', error);
          // Fallback to simple query
          const fallbackResult = await supabase
            .schema('neta_ops')
            .from('jobs')
            .select('*')
            .is('deleted_at', null)
            .in('status', ['in_progress', 'pending', 'planning']);
          
          jobs = fallbackResult.data;
          jobsError = fallbackResult.error;
        }

        console.log('Jobs query result:', { jobs, jobsError });
        if (jobsError) {
          console.error('Error fetching jobs:', jobsError);
        }

        // If no jobs found, let's try a broader query to see what's available
        if (!jobs || jobs.length === 0) {
          console.log('No jobs found with current filters, trying broader query...');
          
          // Try to get all jobs regardless of status
          const { data: allJobs, error: allJobsError } = await supabase
            .schema('neta_ops')
            .from('jobs')
            .select('*')
            .is('deleted_at', null)
            .limit(10);
          
          console.log('All jobs sample:', { allJobs, allJobsError });
        }

        // Group data by region/division
        const regionMap = new Map<string, RegionData>();

        // Process jobs
        if (jobs && jobs.length > 0) {
          console.log('Processing jobs:', jobs.length);
          jobs.forEach((job: Job) => {
            const region = job.division || 'Unassigned';
            console.log('Job region:', region, 'Job:', job.title);
            if (!regionMap.has(region)) {
              regionMap.set(region, {
                region,
                jobs: [],
                totalQuotedValue: 0,
                totalBudget: 0,
                activeJobs: 0
              });
            }
            
            const regionData = regionMap.get(region)!;
            regionData.jobs.push(job);
            
            // Add quoted amount from opportunity if available (do NOT fall back to expected_value)
            const quotedAmount = job.opportunities?.quoted_amount ?? 0;
            regionData.totalQuotedValue += quotedAmount;
            
            // Add budget separately
            regionData.totalBudget += job.budget || 0;
            regionData.activeJobs++;
          });
        } else {
          console.log('No jobs found or jobs is null/empty');
        }

        // Convert map to array and sort by total quoted value
        const sortedRegions = Array.from(regionMap.values())
          .sort((a, b) => b.totalQuotedValue - a.totalQuotedValue);

        console.log('Final region data:', sortedRegions);
        
        // Only show sample data if we truly have no real data
        if (sortedRegions.length === 0 && (!jobs || jobs.length === 0)) {
          console.log('No real data found, showing sample data for testing...');
          const sampleData: RegionData[] = [
            {
              region: 'Tech',
              jobs: [
                {
                  id: 'sample-1',
                  title: 'Sample Job - Database Migration',
                  status: 'in_progress',
                  start_date: '2024-01-15',
                  due_date: '2024-02-15',
                  budget: 45000,
                  priority: 'high',
                  job_number: 'TECH-001',
                  division: 'Tech',
                  description: 'Sample job description',
                  customer_id: 'sample-customer',
                  opportunity_id: 'sample-opp-1',
                  customers: {
                    id: 'sample-customer',
                    name: 'Sample Customer',
                    company_name: 'Sample Company Inc.'
                  },
                  opportunities: {
                    id: 'sample-opp-1',
                    quoted_amount: 50000,
                    expected_value: 50000
                  }
                }
              ],
              totalQuotedValue: 50000,
              totalBudget: 45000,
              activeJobs: 1
            }
          ];
          setRegionData(sampleData);
        } else {
          console.log('Setting real data:', sortedRegions);
          setRegionData(sortedRegions);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []); // Only fetch once on mount

  const getJobStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'in_progress':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'planning':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'completed':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
      case 'on-hold':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };


  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'low':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Client-side filtering - no loading states
  const filteredData = regionData
    .map(region => ({
      ...region,
      jobs: region.jobs.filter(job => {
        // Apply timeframe filter
        if (job.created_at) {
          const jobDate = new Date(job.created_at);
          const now = new Date();
          
          if (timeframe === 'custom') {
            if (customStartDate && customEndDate) {
              const start = new Date(customStartDate);
              const end = new Date(customEndDate);
              if (jobDate < start || jobDate > end) return false;
            }
          } else {
            let startDate: Date;
            let endDate: Date = now;
            
            switch (timeframe) {
              case 'quarterly':
                // Q1: Jan 1 – Mar 31, Q2: Apr 1 – Jun 30, Q3: Jul 1 – Sep 30, Q4: Oct 1 – Dec 31
                const currentYear = now.getFullYear();
                if (selectedQuarter === 1) {
                  startDate = new Date(currentYear, 0, 1);
                  endDate = new Date(currentYear, 2, 31);
                } else if (selectedQuarter === 2) {
                  startDate = new Date(currentYear, 3, 1);
                  endDate = new Date(currentYear, 5, 30);
                } else if (selectedQuarter === 3) {
                  startDate = new Date(currentYear, 6, 1);
                  endDate = new Date(currentYear, 8, 30);
                } else {
                  startDate = new Date(currentYear, 9, 1);
                  endDate = new Date(currentYear, 11, 31);
                }
                break;
              case '6months':
                startDate = new Date(now);
                startDate.setMonth(now.getMonth() - 6);
                break;
              case 'yearly':
                startDate = new Date(now.getFullYear(), 0, 1);
                break;
              default:
                startDate = new Date(now.getFullYear(), 0, 1);
            }
            
            if (jobDate < startDate || jobDate > endDate) return false;
          }
        }
        
        // Apply status filter
        if (statusFilter !== 'all') {
          const jobStatus = job.status?.toLowerCase();
          switch (statusFilter) {
            case 'active':
              if (!['in_progress', 'planning', 'pending'].includes(jobStatus)) return false;
              break;
            case 'billed':
              if (jobStatus !== 'billed' && jobStatus !== 'invoiced') return false;
              break;
            case 'to_be_billed':
              if (jobStatus !== 'completed' && jobStatus !== 'ready_to_bill') return false;
              break;
            case 'pending':
              if (jobStatus !== 'pending') return false;
              break;
            case 'completed':
              if (jobStatus !== 'completed') return false;
              break;
            case 'on_hold':
              if (jobStatus !== 'on_hold' && jobStatus !== 'on-hold') return false;
              break;
          }
        }
        
        // Apply search filter
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          const matchesTitle = job.title?.toLowerCase().includes(query);
          const matchesJobNumber = job.job_number?.toLowerCase().includes(query);
          const matchesCustomer = job.customers?.company_name?.toLowerCase().includes(query) || 
                                  job.customers?.name?.toLowerCase().includes(query);
          const matchesDescription = job.description?.toLowerCase().includes(query);
          
          if (!matchesTitle && !matchesJobNumber && !matchesCustomer && !matchesDescription) {
            return false;
          }
        }
        
        return true;
      })
    }))
    .filter(region => {
      // Filter by selected region and only show regions with jobs
      return (selectedRegion === 'all' || region.region === selectedRegion) && region.jobs.length > 0;
    });

  const getTotalStats = () => {
    return filteredData.reduce((acc, region) => ({
      totalQuotedValue: acc.totalQuotedValue + region.jobs.reduce((sum, job) => sum + (job.opportunities?.quoted_amount ?? 0), 0),
      totalBudget: acc.totalBudget + region.jobs.reduce((sum, job) => sum + (job.budget ?? 0), 0),
      activeJobs: acc.activeJobs + region.jobs.length
    }), { totalQuotedValue: 0, totalBudget: 0, activeJobs: 0 });
  };

  const totalStats = getTotalStats();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600 dark:text-gray-400">Loading project data...</span>
      </div>
    );
  }

  return (    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-50 to-blue-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-blue-950/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header with Controls */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Jobs Dashboard</h1>
              <div className="flex items-center gap-3 mt-2">
                <p className="text-gray-600 dark:text-gray-400">
                  {timeframe === 'quarterly' && (() => {
                    if (selectedQuarter === 1) return 'Q1: January 1 – March 31';
                    if (selectedQuarter === 2) return 'Q2: April 1 – June 30';
                    if (selectedQuarter === 3) return 'Q3: July 1 – September 30';
                    return 'Q4: October 1 – December 31';
                  })()}
                  {timeframe === '6months' && 'Last 6 Months'}
                  {timeframe === 'yearly' && 'Current Year'}
                  {timeframe === 'custom' && customStartDate && customEndDate && 
                    `${new Date(customStartDate).toLocaleDateString()} - ${new Date(customEndDate).toLocaleDateString()}`}
                </p>
                {timeframe === 'quarterly' && (
                  <div className="flex gap-1">
                    <Button
                      variant={selectedQuarter === 1 ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedQuarter(1)}
                      className={selectedQuarter === 1 ? 'bg-[#f26722] hover:bg-[#e55611] h-7 px-3' : 'h-7 px-3'}
                    >
                      Q1
                    </Button>
                    <Button
                      variant={selectedQuarter === 2 ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedQuarter(2)}
                      className={selectedQuarter === 2 ? 'bg-[#f26722] hover:bg-[#e55611] h-7 px-3' : 'h-7 px-3'}
                    >
                      Q2
                    </Button>
                    <Button
                      variant={selectedQuarter === 3 ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedQuarter(3)}
                      className={selectedQuarter === 3 ? 'bg-[#f26722] hover:bg-[#e55611] h-7 px-3' : 'h-7 px-3'}
                    >
                      Q3
                    </Button>
                    <Button
                      variant={selectedQuarter === 4 ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedQuarter(4)}
                      className={selectedQuarter === 4 ? 'bg-[#f26722] hover:bg-[#e55611] h-7 px-3' : 'h-7 px-3'}
                    >
                      Q4
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Filters */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-6">
              <div className="space-y-4">
                {/* Timeframe Filter */}
                <div className="flex flex-wrap gap-4 items-center">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-[#f26722]" />
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Timeframe:</label>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={timeframe === 'quarterly' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setTimeframe('quarterly');
                        setShowCustomDatePicker(false);
                        // Reset to current quarter when switching to quarterly
                        const month = new Date().getMonth();
                        if (month >= 0 && month <= 2) setSelectedQuarter(1);
                        else if (month >= 3 && month <= 5) setSelectedQuarter(2);
                        else if (month >= 6 && month <= 8) setSelectedQuarter(3);
                        else setSelectedQuarter(4);
                      }}
                      className={timeframe === 'quarterly' ? 'bg-[#f26722] hover:bg-[#e55611]' : ''}
                    >
                      Quarterly
                    </Button>
                    <Button
                      variant={timeframe === '6months' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setTimeframe('6months');
                        setShowCustomDatePicker(false);
                      }}
                      className={timeframe === '6months' ? 'bg-[#f26722] hover:bg-[#e55611]' : ''}
                    >
                      6 Months
                    </Button>
                    <Button
                      variant={timeframe === 'yearly' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setTimeframe('yearly');
                        setShowCustomDatePicker(false);
                      }}
                      className={timeframe === 'yearly' ? 'bg-[#f26722] hover:bg-[#e55611]' : ''}
                    >
                      Yearly
                    </Button>
                    <Button
                      variant={timeframe === 'custom' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setTimeframe('custom');
                        setShowCustomDatePicker(true);
                      }}
                      className={timeframe === 'custom' ? 'bg-[#f26722] hover:bg-[#e55611]' : ''}
                    >
                      Custom
                    </Button>
                  </div>
                  
                  {/* Custom Date Picker */}
                  {showCustomDatePicker && (
                    <div className="flex items-center gap-2 ml-4">
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                      />
                      <span className="text-gray-500 dark:text-gray-400">to</span>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                  )}
                </div>
                
                {/* Status, Division, and Search Filters */}
                <div className="flex flex-wrap gap-4 items-center border-t dark:border-gray-700 pt-4">
                  <div className="flex items-center gap-2">
                    <Filter className="h-5 w-5 text-[#f26722]" />
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Status:</label>
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilterType)}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-medium"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active (In Progress/Planning/Pending)</option>
                    <option value="to_be_billed">To Be Billed (Completed/Ready)</option>
                    <option value="billed">Billed/Invoiced</option>
                    <option value="pending">Pending Only</option>
                    <option value="completed">Completed Only</option>
                    <option value="on_hold">On Hold</option>
                  </select>

                  <div className="flex items-center gap-2 ml-4">
                    <MapPin className="h-5 w-5 text-[#f26722]" />
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Division:</label>
                    <select
                      value={selectedRegion}
                      onChange={(e) => setSelectedRegion(e.target.value)}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-medium"
                    >
                      <option value="all">All Divisions</option>
                      {regionData.map(region => (
                        <option key={region.region} value={region.region}>{region.region}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 ml-auto">
                    <Search className="h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search jobs..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm w-64"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Total Quoted Value</p>
                  <h3 className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{formatCurrency(totalStats.totalQuotedValue)}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">From opportunities</p>
                </div>
                <div className="bg-green-500/10 p-3 rounded-lg">
                  <DollarSign className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Total T&M Expected Value</p>
                  <h3 className="text-3xl font-bold text-gray-900 dark:text-white mt-2">In Development</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">T&M tracking</p>
                </div>
                <div className="bg-purple-500/10 p-3 rounded-lg">
                  <TrendingUp className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Total Jobs</p>
                  <h3 className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{totalStats.activeJobs}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {statusFilter === 'all' ? 'All statuses' : statusFilter === 'active' ? 'Active jobs' : 
                     statusFilter === 'billed' ? 'Billed jobs' : statusFilter === 'to_be_billed' ? 'Ready to bill' :
                     statusFilter.replace('_', ' ')}
                  </p>
                </div>
                <div className="bg-blue-500/10 p-3 rounded-lg">
                  <Building2 className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Revenue Trend Chart */}
          <Card className="lg:col-span-2 border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Revenue Trend</CardTitle>
              <p className="text-sm text-gray-600 dark:text-gray-400">Quoted value over time</p>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  revenue: {
                    label: "Revenue",
                    color: "hsl(217, 91%, 60%)",
                  },
                }}
                className="h-64"
              >
                <LineChart
                  data={(() => {
                    // Group jobs by month and calculate cumulative quoted value
                    const monthlyData = new Map();
                    filteredData.forEach(region => {
                      region.jobs.forEach(job => {
                        if (job.start_date) {
                          const date = new Date(job.start_date);
                          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                          const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                          
                          if (!monthlyData.has(monthKey)) {
                            monthlyData.set(monthKey, { month: monthLabel, revenue: 0, date: date });
                          }
                          const existing = monthlyData.get(monthKey);
                          existing.revenue += job.opportunities?.quoted_amount ?? 0;
                        }
                      });
                    });
                    
                    // Sort by date and return last 12 months
                    return Array.from(monthlyData.values())
                      .sort((a, b) => a.date - b.date)
                      .slice(-12)
                      .map(({ month, revenue }) => ({ month, revenue }));
                  })()}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis 
                    dataKey="month" 
                    className="text-xs"
                    tick={{ fill: 'currentColor' }}
                  />
                  <YAxis 
                    className="text-xs"
                    tick={{ fill: 'currentColor' }}
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
                  />
                  <ChartTooltip 
                    content={<ChartTooltipContent />}
                    formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                  />
                  <Line 
                    type="monotone"
                    dataKey="revenue" 
                    stroke="hsl(217, 91%, 60%)"
                    strokeWidth={2}
                    dot={{ fill: 'hsl(217, 91%, 60%)', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Project Status Pie Chart */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Project Status</CardTitle>
              <p className="text-sm text-gray-600 dark:text-gray-400">Distribution breakdown</p>
            </CardHeader>
            <CardContent className="flex justify-center">
              <ChartContainer
                config={{
                  jobs: {
                    label: "Jobs",
                  },
                  ...Object.fromEntries(
                    regionData.slice(0, 3).map((region, idx) => [
                      region.region,
                      {
                        label: region.region,
                        color: ['hsl(217, 91%, 60%)', 'hsl(271, 81%, 56%)', 'hsl(142, 76%, 36%)'][idx],
                      },
                    ])
                  ),
                }}
                className="h-64"
              >
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie
                    data={regionData.slice(0, 3).map(region => ({
                      name: region.region,
                      value: region.jobs.length,
                      fill: region.region,
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {regionData.slice(0, 3).map((region, index) => (
                      <Cell 
                        key={`cell-${index}`}
                        fill={['hsl(217, 91%, 60%)', 'hsl(271, 81%, 56%)', 'hsl(142, 76%, 36%)'][index]}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Top Revenue Projects */}
        <Card className="border-0 shadow-sm mb-8">
          <CardHeader>
            <CardTitle>Top Revenue Projects</CardTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400">Your highest-value jobs</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredData
                .flatMap(region => region.jobs)
                .sort((a, b) => {
                  const aValue = a.opportunities?.quoted_amount ?? 0;
                  const bValue = b.opportunities?.quoted_amount ?? 0;
                  return bValue - aValue;
                })
                .slice(0, 4)
                .map((job, idx) => {
                  const quotedAmount = job.opportunities?.quoted_amount ?? 0;
                  
                  return (
                    <div
                      key={job.id}
                      className="group p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-[#f26722]/50 transition-all cursor-pointer bg-gray-50/30 dark:bg-gray-800/30 hover:bg-gray-50/60 dark:hover:bg-gray-800/60"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 dark:text-white">{job.title}</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            Revenue: {formatCurrency(quotedAmount)}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getJobStatusColor(job.status)}`}>
                            {job.status.replace('_', ' ')}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gray-400" />
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Division:</label>
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                >
                  <option value="all">All Divisions</option>
                  {regionData.map(region => (
                    <option key={region.region} value={region.region}>{region.region}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <Search className="h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search jobs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm w-64"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Regional Data */}
        <div className="space-y-6">
          {filteredData.map((region) => (
            <Card key={region.region} className="border-0 shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-500/10 p-2 rounded-lg">
                      <MapPin className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <CardTitle className="text-xl text-gray-900 dark:text-white">{region.region}</CardTitle>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <span>Quoted: <strong className="text-gray-900 dark:text-white">{formatCurrency(region.totalQuotedValue)}</strong></span>
                    <span>T&M Expected: <strong className="text-gray-900 dark:text-white">In Development</strong></span>
                    <span><strong className="text-gray-900 dark:text-white">{region.jobs.length}</strong> Jobs</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {region.jobs.map((job) => (
                    <div
                      key={job.id}
                      className="group p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-[#f26722]/50 dark:hover:border-[#f26722]/50 transition-all cursor-pointer bg-gray-50/30 dark:bg-gray-800/30 hover:bg-gray-50/60 dark:hover:bg-gray-800/60 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 dark:text-white text-lg mb-1">{job.title}</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                            {job.customers?.company_name || job.customers?.name || (job.customer_id ? 'Customer Not Found' : 'No Customer')}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getJobStatusColor(job.status)}`}>
                              {job.status.replace('_', ' ')}
                            </div>
                            <div className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(job.priority)}`}>
                              {job.priority}
                            </div>
                            {job.job_number && (
                              <div className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                                #{job.job_number}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          {(() => {
                            const quotedAmount = job.opportunities?.quoted_amount ?? 0;
                            const usedSource = job.opportunities?.quoted_amount ? 'quoted_amount' : 'fallback_0';
                            return (
                              <>
                                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                                  {formatCurrency(quotedAmount)}
                                </p>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                  {usedSource === 'quoted_amount' ? 'Quoted Value' : 'No Quote'}
                                </p>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-4">
                          {job.start_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(job.start_date).toLocaleDateString()}
                            </span>
                          )}
                          {job.due_date && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Due: {new Date(job.due_date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {job.opportunity_id && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={async () => {
                                setShowOppModal({ open: true, id: String(job.opportunity_id) });
                                setModalLoading(true);
                                setModalError(null);
                                setOpportunityDetails(null);
                                try {
                                  const { data, error } = await supabase
                                    .schema('business')
                                    .from('opportunities')
                                    .select('*')
                                    .eq('id', job.opportunity_id)
                                    .single();
                                  if (error) throw error;
                                  setOpportunityDetails(data);
                                } catch (e: any) {
                                  setModalError(e?.message || 'Failed to load opportunity');
                                } finally {
                                  setModalLoading(false);
                                }
                              }}
                              className="hover:bg-[#f26722] hover:text-white hover:border-[#f26722] transition-colors"
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Opportunity
                            </Button>
                          )}
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={async () => {
                              setShowJobModal({ open: true, id: String(job.id) });
                              setModalLoading(true);
                              setModalError(null);
                              setJobDetails(null);
                              try {
                                const { data, error } = await supabase
                                  .schema('neta_ops')
                                  .from('jobs')
                                  .select('*')
                                  .eq('id', job.id)
                                  .single();
                                if (error) throw error;
                                setJobDetails(data);
                              } catch (e: any) {
                                setModalError(e?.message || 'Failed to load job');
                              } finally {
                                setModalLoading(false);
                              }
                            }}
                            className="hover:bg-[#f26722] hover:text-white hover:border-[#f26722] transition-colors"
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            View Job
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Opportunity Modal - embed full OpportunityDetail route */}
        {showOppModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-5xl p-0 overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <h3 className="sr-only">Opportunity</h3>
                <button 
                  className="m-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" 
                  onClick={() => setShowOppModal({ open: false, id: null })}
                >
                  Close
                </button>
              </div>
              <div className="h-[80vh]">
                <iframe
                  title="Opportunity"
                  src={`${window.location.origin}/sales-dashboard/opportunities/${showOppModal.id}?embed=true`}
                  className="w-full h-full border-0"
                />
              </div>
            </div>
          </div>
        )}

        {/* Job Modal - embed full JobDetail route */}
        {showJobModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-6xl p-0 overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <h3 className="sr-only">Job</h3>
                <button 
                  className="m-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" 
                  onClick={() => setShowJobModal({ open: false, id: null })}
                >
                  Close
                </button>
              </div>
              <div className="h-[85vh]">
                <iframe
                  title="Job"
                  src={`${window.location.origin}/jobs/${showJobModal.id}?tab=assets&embed=true`}
                  className="w-full h-full border-0"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InProgressDashboard;

