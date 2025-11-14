import React, { useState } from 'react';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { 
  Search,
  FileText,
  Download,
  Megaphone
} from 'lucide-react';

const HeadlinesPage: React.FC = () => {
  const [teamFilter, setTeamFilter] = useState('amp-leadership');
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Headlines
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Easily share important announcements with your team.
          </p>
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
            <Button variant="outline" size="sm" className="relative">
              <FileText className="h-4 w-4" />
              <Badge variant="secondary" className="absolute -top-1 -right-1 text-xs px-1 py-0">
                PDF
              </Badge>
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
              placeholder="Search Headlines..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm w-48"
            />
          </div>
        </div>

        {/* Headlines Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Headlines 0</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <Megaphone className="h-8 w-8 text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Your team hasn't added any Headlines yet.
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Headlines are a great way to share important news.
              </p>
              <a 
                href="#" 
                className="text-[#f26722] hover:text-[#e55611] font-medium"
              >
                Learn more about Headlines
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Cascading Messages Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cascading Messages 0</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <Megaphone className="h-8 w-8 text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Your company hasn't added any Cascading Messages yet.
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Cascading Messages are a great way to share news across teams.
              </p>
              <a 
                href="#" 
                className="text-[#f26722] hover:text-[#e55611] font-medium"
              >
                Learn more about Cascading Messages
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default HeadlinesPage;
