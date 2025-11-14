import React, { useState } from 'react';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { 
  TrendingUp, 
  Calendar, 
  CheckSquare, 
  AlertTriangle,
  ChevronDown,
  Info
} from 'lucide-react';

const InsightsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'rocks' | 'meetings' | 'todos' | 'issues'>('rocks');
  const [teamFilter, setTeamFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [timePeriodFilter, setTimePeriodFilter] = useState('current-quarter');

  const tabs = [
    { id: 'rocks', label: 'Rocks', icon: TrendingUp },
    { id: 'meetings', label: 'Meetings', icon: Calendar },
    { id: 'todos', label: 'To-Dos', icon: CheckSquare },
    { id: 'issues', label: 'Issues', icon: AlertTriangle },
  ];

  const renderRockProgressWidget = () => (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Rock progress</CardTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Rock progress and delays, based on due dates.
          </p>
        </div>
        <Button variant="outline" size="sm">
          Expand details
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center mb-6">
          {/* Donut Chart */}
          <div className="relative w-32 h-32">
            <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 36 36">
              {/* Background circle */}
              <path
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="2"
              />
              {/* Completed - 25% */}
              <path
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#10b981"
                strokeWidth="3"
                strokeDasharray="25, 100"
                strokeDashoffset="0"
              />
              {/* Remaining - 75% */}
              <path
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#3b82f6"
                strokeWidth="3"
                strokeDasharray="75, 100"
                strokeDashoffset="-25"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">25%</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">12 Rocks total</div>
            </div>
          </div>
        </div>
        
        {/* Legend */}
        <div className="flex flex-wrap gap-4 justify-center">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span className="text-sm text-gray-600 dark:text-gray-400">Off-track</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <span className="text-sm text-gray-600 dark:text-gray-400">On-track</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="text-sm text-gray-600 dark:text-gray-400">Complete</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
            <span className="text-sm text-gray-600 dark:text-gray-400">Canceled</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderMilestonesProgressWidget = () => (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Milestones: Progress to completion</CardTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Number of remaining Milestones at the end of each time period. The goal is to reach 0 Milestones at the end of the date range.
          </p>
        </div>
        <Button variant="outline" size="sm">
          Expand details
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">0</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Milestones</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">0</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">0</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Remaining as of today</div>
            </div>
          </div>
          
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">No data to display</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderMilestonesRevisedWidget = () => (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Milestones: Revised due dates</CardTitle>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Milestones with revised due dates.
            </p>
            <Info className="h-4 w-4 text-gray-400" />
          </div>
        </div>
        <Button variant="outline" size="sm">
          Expand details
        </Button>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8">
          <p className="text-gray-500 dark:text-gray-400">No data to display</p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Insights
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Explore, analyze, and act on insights to drive data-driven decisions across your organization.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 mb-6">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-[#f26722] text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Team:</span>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="all">All</option>
              <option value="leadership">Leadership</option>
              <option value="tech">Tech</option>
              <option value="sales">Sales</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="all">All</option>
              <option value="quarterly">Quarterly</option>
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Time Period:</span>
            <select
              value={timePeriodFilter}
              onChange={(e) => setTimePeriodFilter(e.target.value)}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="current-quarter">Current Quarter</option>
              <option value="last-quarter">Last Quarter</option>
              <option value="current-year">Current Year</option>
              <option value="last-year">Last Year</option>
            </select>
          </div>
        </div>

        {/* Content based on active tab */}
        {activeTab === 'rocks' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Rock Progress Widget */}
            <div className="lg:col-span-1">
              {renderRockProgressWidget()}
            </div>
            
            {/* Milestones Progress Widget */}
            <div className="lg:col-span-1">
              {renderMilestonesProgressWidget()}
            </div>
            
            {/* Milestones Revised Widget */}
            <div className="lg:col-span-1">
              {renderMilestonesRevisedWidget()}
            </div>
          </div>
        )}

        {activeTab === 'meetings' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Weekly Meetings: Ratings */}
            <Card className="h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Weekly Meetings: Ratings</CardTitle>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Weekly Meeting performance scores based on attendee responses.
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  Expand details
                </Button>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center">
                  {/* Line Chart */}
                  <svg className="w-full h-full" viewBox="0 0 400 200">
                    {/* Y-axis */}
                    <line x1="40" y1="20" x2="40" y2="180" stroke="#e5e7eb" strokeWidth="1"/>
                    {/* X-axis */}
                    <line x1="40" y1="180" x2="380" y2="180" stroke="#e5e7eb" strokeWidth="1"/>
                    
                    {/* Y-axis labels */}
                    <text x="35" y="25" textAnchor="end" className="text-xs fill-gray-500">8.6</text>
                    <text x="35" y="45" textAnchor="end" className="text-xs fill-gray-500">8.4</text>
                    <text x="35" y="65" textAnchor="end" className="text-xs fill-gray-500">8.2</text>
                    <text x="35" y="85" textAnchor="end" className="text-xs fill-gray-500">8.0</text>
                    <text x="35" y="105" textAnchor="end" className="text-xs fill-gray-500">7.8</text>
                    
                    {/* Data points */}
                    <circle cx="60" cy="85" r="3" fill="#3b82f6"/>
                    <circle cx="100" cy="90" r="3" fill="#3b82f6"/>
                    <circle cx="140" cy="95" r="3" fill="#3b82f6"/>
                    <circle cx="180" cy="100" r="3" fill="#3b82f6"/>
                    <circle cx="220" cy="85" r="3" fill="#3b82f6"/>
                    <circle cx="260" cy="120" r="3" fill="#3b82f6"/>
                    <circle cx="300" cy="95" r="3" fill="#3b82f6"/>
                    <circle cx="340" cy="95" r="3" fill="#3b82f6"/>
                    <circle cx="360" cy="80" r="3" fill="#3b82f6"/>
                    <circle cx="380" cy="90" r="3" fill="#3b82f6"/>
                    
                    {/* Line */}
                    <polyline
                      points="60,85 100,90 140,95 180,100 220,85 260,120 300,95 340,95 360,80 380,90"
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="2"
                    />
                    
                    {/* Legend */}
                    <circle cx="50" cy="160" r="4" fill="#3b82f6"/>
                    <text x="60" y="165" className="text-xs fill-gray-600">Average rating</text>
                  </svg>
                </div>
              </CardContent>
            </Card>

            {/* Short-Term Issues: Solve rate */}
            <Card className="h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Short-Term Issues: Solve rate</CardTitle>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Issues resolved during Weekly Meetings across time.
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  Expand details
                </Button>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center">
                  {/* Bar Chart */}
                  <svg className="w-full h-full" viewBox="0 0 400 200">
                    {/* Y-axis */}
                    <line x1="40" y1="20" x2="40" y2="180" stroke="#e5e7eb" strokeWidth="1"/>
                    {/* X-axis */}
                    <line x1="40" y1="180" x2="380" y2="180" stroke="#e5e7eb" strokeWidth="1"/>
                    
                    {/* Y-axis labels */}
                    <text x="35" y="25" textAnchor="end" className="text-xs fill-gray-500">15</text>
                    <text x="35" y="45" textAnchor="end" className="text-xs fill-gray-500">10</text>
                    <text x="35" y="65" textAnchor="end" className="text-xs fill-gray-500">5</text>
                    <text x="35" y="105" textAnchor="end" className="text-xs fill-gray-500">0</text>
                    
                    {/* Bars */}
                    <rect x="55" y="180" width="20" height="0" fill="#10b981"/>
                    <rect x="85" y="160" width="20" height="20" fill="#10b981"/>
                    <rect x="115" y="150" width="20" height="30" fill="#10b981"/>
                    <rect x="145" y="130" width="20" height="50" fill="#10b981"/>
                    <rect x="175" y="140" width="20" height="40" fill="#10b981"/>
                    <rect x="205" y="130" width="20" height="50" fill="#10b981"/>
                    <rect x="235" y="130" width="20" height="50" fill="#10b981"/>
                    <rect x="265" y="130" width="20" height="50" fill="#10b981"/>
                    <rect x="295" y="130" width="20" height="50" fill="#10b981"/>
                    <rect x="325" y="130" width="20" height="50" fill="#10b981"/>
                    
                    {/* Average line */}
                    <line x1="40" y1="120" x2="380" y2="120" stroke="#ef4444" strokeWidth="1" strokeDasharray="5,5"/>
                    
                    {/* Legend */}
                    <circle cx="50" cy="160" r="4" fill="#10b981"/>
                    <text x="60" y="165" className="text-xs fill-gray-600">Resolved</text>
                    <line x1="120" y1="160" x2="130" y2="160" stroke="#ef4444" strokeWidth="1" strokeDasharray="3,3"/>
                    <text x="135" y="165" className="text-xs fill-gray-600">Average (7 resolved Issues)</text>
                  </svg>
                </div>
              </CardContent>
            </Card>

            {/* Team To-Dos: Created */}
            <Card className="h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Team To-Dos: Created</CardTitle>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Team To-Dos created during Weekly Meetings.
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  Expand details
                </Button>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center">
                  {/* Bar Chart */}
                  <svg className="w-full h-full" viewBox="0 0 400 200">
                    {/* Y-axis */}
                    <line x1="40" y1="20" x2="40" y2="180" stroke="#e5e7eb" strokeWidth="1"/>
                    {/* X-axis */}
                    <line x1="40" y1="180" x2="380" y2="180" stroke="#e5e7eb" strokeWidth="1"/>
                    
                    {/* Y-axis labels */}
                    <text x="35" y="25" textAnchor="end" className="text-xs fill-gray-500">3</text>
                    <text x="35" y="65" textAnchor="end" className="text-xs fill-gray-500">2</text>
                    <text x="35" y="105" textAnchor="end" className="text-xs fill-gray-500">1</text>
                    <text x="35" y="185" textAnchor="end" className="text-xs fill-gray-500">0</text>
                    
                    {/* Bars */}
                    <rect x="55" y="180" width="20" height="0" fill="#3b82f6"/>
                    <rect x="85" y="180" width="20" height="0" fill="#3b82f6"/>
                    <rect x="115" y="180" width="20" height="0" fill="#3b82f6"/>
                    <rect x="145" y="140" width="20" height="40" fill="#3b82f6"/>
                    <rect x="175" y="160" width="20" height="20" fill="#3b82f6"/>
                    <rect x="205" y="100" width="20" height="80" fill="#3b82f6"/>
                    <rect x="235" y="140" width="20" height="40" fill="#3b82f6"/>
                    <rect x="265" y="160" width="20" height="20" fill="#3b82f6"/>
                    <rect x="295" y="180" width="20" height="0" fill="#3b82f6"/>
                    <rect x="325" y="100" width="20" height="80" fill="#3b82f6"/>
                    
                    {/* Legend */}
                    <circle cx="50" cy="160" r="4" fill="#3b82f6"/>
                    <text x="60" y="165" className="text-xs fill-gray-600">Number of To-Dos</text>
                  </svg>
                </div>
              </CardContent>
            </Card>

            {/* Weekly Meetings: Average time in Issues */}
            <Card className="h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Weekly Meetings: Average time in Issues</CardTitle>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Time spent discussing Issues.
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  Expand details
                </Button>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center">
                  {/* Line Chart */}
                  <svg className="w-full h-full" viewBox="0 0 400 200">
                    {/* Y-axis */}
                    <line x1="40" y1="20" x2="40" y2="180" stroke="#e5e7eb" strokeWidth="1"/>
                    {/* X-axis */}
                    <line x1="40" y1="180" x2="380" y2="180" stroke="#e5e7eb" strokeWidth="1"/>
                    
                    {/* Y-axis labels */}
                    <text x="35" y="25" textAnchor="end" className="text-xs fill-gray-500">1 hr 40 min</text>
                    <text x="35" y="65" textAnchor="end" className="text-xs fill-gray-500">1 hr 6 min</text>
                    <text x="35" y="105" textAnchor="end" className="text-xs fill-gray-500">33 min</text>
                    <text x="35" y="185" textAnchor="end" className="text-xs fill-gray-500">0 sec</text>
                    
                    {/* Data points */}
                    <circle cx="60" cy="175" r="3" fill="#3b82f6"/>
                    <circle cx="100" cy="150" r="3" fill="#3b82f6"/>
                    <circle cx="140" cy="140" r="3" fill="#3b82f6"/>
                    <circle cx="180" cy="100" r="3" fill="#3b82f6"/>
                    <circle cx="220" cy="120" r="3" fill="#3b82f6"/>
                    <circle cx="260" cy="130" r="3" fill="#3b82f6"/>
                    <circle cx="300" cy="110" r="3" fill="#3b82f6"/>
                    <circle cx="340" cy="175" r="3" fill="#3b82f6"/>
                    <circle cx="360" cy="150" r="3" fill="#3b82f6"/>
                    <circle cx="380" cy="140" r="3" fill="#3b82f6"/>
                    
                    {/* Line */}
                    <polyline
                      points="60,175 100,150 140,140 180,100 220,120 260,130 300,110 340,175 360,150 380,140"
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="2"
                    />
                    
                    {/* Legend */}
                    <circle cx="50" cy="160" r="4" fill="#3b82f6"/>
                    <text x="60" y="165" className="text-xs fill-gray-600">Average time spent</text>
                  </svg>
                </div>
              </CardContent>
            </Card>

            {/* Short-Term Issues: Resolution by priority */}
            <Card className="h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Short-Term Issues: Resolution by priority</CardTitle>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Overall breakdown of Issues resolved during Weekly Meetings, based on priority ratings.
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  Expand details
                </Button>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center mb-4">
                  {/* Donut Chart */}
                  <div className="relative w-32 h-32">
                    <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 36 36">
                      {/* Background circle */}
                      <path
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#e5e7eb"
                        strokeWidth="2"
                      />
                      {/* No rating - 49% */}
                      <path
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#6b7280"
                        strokeWidth="3"
                        strokeDasharray="49, 100"
                        strokeDashoffset="0"
                      />
                      {/* Priority 1 */}
                      <path
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#14b8a6"
                        strokeWidth="3"
                        strokeDasharray="8, 100"
                        strokeDashoffset="-49"
                      />
                      {/* Priority 2 */}
                      <path
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#0d9488"
                        strokeWidth="3"
                        strokeDasharray="12, 100"
                        strokeDashoffset="-57"
                      />
                      {/* Priority 3 */}
                      <path
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#7c3aed"
                        strokeWidth="3"
                        strokeDasharray="15, 100"
                        strokeDashoffset="-69"
                      />
                      {/* Priority 4 */}
                      <path
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#5b21b6"
                        strokeWidth="3"
                        strokeDasharray="8, 100"
                        strokeDashoffset="-84"
                      />
                      {/* Priority 5 */}
                      <path
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#1e40af"
                        strokeWidth="3"
                        strokeDasharray="8, 100"
                        strokeDashoffset="-92"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-lg font-bold text-gray-900 dark:text-white">78</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">Total resolved</div>
                    </div>
                  </div>
                </div>
                
                {/* Legend */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                    <span className="text-gray-600 dark:text-gray-400">No rating (38)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-teal-500 rounded-full"></div>
                    <span className="text-gray-600 dark:text-gray-400">1 (6)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-teal-600 rounded-full"></div>
                    <span className="text-gray-600 dark:text-gray-400">2 (9)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-purple-600 rounded-full"></div>
                    <span className="text-gray-600 dark:text-gray-400">3 (12)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-purple-800 rounded-full"></div>
                    <span className="text-gray-600 dark:text-gray-400">4 (6)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-800 rounded-full"></div>
                    <span className="text-gray-600 dark:text-gray-400">5 (7)</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Short-Term Issues: Resolution over time by priority */}
            <Card className="h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Short-Term Issues: Resolution over time by priority</CardTitle>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Breakdown of Issues resolved during Weekly Meetings, based on priority ratings.
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  Expand details
                </Button>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center">
                  {/* Stacked Bar Chart */}
                  <svg className="w-full h-full" viewBox="0 0 400 200">
                    {/* Y-axis */}
                    <line x1="40" y1="20" x2="40" y2="180" stroke="#e5e7eb" strokeWidth="1"/>
                    {/* X-axis */}
                    <line x1="40" y1="180" x2="380" y2="180" stroke="#e5e7eb" strokeWidth="1"/>
                    
                    {/* Y-axis labels */}
                    <text x="35" y="25" textAnchor="end" className="text-xs fill-gray-500">15</text>
                    <text x="35" y="65" textAnchor="end" className="text-xs fill-gray-500">10</text>
                    <text x="35" y="105" textAnchor="end" className="text-xs fill-gray-500">5</text>
                    <text x="35" y="185" textAnchor="end" className="text-xs fill-gray-500">0</text>
                    
                    {/* Stacked bars */}
                    <rect x="55" y="160" width="20" height="20" fill="#6b7280"/>
                    <rect x="85" y="150" width="20" height="30" fill="#6b7280"/>
                    <rect x="115" y="140" width="20" height="40" fill="#6b7280"/>
                    <rect x="145" y="130" width="20" height="50" fill="#6b7280"/>
                    <rect x="175" y="130" width="20" height="50" fill="#6b7280"/>
                    <rect x="205" y="120" width="20" height="60" fill="#6b7280"/>
                    <rect x="235" y="120" width="20" height="60" fill="#6b7280"/>
                    <rect x="265" y="110" width="20" height="70" fill="#6b7280"/>
                    <rect x="295" y="120" width="20" height="60" fill="#6b7280"/>
                    <rect x="325" y="120" width="20" height="60" fill="#6b7280"/>
                    
                    {/* Legend */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                        <span className="text-xs text-gray-600">No rating</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                        <span className="text-xs text-gray-600">1</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-teal-600 rounded-full"></div>
                        <span className="text-xs text-gray-600">2</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-purple-600 rounded-full"></div>
                        <span className="text-xs text-gray-600">3</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-purple-800 rounded-full"></div>
                        <span className="text-xs text-gray-600">4</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-blue-800 rounded-full"></div>
                        <span className="text-xs text-gray-600">5</span>
                      </div>
                    </div>
                  </svg>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'todos' && (
          <div className="space-y-6">
            {/* Top Row - Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Team To-Dos: Overview */}
              <Card className="h-full">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Team To-Dos: Overview</CardTitle>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Overall status breakdown of Team To-Dos created within this date range.
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    Expand details
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center mb-4">
                    {/* Donut Chart */}
                    <div className="relative w-32 h-32">
                      <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 36 36">
                        {/* Background circle */}
                        <path
                          d="M18 2.0845
                            a 15.9155 15.9155 0 0 1 0 31.831
                            a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="#e5e7eb"
                          strokeWidth="2"
                        />
                        {/* Completed - 68% */}
                        <path
                          d="M18 2.0845
                            a 15.9155 15.9155 0 0 1 0 31.831
                            a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="3"
                          strokeDasharray="68, 100"
                          strokeDashoffset="0"
                        />
                        {/* In progress - 21% */}
                        <path
                          d="M18 2.0845
                            a 15.9155 15.9155 0 0 1 0 31.831
                            a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="#3b82f6"
                          strokeWidth="3"
                          strokeDasharray="21, 100"
                          strokeDashoffset="-68"
                        />
                        {/* Overdue - 11% */}
                        <path
                          d="M18 2.0845
                            a 15.9155 15.9155 0 0 1 0 31.831
                            a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="#ef4444"
                          strokeWidth="3"
                          strokeDasharray="11, 100"
                          strokeDashoffset="-89"
                        />
                        {/* Due today - 0% */}
                        <path
                          d="M18 2.0845
                            a 15.9155 15.9155 0 0 1 0 31.831
                            a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="#f97316"
                          strokeWidth="3"
                          strokeDasharray="0, 100"
                          strokeDashoffset="-100"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <div className="text-lg font-bold text-gray-900 dark:text-white">19</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">Total created</div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Legend */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <span className="text-gray-600 dark:text-gray-400">In progress (21%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <span className="text-gray-600 dark:text-gray-400">Overdue (11%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                      <span className="text-gray-600 dark:text-gray-400">Due today (0%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span className="text-gray-600 dark:text-gray-400">Completed (68%)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Team To-Dos: Revised due dates */}
              <Card className="h-full">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Team To-Dos: Revised due dates</CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Team To-Dos with revised due dates.
                      </p>
                      <Info className="h-4 w-4 text-gray-400" />
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    Expand details
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-center justify-center">
                    {/* Bar Chart */}
                    <svg className="w-full h-full" viewBox="0 0 400 200">
                      {/* Y-axis */}
                      <line x1="40" y1="20" x2="40" y2="180" stroke="#e5e7eb" strokeWidth="1"/>
                      {/* X-axis */}
                      <line x1="40" y1="180" x2="380" y2="180" stroke="#e5e7eb" strokeWidth="1"/>
                      
                      {/* Y-axis labels */}
                      <text x="35" y="25" textAnchor="end" className="text-xs fill-gray-500">20</text>
                      <text x="35" y="65" textAnchor="end" className="text-xs fill-gray-500">15</text>
                      <text x="35" y="105" textAnchor="end" className="text-xs fill-gray-500">10</text>
                      <text x="35" y="145" textAnchor="end" className="text-xs fill-gray-500">5</text>
                      <text x="35" y="185" textAnchor="end" className="text-xs fill-gray-500">0</text>
                      
                      {/* Bars */}
                      <rect x="80" y="60" width="80" height="120" fill="#10b981"/>
                      <rect x="200" y="140" width="80" height="40" fill="#10b981"/>
                      <rect x="320" y="175" width="40" height="5" fill="#10b981"/>
                      
                      {/* Bar labels */}
                      <text x="120" y="200" textAnchor="middle" className="text-xs fill-gray-600">0 revisions</text>
                      <text x="240" y="200" textAnchor="middle" className="text-xs fill-gray-600">1-5 revisions</text>
                      <text x="340" y="200" textAnchor="middle" className="text-xs fill-gray-600">More than 5 revisions</text>
                      
                      {/* Value labels */}
                      <text x="120" y="50" textAnchor="middle" className="text-xs fill-gray-600">17 To-Dos</text>
                      <text x="240" y="130" textAnchor="middle" className="text-xs fill-gray-600">2 To-Dos</text>
                      <text x="340" y="165" textAnchor="middle" className="text-xs fill-gray-600">0 To-Dos</text>
                    </svg>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Bottom Row - Full Width */}
            <div className="grid grid-cols-1">
              {/* Team To-Dos: Status over time */}
              <Card className="h-full">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Team To-Dos: Status over time</CardTitle>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Status breakdown of Team To-Dos created or completed during the selected date range.
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    Expand details
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-center justify-center">
                    {/* Stacked Bar Chart */}
                    <svg className="w-full h-full" viewBox="0 0 400 200">
                      {/* Y-axis */}
                      <line x1="40" y1="20" x2="40" y2="180" stroke="#e5e7eb" strokeWidth="1"/>
                      {/* X-axis */}
                      <line x1="40" y1="180" x2="380" y2="180" stroke="#e5e7eb" strokeWidth="1"/>
                      
                      {/* Y-axis labels */}
                      <text x="35" y="25" textAnchor="end" className="text-xs fill-gray-500">15</text>
                      <text x="35" y="65" textAnchor="end" className="text-xs fill-gray-500">10</text>
                      <text x="35" y="105" textAnchor="end" className="text-xs fill-gray-500">5</text>
                      <text x="35" y="185" textAnchor="end" className="text-xs fill-gray-500">0</text>
                      
                      {/* Stacked bars */}
                      <rect x="55" y="160" width="20" height="20" fill="#10b981"/>
                      <rect x="85" y="140" width="20" height="40" fill="#10b981"/>
                      <rect x="115" y="120" width="20" height="60" fill="#10b981"/>
                      <rect x="145" y="130" width="20" height="50" fill="#10b981"/>
                      <rect x="175" y="150" width="20" height="30" fill="#10b981"/>
                      <rect x="205" y="100" width="20" height="80" fill="#10b981"/>
                      <rect x="235" y="110" width="20" height="70" fill="#10b981"/>
                      <rect x="265" y="120" width="20" height="60" fill="#10b981"/>
                      <rect x="295" y="130" width="20" height="50" fill="#10b981"/>
                      <rect x="325" y="140" width="20" height="40" fill="#10b981"/>
                      
                      {/* Legend */}
                      <div className="flex flex-wrap gap-4 mt-2">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span className="text-xs text-gray-600">Completed</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          <span className="text-xs text-gray-600">In progress</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                          <span className="text-xs text-gray-600">Due today</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                          <span className="text-xs text-gray-600">Overdue</span>
                        </div>
                      </div>
                    </svg>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'issues' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Short-Term Issues: Resolution by priority */}
            <Card className="h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Short-Term Issues: Resolution by priority</CardTitle>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Overall breakdown of Issues resolved by the end of the date range, based on priority ratings.
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  Expand details
                </Button>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center mb-4">
                  {/* Donut Chart */}
                  <div className="relative w-32 h-32">
                    <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 36 36">
                      {/* Background circle */}
                      <path
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#e5e7eb"
                        strokeWidth="2"
                      />
                      {/* No rating - largest segment */}
                      <path
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#6b7280"
                        strokeWidth="3"
                        strokeDasharray="45, 100"
                        strokeDashoffset="0"
                      />
                      {/* Priority 1 */}
                      <path
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#14b8a6"
                        strokeWidth="3"
                        strokeDasharray="15, 100"
                        strokeDashoffset="-45"
                      />
                      {/* Priority 2 */}
                      <path
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#0ea5e9"
                        strokeWidth="3"
                        strokeDasharray="12, 100"
                        strokeDashoffset="-60"
                      />
                      {/* Priority 3 */}
                      <path
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#7c3aed"
                        strokeWidth="3"
                        strokeDasharray="15, 100"
                        strokeDashoffset="-72"
                      />
                      {/* Priority 4 */}
                      <path
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#5b21b6"
                        strokeWidth="3"
                        strokeDasharray="8, 100"
                        strokeDashoffset="-87"
                      />
                      {/* Priority 5 */}
                      <path
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#374151"
                        strokeWidth="3"
                        strokeDasharray="5, 100"
                        strokeDashoffset="-95"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-lg font-bold text-gray-900 dark:text-white">80</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">Total resolved</div>
                    </div>
                  </div>
                </div>
                
                {/* Legend */}
                <div className="flex flex-wrap gap-3 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                    <span className="text-gray-600 dark:text-gray-400">No rating</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                    <span className="text-gray-600 dark:text-gray-400">1</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-sky-500 rounded-full"></div>
                    <span className="text-gray-600 dark:text-gray-400">2</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-purple-600 rounded-full"></div>
                    <span className="text-gray-600 dark:text-gray-400">3</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-purple-800 rounded-full"></div>
                    <span className="text-gray-600 dark:text-gray-400">4</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-gray-700 rounded-full"></div>
                    <span className="text-gray-600 dark:text-gray-400">5</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Short-Term Issues: Resolution over time by priority */}
            <Card className="h-full">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Short-Term Issues: Resolution over time by priority</CardTitle>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Breakdown of Issues resolved over time, based on priority ratings.
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  Expand details
                </Button>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center">
                  {/* Stacked Bar Chart */}
                  <svg className="w-full h-full" viewBox="0 0 400 200">
                    {/* Y-axis */}
                    <line x1="40" y1="20" x2="40" y2="180" stroke="#e5e7eb" strokeWidth="1"/>
                    {/* X-axis */}
                    <line x1="40" y1="180" x2="380" y2="180" stroke="#e5e7eb" strokeWidth="1"/>
                    
                    {/* Y-axis labels */}
                    <text x="35" y="25" textAnchor="end" className="text-xs fill-gray-500">15</text>
                    <text x="35" y="65" textAnchor="end" className="text-xs fill-gray-500">10</text>
                    <text x="35" y="105" textAnchor="end" className="text-xs fill-gray-500">5</text>
                    <text x="35" y="185" textAnchor="end" className="text-xs fill-gray-500">0</text>
                    
                    {/* Stacked bars with different colors for each priority */}
                    {/* Week 1 - mostly gray (no rating) */}
                    <rect x="55" y="160" width="20" height="20" fill="#6b7280"/>
                    
                    {/* Week 2 - mixed */}
                    <rect x="85" y="150" width="20" height="30" fill="#6b7280"/>
                    <rect x="85" y="140" width="20" height="10" fill="#14b8a6"/>
                    
                    {/* Week 3 - mostly gray */}
                    <rect x="115" y="160" width="20" height="20" fill="#6b7280"/>
                    
                    {/* Week 4 - mixed */}
                    <rect x="145" y="140" width="20" height="40" fill="#6b7280"/>
                    <rect x="145" y="130" width="20" height="10" fill="#7c3aed"/>
                    
                    {/* Week 5 - mostly gray */}
                    <rect x="175" y="160" width="20" height="20" fill="#6b7280"/>
                    
                    {/* Week 6 - mixed */}
                    <rect x="205" y="120" width="20" height="60" fill="#6b7280"/>
                    <rect x="205" y="110" width="20" height="10" fill="#14b8a6"/>
                    <rect x="205" y="100" width="20" height="10" fill="#0ea5e9"/>
                    
                    {/* Week 7 - mostly gray */}
                    <rect x="235" y="160" width="20" height="20" fill="#6b7280"/>
                    
                    {/* Week 8 - mixed */}
                    <rect x="265" y="130" width="20" height="50" fill="#6b7280"/>
                    <rect x="265" y="120" width="20" height="10" fill="#7c3aed"/>
                    <rect x="265" y="110" width="20" height="10" fill="#5b21b6"/>
                    
                    {/* Week 9 - mostly gray */}
                    <rect x="295" y="160" width="20" height="20" fill="#6b7280"/>
                    
                    {/* Week 10 - complex stack */}
                    <rect x="325" y="100" width="20" height="80" fill="#6b7280"/>
                    <rect x="325" y="90" width="20" height="10" fill="#14b8a6"/>
                    <rect x="325" y="80" width="20" height="10" fill="#0ea5e9"/>
                    <rect x="325" y="70" width="20" height="10" fill="#7c3aed"/>
                    <rect x="325" y="60" width="20" height="10" fill="#5b21b6"/>
                    <rect x="325" y="50" width="20" height="10" fill="#374151"/>
                    
                    {/* Legend */}
                    <div className="flex flex-wrap gap-3 mt-2">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                        <span className="text-xs text-gray-600">No rating</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                        <span className="text-xs text-gray-600">1</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-sky-500 rounded-full"></div>
                        <span className="text-xs text-gray-600">2</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-purple-600 rounded-full"></div>
                        <span className="text-xs text-gray-600">3</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-purple-800 rounded-full"></div>
                        <span className="text-xs text-gray-600">4</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-gray-700 rounded-full"></div>
                        <span className="text-xs text-gray-600">5</span>
                      </div>
                    </div>
                  </svg>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default InsightsPage;
