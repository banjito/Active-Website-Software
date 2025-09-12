import React, { useState } from 'react';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  AlertCircle,
  Search,
  Filter,
  Download,
  Settings
} from 'lucide-react';

const DataPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'weekly' | 'monthly' | 'quarterly' | 'annual'>('weekly');
  const [teamFilter, setTeamFilter] = useState('amp-leadership');
  const [dateRangeFilter, setDateRangeFilter] = useState('last-13-weeks');
  const [timePeriodFilter, setTimePeriodFilter] = useState('1-week');

  const tabs = [
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'quarterly', label: 'Quarterly' },
    { id: 'annual', label: 'Annual' },
  ];

  const metricsData = [
    {
      id: 1,
      trend: 'up',
      title: '$2,000,000 in Projects Quoted',
      goal: '>= $2,000,000',
      average: '$3,288,025.00',
      total: '$36,168,275',
      week1: '$7,000,000',
      week2: '$2,500,000',
      week3: '$1,800,000',
      owner: 'BR',
      status1: 'positive',
      status2: 'positive'
    },
    {
      id: 2,
      trend: 'up',
      title: 'Post impressions LinkedIn',
      goal: '>= 2,000',
      average: '4,314',
      total: '51,768',
      week1: '4,279',
      week2: '3,850',
      week3: '4,100',
      owner: 'GS',
      status1: 'positive',
      status2: 'positive'
    },
    {
      id: 3,
      trend: 'down',
      title: 'Operating Account Balance',
      goal: '>= $350,000',
      average: '$209,477.75',
      total: '$2,513,733',
      week1: '$97,894',
      week2: '$125,000',
      week3: '$180,000',
      owner: 'JH',
      status1: 'negative',
      status2: 'negative'
    },
    {
      id: 4,
      trend: 'up',
      title: 'Global Net Profit last week',
      goal: '>= $31,000',
      average: '$3,411.08',
      total: '$40,933',
      week1: '$57,121',
      week2: '$-195,764',
      week3: '$45,000',
      owner: 'BR',
      status1: 'positive',
      status2: 'negative'
    },
    {
      id: 5,
      trend: 'warning',
      title: 'AMP QES Profit % YTD',
      goal: '>= 20%',
      average: '11.16%',
      total: '-',
      week1: '8.19%',
      week2: '12.5%',
      week3: '15.2%',
      owner: 'GS',
      status1: 'negative',
      status2: 'negative'
    },
    {
      id: 6,
      trend: 'up',
      title: '30 Customer Interactions - Visits/Calls',
      goal: '>= 30',
      average: '39.42',
      total: '473',
      week1: '56',
      week2: '42',
      week3: '38',
      owner: 'JH',
      status1: 'positive',
      status2: 'positive'
    },
    {
      id: 7,
      trend: 'up',
      title: 'Double Annual Website Traffic',
      goal: '>= 81',
      average: '142.5',
      total: '1,710',
      week1: '195',
      week2: '89',
      week3: '120',
      owner: 'BR',
      status1: 'positive',
      status2: 'positive'
    },
    {
      id: 8,
      trend: 'warning',
      title: 'Calibration AR Billed',
      goal: '>= 19,500',
      average: '27,967.31',
      total: '335,607.75',
      week1: '35,752',
      week2: '19,863',
      week3: '28,500',
      owner: 'NL',
      status1: 'positive',
      status2: 'positive'
    },
    {
      id: 9,
      trend: 'warning',
      title: 'Calibration AR',
      goal: '>= 19,500',
      average: '27,967.31',
      total: '-',
      week1: '122,861',
      week2: '103,667',
      week3: '115,000',
      owner: 'NL',
      status1: 'positive',
      status2: 'positive'
    },
    {
      id: 10,
      trend: 'warning',
      title: 'Calibration Cash Balance',
      goal: '>= 19,500',
      average: '27,967.31',
      total: '-',
      week1: '67,000',
      week2: '64,462',
      week3: '70,000',
      owner: 'NL',
      status1: 'positive',
      status2: 'positive'
    },
    {
      id: 11,
      trend: 'critical',
      title: 'Calibration Profit % YTD',
      goal: '>= 14%',
      average: '-3.31%',
      total: '-',
      week1: '1.70%',
      week2: '-0.38%',
      week3: '2.1%',
      owner: 'NL',
      status1: 'negative',
      status2: 'negative'
    },
    {
      id: 12,
      trend: 'up',
      title: 'Field Services Work In Progress',
      goal: '>= 19,500',
      average: '$159,120.66',
      total: '$1,909,447.94',
      week1: '$427,221',
      week2: '$188,851',
      week3: '$350,000',
      owner: 'WS',
      status1: 'positive',
      status2: 'positive'
    },
    {
      id: 13,
      trend: 'warning',
      title: 'Field Services Expenses',
      goal: '<= 16,500',
      average: '$159,120.66',
      total: '$1,909,447.94',
      week1: '$383,314.32',
      week2: '$177,851.73',
      week3: '$320,000',
      owner: 'WS',
      status1: 'positive',
      status2: 'positive'
    },
    {
      id: 14,
      trend: 'warning',
      title: 'Closed Field Services Work',
      goal: '>= 19,500',
      average: '$159,120.66',
      total: '$1,909,447.94',
      week1: '$62,674.51',
      week2: '$86,337.90',
      week3: '$75,000',
      owner: 'WS',
      status1: 'positive',
      status2: 'positive'
    },
    {
      id: 15,
      trend: 'warning',
      title: 'Field Services AR Billed',
      goal: '>= 19,500',
      average: '$159,120.66',
      total: '$1,909,447.94',
      week1: '1,357,778.98',
      week2: '1,784,999.98',
      week3: '1,500,000',
      owner: 'WS',
      status1: 'positive',
      status2: 'positive'
    },
    {
      id: 16,
      trend: 'warning',
      title: 'Field Services AR Received',
      goal: '>= 19,500',
      average: '$159,120.66',
      total: '$1,909,447.94',
      week1: '7,464.24',
      week2: '45,806',
      week3: '25,000',
      owner: 'WS',
      status1: 'negative',
      status2: 'positive'
    },
    {
      id: 17,
      trend: 'warning',
      title: 'Safety Incidents',
      goal: '= 0',
      average: '0.08',
      total: '1',
      week1: '0',
      week2: '1',
      week3: '0',
      owner: 'WS',
      status1: 'positive',
      status2: 'negative'
    },
    {
      id: 18,
      trend: 'critical',
      title: 'Field services weekly committed work',
      goal: '>= 19,500',
      average: '$159,120.66',
      total: '$1,909,447.94',
      week1: '2,448',
      week2: '24,003',
      week3: '18,000',
      owner: 'WS',
      status1: 'negative',
      status2: 'positive'
    },
    {
      id: 19,
      trend: 'critical',
      title: 'Applicants',
      goal: '>= 19,500',
      average: '$159,120.66',
      total: '$1,909,447.94',
      week1: '0',
      week2: '0',
      week3: '2',
      owner: 'JH',
      status1: 'negative',
      status2: 'negative'
    },
    {
      id: 20,
      trend: 'critical',
      title: 'Contacts with potential new employees',
      goal: '>= 19,500',
      average: '$159,120.66',
      total: '$1,909,447.94',
      week1: '0',
      week2: '0',
      week3: '1',
      owner: 'JH',
      status1: 'negative',
      status2: 'negative'
    },
    {
      id: 21,
      trend: 'critical',
      title: 'In-Process',
      goal: '>= 19,500',
      average: '$159,120.66',
      total: '$1,909,447.94',
      week1: '0',
      week2: '0',
      week3: '0',
      owner: 'JH',
      status1: 'negative',
      status2: 'negative'
    },
    {
      id: 22,
      trend: 'critical',
      title: 'Interviews',
      goal: '>= 19,500',
      average: '$159,120.66',
      total: '$1,909,447.94',
      week1: '0',
      week2: '0',
      week3: '0',
      owner: 'JH',
      status1: 'negative',
      status2: 'negative'
    },
    {
      id: 23,
      trend: 'critical',
      title: 'Offers for employment',
      goal: '>= 19,500',
      average: '$159,120.66',
      total: '$1,909,447.94',
      week1: '0',
      week2: '0',
      week3: '0',
      owner: 'JH',
      status1: 'negative',
      status2: 'negative'
    }
  ];

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'critical':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'positive':
        return 'bg-green-100 text-green-800';
      case 'negative':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Data
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Record and evaluate key metrics, streamlined for strategic success.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#f26722] text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Team:</span>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="amp-leadership">AMP Leadership</option>
              <option value="tech">Tech</option>
              <option value="sales">Sales</option>
              <option value="all">All</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Date Range:</span>
            <select
              value={dateRangeFilter}
              onChange={(e) => setDateRangeFilter(e.target.value)}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="last-13-weeks">Last 13 Weeks</option>
              <option value="last-quarter">Last Quarter</option>
              <option value="last-year">Last Year</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Time Period:</span>
            <select
              value={timePeriodFilter}
              onChange={(e) => setTimePeriodFilter(e.target.value)}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="1-week">1-week</option>
              <option value="2-week">2-week</option>
              <option value="1-month">1-month</option>
            </select>
          </div>

          {/* Action Icons */}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4" />
            </Button>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search KPIs..."
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm w-48"
            />
          </div>
        </div>

        {/* Data Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Group 1 39</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4">
                      <input type="checkbox" className="rounded" />
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">View</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Trend</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Title</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Goal</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Average</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Total</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">2025 - Sep 08 - Sep 14</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">2025 - Sep 01 - Sep 07</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">2025 - Aug 25 - Aug 31</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400"></th>
                  </tr>
                </thead>
                <tbody>
                  {metricsData.map((metric) => (
                    <tr key={metric.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="py-3 px-4">
                        <input type="checkbox" className="rounded" />
                      </td>
                      <td className="py-3 px-4"></td>
                      <td className="py-3 px-4">
                        {getTrendIcon(metric.trend)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-900 dark:text-white">{metric.title}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-900 dark:text-white">{metric.goal}</span>
                          <Badge variant="secondary" className="text-xs">
                            {metric.owner}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-900 dark:text-white">{metric.average}</td>
                      <td className="py-3 px-4 text-gray-900 dark:text-white">{metric.total}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-sm ${getStatusColor(metric.status1)}`}>
                          {metric.week1}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-sm ${getStatusColor(metric.status2)}`}>
                          {metric.week2}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-sm ${getStatusColor(metric.status1)}`}>
                          {metric.week3}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-400">
                          {metric.owner}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DataPage;
