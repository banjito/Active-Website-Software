import React, { useState } from 'react';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { 
  Search,
  RefreshCw,
  FileText,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  List,
  Grid,
  ChevronDown
} from 'lucide-react';

interface Issue {
  id: string;
  title: string;
  created: string;
  owner: string;
  ownerInitials: string;
  ownerAvatar?: string;
}

const IssuesPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'short-term' | 'long-term'>('short-term');
  const [teamFilter, setTeamFilter] = useState('amp-leadership');
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);

  const shortTermIssues: Issue[] = [
    {
      id: '1',
      title: 'Quickbooks project status - all incomplete?',
      created: 'Sep 11',
      owner: 'Greg Smith',
      ownerInitials: 'GS'
    },
    {
      id: '2',
      title: 'Dalton, GA T5 Data Center project',
      created: 'Sep 11',
      owner: 'Greg Smith',
      ownerInitials: 'GS'
    },
    {
      id: '3',
      title: 'Chamber Clay Shoot sponsor for 2026?',
      created: 'Sep 12',
      owner: 'Brian Rodgers',
      ownerInitials: 'BR',
      ownerAvatar: '👤'
    }
  ];

  const longTermIssues: Issue[] = [
    // Add long-term issues here when needed
  ];

  const currentIssues = activeTab === 'short-term' ? shortTermIssues : longTermIssues;
  const filteredIssues = currentIssues.filter(issue => 
    issue.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalItems = filteredIssues.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const paginatedIssues = filteredIssues.slice(startIndex, endIndex);

  const getOwnerAvatar = (issue: Issue) => {
    if (issue.ownerAvatar) {
      return (
        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
          {issue.ownerAvatar}
        </div>
      );
    }
    return (
      <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-400 text-sm font-medium">
        {issue.ownerInitials}
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Issues
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Identify and organize your team's most pressing Issues to resolve them with ease.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 mb-6">
          <button
            onClick={() => setActiveTab('short-term')}
            className={`px-4 py-2 font-medium transition-colors relative ${
              activeTab === 'short-term'
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Short-Term
            {activeTab === 'short-term' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#f26722]"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab('long-term')}
            className={`px-4 py-2 font-medium transition-colors relative ${
              activeTab === 'long-term'
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Long-Term
            {activeTab === 'long-term' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#f26722]"></div>
            )}
          </button>
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
            <input
              type="checkbox"
              id="archive"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="archive" className="text-sm text-gray-600 dark:text-gray-400">
              Archive
            </label>
          </div>

          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm">
              <FileText className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" />
            </Button>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search Issues..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm w-48"
            />
          </div>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">
                  {activeTab === 'short-term' ? 'Short-Term' : 'Long-Term'}
                </CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {totalItems}
                </Badge>
              </div>
              
              {/* View Mode Toggle */}
              <div className="flex items-center gap-1">
                <Button
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className={viewMode === 'list' ? 'bg-[#f26722] text-white' : ''}
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className={viewMode === 'grid' ? 'bg-[#f26722] text-white' : ''}
                >
                  <Grid className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {paginatedIssues.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No {activeTab} issues found for the selected filter.
              </div>
            ) : (
              <>
                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-3 px-4">
                          <input type="radio" className="rounded-full" />
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Title</th>
                        <th className="text-center py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">#</th>
                        <th className="text-center py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Created</th>
                        <th className="text-center py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Owner</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedIssues.map((issue, index) => (
                        <tr key={issue.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="py-3 px-4">
                            <input type="radio" className="rounded-full" />
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-gray-900 dark:text-white">
                              {index + 1}. {issue.title}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Button variant="ghost" size="sm">
                              <ChevronDown className="h-4 w-4 text-gray-400" />
                            </Button>
                          </td>
                          <td className="py-3 px-4 text-center text-gray-900 dark:text-white">
                            {issue.created}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {getOwnerAvatar(issue)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Items per page:</span>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => setItemsPerPage(Number(e.target.value))}
                      className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {startIndex + 1}-{endIndex} of {totalItems}
                    </span>
                    
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" disabled={currentPage === 1}>
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" disabled={currentPage === 1}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" disabled={currentPage === totalPages}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" disabled={currentPage === totalPages}>
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default IssuesPage;
