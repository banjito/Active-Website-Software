import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { 
  Search,
  RefreshCw,
  FileText,
  Download,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  TrendingUp
} from 'lucide-react';

interface Todo {
  id: string;
  title: string;
  dueBy: string;
  owner: string;
  ownerInitials: string;
  isOverdue: boolean;
  isRecurring?: boolean;
}

const ToDosPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'team' | 'private'>('team');
  const [teamFilter, setTeamFilter] = useState('amp-leadership');
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [meetingTodos, setMeetingTodos] = useState<Todo[]>([]);
  const { user } = useAuth();

  const teamTodos: Todo[] = [
    {
      id: '1',
      title: 'NFPA 70E Training - Edit',
      dueBy: 'Jul 21',
      owner: 'Greg Smith',
      ownerInitials: 'GS',
      isOverdue: true
    },
    {
      id: '2',
      title: 'Monthly Marketing Email',
      dueBy: 'Sep 4',
      owner: 'Greg Smith',
      ownerInitials: 'GS',
      isOverdue: true,
      isRecurring: true
    },
    {
      id: '3',
      title: 'Put together After-Action Report',
      dueBy: 'Aug 20',
      owner: 'Ethan Thoenes',
      ownerInitials: 'ET',
      isOverdue: true
    },
    {
      id: '4',
      title: 'Strategic Plan meetings Sept 24 pm and 25 am at Tourism office and meal input',
      dueBy: 'Sep 1',
      owner: 'Greg Smith',
      ownerInitials: 'GS',
      isOverdue: true
    },
    {
      id: '5',
      title: 'Truck 19 prep for Anthony Masters',
      dueBy: 'Sep 15',
      owner: 'Brian Rodgers',
      ownerInitials: 'BR',
      isOverdue: false
    },
    {
      id: '6',
      title: 'Coats for Cal guys',
      dueBy: 'Sep 15',
      owner: 'Nick Lacey',
      ownerInitials: 'NL',
      isOverdue: false
    },
    {
      id: '7',
      title: 'Apprenticeship program - put in Strategic Planning',
      dueBy: 'Sep 15',
      owner: 'Greg Smith',
      ownerInitials: 'GS',
      isOverdue: false
    },
    {
      id: '8',
      title: 'Find HR resources document for Jack',
      dueBy: 'Sep 15',
      owner: 'Will Smith',
      ownerInitials: 'WS',
      isOverdue: false
    }
  ];

  const privateTodos: Todo[] = [
    // Add private todos here when needed
  ];

  const currentTodos = activeTab === 'team' ? [...teamTodos, ...meetingTodos] : privateTodos;
  
  // Load meeting-created To-Dos from localStorage into local state
  useEffect(() => {
    (async () => {
      try {
        // Load meeting todos from Supabase
        const { data, error } = await supabase
          .schema('neta_ops')
          .from('meeting_todos')
          .select('id, title, due_date, status')
          .order('created_at', { ascending: false });
        if (!error && Array.isArray(data)) {
          const mapped: Todo[] = data.map((t) => ({
            id: String(t.id),
            title: t.title,
            dueBy: t.due_date ? new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
            owner: 'Meeting',
            ownerInitials: 'MT',
            isOverdue: false
          }));
          setMeetingTodos(mapped);
        }
      } catch (e) {
        console.error('Error loading meeting todos:', e);
      }
      // Also load from localStorage (fallback)
      try {
        const raw = localStorage.getItem('runway_runner_state_v1');
        if (raw) {
          const saved = JSON.parse(raw) as { todos?: { id: string; title: string; done?: boolean }[] };
          if (saved && Array.isArray(saved.todos)) {
            const mt: Todo[] = saved.todos.map((t) => ({
              id: `mt-${t.id}`,
              title: t.title,
              dueBy: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              owner: 'Meeting',
              ownerInitials: 'MT',
              isOverdue: false
            }));
            setMeetingTodos((prev) => {
              const existing = new Set(prev.map(p => p.id));
              const merged = [...prev];
              for (const m of mt) if (!existing.has(m.id)) merged.push(m);
              return merged;
            });
          }
        }
      } catch {}
    })();
  }, []);
  const filteredTodos = currentTodos.filter(todo => 
    todo.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalItems = filteredTodos.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const paginatedTodos = filteredTodos.slice(startIndex, endIndex);

  const deleteMeetingTodo = async (id: string) => {
    // Try delete from Supabase if looks like uuid (no mt- prefix)
    if (!id.startsWith('mt-')) {
      try {
        await supabase.schema('neta_ops').from('meeting_todos').delete().eq('id', id);
        setMeetingTodos(prev => prev.filter(t => t.id !== id));
      } catch (e) {
        console.error('Error deleting meeting todo:', e);
      }
      return;
    }
    // Otherwise, remove from localStorage fallback
    try {
      const raw = localStorage.getItem('runway_runner_state_v1');
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && Array.isArray(saved.todos)) {
          const origId = id.slice(3);
          saved.todos = saved.todos.filter((t: any) => String(t.id) !== origId);
          localStorage.setItem('runway_runner_state_v1', JSON.stringify(saved));
          setMeetingTodos(prev => prev.filter(t => t.id !== id));
        }
      }
    } catch {}
  };

  const getOwnerAvatar = (ownerInitials: string) => {
    if (ownerInitials === 'GS') {
      return (
        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
          👤
        </div>
      );
    }
    return (
      <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-400 text-sm font-medium">
        {ownerInitials}
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            To-Dos
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Create, assign, and track deadlines for critical tasks.
          </p>
        </div>

        {/* Tabs and Filters */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-6">
            {/* Tabs */}
            <div className="flex space-x-1">
              <button
                onClick={() => setActiveTab('team')}
                className={`px-4 py-2 font-medium transition-colors relative ${
                  activeTab === 'team'
                    ? 'text-gray-900 dark:text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Team
                {activeTab === 'team' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#f26722]"></div>
                )}
              </button>
              <button
                onClick={() => setActiveTab('private')}
                className={`px-4 py-2 font-medium transition-colors relative ${
                  activeTab === 'private'
                    ? 'text-gray-900 dark:text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Private
                {activeTab === 'private' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#f26722]"></div>
                )}
              </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4">
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
            </div>
          </div>

          {/* Action Buttons and Search */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm">
              <FileText className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" />
            </Button>
            
            {/* Search */}
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search To-Dos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm w-48"
              />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">
                  {activeTab === 'team' ? 'Team' : 'Private'} To-Dos
                </CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {totalItems}
                </Badge>
              </div>
              <TrendingUp className="h-4 w-4 text-gray-400" />
            </div>
          </CardHeader>
          <CardContent>
            {paginatedTodos.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No {activeTab} to-dos found for the selected filter.
              </div>
            ) : (
              <>
                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-3 px-4">
                          <input type="checkbox" className="rounded" />
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Title</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Due By</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Owner</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTodos.map((todo) => (
                        <tr key={todo.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="py-3 px-4">
                            <input type="checkbox" className="rounded" />
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-gray-900 dark:text-white">{todo.title}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {todo.isOverdue && <AlertCircle className="h-4 w-4 text-red-500" />}
                              <span className={`text-sm ${todo.isOverdue ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
                                {todo.dueBy}
                              </span>
                              {todo.isRecurring && (
                                <RefreshCw className="h-3 w-3 text-gray-400" />
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {getOwnerAvatar(todo.ownerInitials)}
                              <span className="text-sm text-gray-600 dark:text-gray-400">{todo.owner}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {todo.owner === 'Meeting' && (
                              <button
                                onClick={() => deleteMeetingTodo(todo.id)}
                                className="text-sm text-red-600 hover:text-red-700"
                              >
                                Delete
                              </button>
                            )}
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

export default ToDosPage;
