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

const InProgressDashboard: React.FC = () => {
  const [regionData, setRegionData] = useState<RegionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch real data from database
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch jobs from neta_ops.jobs - try with opportunity join first
        let jobs, jobsError;
        
        try {
          // First, get jobs from neta_ops schema
          const jobsResult = await supabase
            .schema('neta_ops')
            .from('jobs')
            .select('*')
            .is('deleted_at', null)
            .in('status', ['in_progress', 'pending', 'planning']);
          
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
                  .select('opportunity_id, data')
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
                  letterProposals.forEach(proposal => {
                    console.log('Raw proposal data:', {
                      opportunity_id: proposal.opportunity_id,
                      data: proposal.data,
                      dataKeys: proposal.data ? Object.keys(proposal.data) : 'no data'
                    });
                    
                    // Log the complete data structure for one proposal
                    if (proposal.data) {
                      console.log('Complete proposal data structure:', JSON.stringify(proposal.data, null, 2));
                    }
                    
                    if (proposal.data) {
                      // Try different possible data structures
                      let quotedAmount = null;
                      
                      // Check for calculatedValues structure
                      if (proposal.data.calculatedValues) {
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
            
            // Add quoted amount from opportunity if available
            const quotedAmount = job.opportunities?.quoted_amount || job.opportunities?.expected_value || 0;
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
  }, []);

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

  const filteredData = regionData.filter(region => 
    selectedRegion === 'all' || region.region === selectedRegion
  );

  const getTotalStats = () => {
    return regionData.reduce((acc, region) => ({
      totalQuotedValue: acc.totalQuotedValue + region.totalQuotedValue,
      totalBudget: acc.totalBudget + region.totalBudget,
      activeJobs: acc.activeJobs + region.activeJobs
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

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Jobs Dashboard</h2>
          <p className="text-gray-600 dark:text-gray-400">Monitor ongoing jobs across all divisions</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Job
          </Button>
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Quoted Value</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalStats.totalQuotedValue)}</p>
                <p className="text-sm text-green-600 dark:text-green-400">From opportunities</p>
              </div>
              <DollarSign className="h-12 w-12 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Budget</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalStats.totalBudget)}</p>
                <p className="text-sm text-purple-600 dark:text-purple-400">Internal budget</p>
              </div>
              <TrendingUp className="h-12 w-12 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Active Jobs</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">{totalStats.activeJobs}</p>
                <p className="text-sm text-blue-600 dark:text-blue-400">Across {regionData.length} divisions</p>
              </div>
              <Building2 className="h-12 w-12 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-400" />
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Division:</label>
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
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
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm w-64"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Regional Data */}
      <div className="space-y-6">
        {filteredData.map((region) => (
          <Card key={region.region}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-blue-500" />
                  <CardTitle className="text-xl">{region.region}</CardTitle>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                  <span>Quoted Value: <strong className="text-gray-900 dark:text-white">{formatCurrency(region.totalQuotedValue)}</strong></span>
                  <span>Budget: <strong className="text-gray-900 dark:text-white">{formatCurrency(region.totalBudget)}</strong></span>
                  <span>Active Jobs: <strong className="text-gray-900 dark:text-white">{region.activeJobs}</strong></span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Jobs Section */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-blue-500" />
                    Active Jobs ({region.jobs.length})
                  </h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {region.jobs.map((job) => (
                        <div key={job.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <h4 className="font-semibold text-gray-900 dark:text-white mb-1">{job.title}</h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                {job.customers?.company_name || job.customers?.name || `Customer ID: ${job.customer_id || 'N/A'}`}
                              </p>
                              <div className="flex items-center gap-2 mb-2">
                                <Badge className={`text-xs ${getJobStatusColor(job.status)}`}>
                                  {job.status.replace('_', ' ')}
                                </Badge>
                                <Badge className={`text-xs ${getPriorityColor(job.priority)}`}>
                                  {job.priority}
                                </Badge>
                                {job.job_number && (
                                  <Badge className="text-xs bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400">
                                    #{job.job_number}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              {(() => {
                                const quotedAmount = job.opportunities?.quoted_amount || job.opportunities?.expected_value || 0;
                                const usedSource = job.opportunities?.quoted_amount ? 'quoted_amount' : 
                                                 job.opportunities?.expected_value ? 'expected_value' : 'fallback_0';
                                console.log(`Displaying job ${job.id} quoted amount:`, {
                                  jobTitle: job.title,
                                  opportunityId: job.opportunity_id,
                                  quoted_amount: job.opportunities?.quoted_amount,
                                  expected_value: job.opportunities?.expected_value,
                                  jobBudget: job.budget,
                                  finalAmount: quotedAmount,
                                  usedSource: usedSource,
                                  opportunityData: job.opportunities
                                });
                                return (
                                  <>
                                    <p className="text-lg font-bold text-green-600 dark:text-green-400">
                                      {formatCurrency(quotedAmount)}
                                    </p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                      {usedSource === 'quoted_amount' ? 'Quoted Value' : 
                                       usedSource === 'expected_value' ? 'Expected Value' : 'No Quote'}
                                    </p>
                                    <p className="text-sm font-medium text-purple-600 dark:text-purple-400">
                                      Budget: {formatCurrency(job.budget || 0)}
                                    </p>
                                  </>
                                );
                              })()}
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                            <div className="flex items-center gap-4">
                              {job.start_date && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Start: {new Date(job.start_date).toLocaleDateString()}
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
                              <Button variant="outline" size="sm">
                                <Eye className="h-3 w-3" />
                              </Button>
                              <Button variant="outline" size="sm">
                                <Edit className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default InProgressDashboard;
