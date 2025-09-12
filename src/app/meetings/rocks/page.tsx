import React, { useState } from 'react';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { 
  Search,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  Users,
  Target,
  CheckCircle,
  AlertCircle,
  Globe,
  TrendingUp
} from 'lucide-react';

interface Rock {
  id: string;
  title: string;
  status: 'on-track' | 'off-track' | 'complete';
  milestoneProgress?: string;
  dueBy: string;
  owner?: string;
}

interface RockSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  rocks: Rock[];
  isExpanded: boolean;
  badge?: string;
}

const RocksPage: React.FC = () => {
  const [teamFilter, setTeamFilter] = useState('amp-leadership');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [sections, setSections] = useState<RockSection[]>([
    {
      id: 'vision',
      title: 'Vision | Revenue, Profit, Measurables',
      icon: <Target className="h-5 w-5 text-orange-500" />,
      rocks: [],
      isExpanded: false
    },
    {
      id: 'company',
      title: 'Company Rocks',
      icon: <Users className="h-5 w-5 text-blue-500" />,
      rocks: [],
      isExpanded: false
    },
    {
      id: 'brian',
      title: 'Brian Rodgers',
      icon: <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">BR</div>,
      rocks: [
        {
          id: '1',
          title: 'General Contractors License',
          status: 'on-track',
          dueBy: 'Nov 19'
        }
      ],
      isExpanded: false,
      badge: '1'
    },
    {
      id: 'ethan',
      title: 'Ethan Thoenes',
      icon: <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-medium">ET</div>,
      rocks: [
        {
          id: '2',
          title: 'Apprenticeship Program - Months 4-8',
          status: 'on-track',
          dueBy: 'Mar 31, 2026'
        }
      ],
      isExpanded: true,
      badge: '1'
    },
    {
      id: 'greg',
      title: 'Greg Smith',
      icon: <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white text-sm font-medium">GS</div>,
      rocks: [
        {
          id: '3',
          title: 'Business Process & Procedure master list',
          status: 'off-track',
          dueBy: 'Nov 21'
        },
        {
          id: '4',
          title: 'Shop and improve Banking Services',
          status: 'on-track',
          dueBy: 'Dec 19'
        },
        {
          id: '5',
          title: 'Church Street mortgage refinance',
          status: 'on-track',
          dueBy: 'Sep 9'
        },
        {
          id: '6',
          title: '4Q25 cost reduction implementations',
          status: 'on-track',
          dueBy: 'Sep 26'
        },
        {
          id: '7',
          title: 'IT Support Services',
          status: 'complete',
          dueBy: 'Nov 15, 2024'
        }
      ],
      isExpanded: true,
      badge: '10'
    }
  ]);

  const toggleSection = (sectionId: string) => {
    setSections(prev => prev.map(section => 
      section.id === sectionId 
        ? { ...section, isExpanded: !section.isExpanded }
        : section
    ));
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'on-track':
        return <Globe className="h-4 w-4 text-blue-500" />;
      case 'off-track':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'complete':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on-track':
        return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20';
      case 'off-track':
        return 'text-red-600 bg-red-50 dark:bg-red-900/20';
      case 'complete':
        return 'text-green-600 bg-green-50 dark:bg-green-900/20';
      default:
        return 'text-gray-600 bg-gray-50 dark:bg-gray-900/20';
    }
  };

  const isOverdue = (dueBy: string) => {
    const dueDate = new Date(dueBy);
    const today = new Date();
    return dueDate < today && !dueBy.includes('2026') && !dueBy.includes('2025');
  };

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Rocks
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Set and track quarterly goals to help your team consistently hit their targets.
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
            <span className="text-sm text-gray-600 dark:text-gray-400">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="all">All</option>
              <option value="on-track">On-track</option>
              <option value="off-track">Off-track</option>
              <option value="complete">Complete</option>
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
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search Rocks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm w-48"
            />
          </div>
        </div>

        {/* Rock Sections */}
        <div className="space-y-4">
          {sections.map((section) => (
            <Card key={section.id} className="overflow-hidden">
              <CardHeader 
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                onClick={() => toggleSection(section.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {section.icon}
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{section.title}</CardTitle>
                      {section.badge && (
                        <Badge variant="secondary" className="text-xs">
                          {section.badge}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {section.id === 'company' && (
                      <TrendingUp className="h-4 w-4 text-gray-400" />
                    )}
                    {section.isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </CardHeader>
              
              {section.isExpanded && (
                <CardContent>
                  {section.rocks.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      There are no {section.title} for the selected filter.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Status</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Title</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Milestone progress</th>
                            {section.id === 'company' && (
                              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Owner</th>
                            )}
                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Due by</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.rocks.map((rock) => (
                            <tr key={rock.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                              <td className="py-3 px-4">
                                <div className={`flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(rock.status)}`}>
                                  {getStatusIcon(rock.status)}
                                  {rock.status === 'on-track' ? 'On-track' : 
                                   rock.status === 'off-track' ? 'Off-track' : 'Complete'}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-medium text-gray-900 dark:text-white">{rock.title}</div>
                              </td>
                              <td className="py-3 px-4 text-gray-500 dark:text-gray-400">
                                {rock.milestoneProgress || ''}
                              </td>
                              {section.id === 'company' && (
                                <td className="py-3 px-4 text-gray-500 dark:text-gray-400">
                                  {rock.owner || ''}
                                </td>
                              )}
                              <td className="py-3 px-4">
                                <span className={`text-sm ${isOverdue(rock.dueBy) ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
                                  {rock.dueBy}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RocksPage;
