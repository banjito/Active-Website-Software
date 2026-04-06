import React, { useState } from 'react';
import Card, { CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { 
  ChevronUp,
  ChevronDown,
  Search,
  Filter,
  Edit3,
  MoreHorizontal,
  Copy
} from 'lucide-react';

interface Responsibility {
  id: string;
  name: string;
  title: string;
  responsibilities: string[];
  avatar: string;
  initials: string;
  isExpanded: boolean;
}

const ResponsibilitiesPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'primary-chart' | 'shared-with-me'>('primary-chart');
  const [searchQuery, setSearchQuery] = useState('');
  const [responsibilities, setResponsibilities] = useState<Responsibility[]>([
    {
      id: '1',
      name: 'Brian Rodgers',
      title: 'Visionary CEO',
      responsibilities: [
        'Cast The Vision',
        'Drive Company Culture',
        'Create New Business Ideas'
      ],
      avatar: 'BR',
      initials: 'BR',
      isExpanded: true
    },
    {
      id: '2',
      name: 'Greg Smith',
      title: 'Integrator/ COO',
      responsibilities: [
        'Keep the Visionary and Company in Step with each other',
        'Remove Obstacles & Barriers'
      ],
      avatar: 'GS',
      initials: 'GS',
      isExpanded: true
    },
    {
      id: '3',
      name: 'Jack Lyons',
      title: 'Executive Assistant',
      responsibilities: [
        'Handle Brian, make sure he is aware of the priorities the company has for him.'
      ],
      avatar: '👤',
      initials: 'JL',
      isExpanded: true
    }
  ]);

  const toggleResponsibility = (id: string) => {
    setResponsibilities(prev => prev.map(resp => 
      resp.id === id 
        ? { ...resp, isExpanded: !resp.isExpanded }
        : resp
    ));
  };

  const getAvatar = (responsibility: Responsibility) => {
    if (responsibility.avatar === '👤') {
      return (
        <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white text-lg">
          {responsibility.avatar}
        </div>
      );
    }
    return (
      <div className="w-12 h-12 bg-gray-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
        {responsibility.initials}
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Responsibilities
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Map out the roles and responsibilities for each seat in your business.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-1 mb-6">
          <button
            onClick={() => setActiveTab('primary-chart')}
            className={`px-4 py-2 font-medium transition-colors relative ${
              activeTab === 'primary-chart'
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Primary Chart
            {activeTab === 'primary-chart' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#f26722]"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab('shared-with-me')}
            className={`px-4 py-2 font-medium transition-colors relative ${
              activeTab === 'shared-with-me'
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Shared With Me
            {activeTab === 'shared-with-me' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#f26722]"></div>
            )}
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm">
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm">
              <Search className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm">
              <Edit3 className="h-4 w-4 mr-2" />
              View details
            </Button>
            <Button variant="outline" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search users or Seats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm w-64"
            />
          </div>
        </div>

        {/* Organizational Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8">
          <div className="flex flex-col items-center space-y-8">
            {/* Top Level - Brian Rodgers */}
            <div className="flex flex-col items-center">
              <Card className="w-80 relative">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {getAvatar(responsibilities[0])}
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white text-lg">
                          {responsibilities[0].name}
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                          {responsibilities[0].title}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {responsibilities[0].isExpanded && (
                    <div className="space-y-2 mb-4">
                      {responsibilities[0].responsibilities.map((resp, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <span className="text-gray-400 text-sm mt-1">•</span>
                          <span className="text-gray-700 dark:text-gray-300 text-sm">
                            {resp}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex justify-center">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => toggleResponsibility(responsibilities[0].id)}
                    >
                      {responsibilities[0].isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Connecting Line */}
            <div className="w-px h-8 bg-gray-300 dark:bg-gray-600"></div>

            {/* Second Level - Greg Smith and Jack Lyons */}
            <div className="flex items-center gap-16">
              {/* Greg Smith */}
              <div className="flex flex-col items-center">
                <Card className="w-80 relative">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        {getAvatar(responsibilities[1])}
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white text-lg">
                            {responsibilities[1].name}
                          </h3>
                          <p className="text-gray-600 dark:text-gray-400 text-sm">
                            {responsibilities[1].title}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    {responsibilities[1].isExpanded && (
                      <div className="space-y-2 mb-4">
                        {responsibilities[1].responsibilities.map((resp, index) => (
                          <div key={index} className="flex items-start gap-2">
                            <span className="text-gray-400 text-sm mt-1">•</span>
                            <span className="text-gray-700 dark:text-gray-300 text-sm">
                              {resp}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div className="flex justify-center">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => toggleResponsibility(responsibilities[1].id)}
                      >
                        {responsibilities[1].isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Jack Lyons */}
              <div className="flex flex-col items-center">
                <Card className="w-80 relative">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        {getAvatar(responsibilities[2])}
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white text-lg">
                            {responsibilities[2].name}
                          </h3>
                          <p className="text-gray-600 dark:text-gray-400 text-sm">
                            {responsibilities[2].title}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    {responsibilities[2].isExpanded && (
                      <div className="space-y-2 mb-4">
                        {responsibilities[2].responsibilities.map((resp, index) => (
                          <div key={index} className="flex items-start gap-2">
                            <span className="text-gray-400 text-sm mt-1">•</span>
                            <span className="text-gray-700 dark:text-gray-300 text-sm">
                              {resp}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div className="flex justify-center">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => toggleResponsibility(responsibilities[2].id)}
                      >
                        {responsibilities[2].isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResponsibilitiesPage;
