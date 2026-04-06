import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import { CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { 
  CheckSquare, 
  Plus, 
  Edit3, 
  Filter, 
  ChevronDown, 
  Calendar,
  Target,
  BarChart3,
  Settings,
  Trash2,
  Save,
  X,
  GripVertical,
  TrendingUp,
  Mountain
} from 'lucide-react';

interface Todo {
  id: string;
  title: string;
  completed: boolean;
  dueDate: string;
  isPrivate: boolean;
}

interface Rock {
  id: string;
  title: string;
  completed: boolean;
  dueDate: string;
  type: 'rock' | 'milestone';
}

interface ScorecardMetric {
  id: string;
  title: string;
  goal: string;
  average: number;
  total: number;
  weeklyData: number[];
}

interface Widget {
  id: string;
  type: 'team-todos' | 'private-todos' | 'rocks' | 'scorecard' | 'todos-90-days' | 'rock-statuses' | 'kpis';
  title: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  visible: boolean;
}

interface Section {
  id: string;
  type: 'team-todos' | 'private-todos' | 'rocks' | 'scorecard' | 'todos-90-days' | 'rock-statuses' | 'kpis';
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
}

export default function MyDataPage() {
  const [isEditMode, setIsEditMode] = useState(false);
  const [teamFilter, setTeamFilter] = useState('All');
  const [privateFilter, setPrivateFilter] = useState('Incomplete');
  const [scorecardPeriod, setScorecardPeriod] = useState('Weekly');
  const [scorecardWeeks, setScorecardWeeks] = useState('6 (default)');
  
  const [teamTodos, setTeamTodos] = useState<Todo[]>([
    { id: '1', title: 'Find Date Stamp', completed: true, dueDate: 'Nov 27', isPrivate: false },
    { id: '2', title: 'Figure Out Balance of Reactivator and Ink', completed: false, dueDate: 'Nov 27', isPrivate: false },
    { id: '3', title: 'Create section for PO Number in Project Overview', completed: false, dueDate: 'Nov 27', isPrivate: false },
    { id: '4', title: 'Add Job Closing Document To Access - All Must Sign', completed: false, dueDate: 'Nov 27', isPrivate: false },
    { id: '5', title: 'Add Job Type Onsite, Order, Rental, or In-Lab to Access', completed: false, dueDate: 'Nov 27', isPrivate: false },
  ]);
  
  const [privateTodos, setPrivateTodos] = useState<Todo[]>([]);
  
  const [rocks, setRocks] = useState<Rock[]>([
    { id: '1', title: 'Research/Purchase Hi-Pot', completed: true, dueDate: 'Dec 24, 2023', type: 'rock' },
    { id: '2', title: 'Research vehicles for Cal Lab', completed: true, dueDate: 'Dec 25, 2023', type: 'rock' },
    { id: '3', title: 'Better Testing for Sleeves', completed: false, dueDate: 'Dec 31, 2023', type: 'milestone' },
  ]);
  
  const [scorecardMetrics, setScorecardMetrics] = useState<ScorecardMetric[]>([
    { 
      id: '1', 
      title: 'Rubber Goods Tested Weekly', 
      goal: '>= 250', 
      average: 0, 
      total: 0, 
      weeklyData: [0, 0, 0, 0, 0, 0] 
    },
    { 
      id: '2', 
      title: 'Rubber Goods Received Weekly', 
      goal: '>= 250', 
      average: 0, 
      total: 0, 
      weeklyData: [0, 0, 0, 0, 0, 0] 
    },
  ]);

  const [widgets, setWidgets] = useState<Widget[]>([
    { id: '1', type: 'team-todos', title: 'Team To-Dos', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, visible: true },
    { id: '2', type: 'private-todos', title: 'Private To-Dos', position: { x: 1, y: 0 }, size: { width: 1, height: 1 }, visible: true },
    { id: '3', type: 'rocks', title: 'Rocks & Milestones', position: { x: 2, y: 0 }, size: { width: 1, height: 1 }, visible: true },
    { id: '4', type: 'scorecard', title: 'Scorecard', position: { x: 0, y: 1 }, size: { width: 3, height: 1 }, visible: true },
    { id: '5', type: 'todos-90-days', title: 'To-Dos Created Last 90 Days', position: { x: 0, y: 2 }, size: { width: 1, height: 1 }, visible: false },
    { id: '6', type: 'rock-statuses', title: 'Rock Statuses', position: { x: 1, y: 2 }, size: { width: 1, height: 1 }, visible: false },
    { id: '7', type: 'kpis', title: 'KPIs', position: { x: 2, y: 2 }, size: { width: 1, height: 1 }, visible: false },
  ]);

  const [sections, setSections] = useState<Section[]>([
    { id: '1', type: 'team-todos', title: 'Team To-Dos', description: 'Checklist for daily team tasks', icon: CheckSquare, enabled: true },
    { id: '2', type: 'private-todos', title: 'Private To-Dos', description: 'Checklist for daily Private To-Dos', icon: CheckSquare, enabled: true },
    { id: '3', type: 'rocks', title: 'Rocks & Milestones', description: 'Quarterly Goal', icon: Mountain, enabled: true },
    { id: '4', type: 'scorecard', title: 'Scorecard', description: 'Measurable tracker', icon: BarChart3, enabled: true },
    { id: '5', type: 'todos-90-days', title: 'To-Dos Created Last 90 Days', description: 'Track To-Do creation and completion', icon: TrendingUp, enabled: false },
    { id: '6', type: 'rock-statuses', title: 'Rock Statuses', description: 'Track Rock status across teams', icon: TrendingUp, enabled: false },
    { id: '7', type: 'kpis', title: 'KPIs', description: 'Track Measurable progress', icon: TrendingUp, enabled: false },
  ]);

  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [draggedWidget, setDraggedWidget] = useState<string | null>(null);
  const [dragOverWidget, setDragOverWidget] = useState<string | null>(null);

  // Bring meeting-created To-Dos from the runner (localStorage) into My Runway
  useEffect(() => {
    try {
      const raw = localStorage.getItem('runway_runner_state_v1');
      if (!raw) return;
      const saved = JSON.parse(raw) as { todos?: { id: string; title: string; done?: boolean }[] };
      if (!saved || !Array.isArray(saved.todos)) return;
      const meetingTodos: Todo[] = saved.todos.map((t) => ({
        id: `mt-${t.id}`,
        title: t.title,
        completed: Boolean(t.done),
        dueDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        isPrivate: false
      }));
      // Merge by id without duplicates
      setTeamTodos((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const merged = [...prev];
        for (const m of meetingTodos) {
          if (!existingIds.has(m.id)) merged.push(m);
        }
        return merged;
      });
    } catch {
      // ignore parse errors
    }
  }, []);

  const handleToggleTodo = (id: string, isPrivate: boolean = false) => {
    if (isPrivate) {
      setPrivateTodos(prev => prev.map(todo => 
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      ));
    } else {
      setTeamTodos(prev => prev.map(todo => 
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      ));
      // If this is a meeting-sourced todo, also update localStorage
      if (id.startsWith('mt-')) {
        try {
          const raw = localStorage.getItem('runway_runner_state_v1');
          if (raw) {
            const saved = JSON.parse(raw);
            if (saved && Array.isArray(saved.todos)) {
              const originalId = id.slice(3);
              saved.todos = saved.todos.map((t: any) => (
                String(t.id) === originalId ? { ...t, done: !t.done } : t
              ));
              localStorage.setItem('runway_runner_state_v1', JSON.stringify(saved));
            }
          }
        } catch {
          // ignore storage errors
        }
      }
    }
  };

  const handleToggleRock = (id: string) => {
    setRocks(prev => prev.map(rock => 
      rock.id === id ? { ...rock, completed: !rock.completed } : rock
    ));
  };

  const handleAddTodo = (isPrivate: boolean = false) => {
    if (newItemTitle.trim()) {
      const newTodo: Todo = {
        id: Date.now().toString(),
        title: newItemTitle,
        completed: false,
        dueDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        isPrivate
      };
      
      if (isPrivate) {
        setPrivateTodos(prev => [...prev, newTodo]);
      } else {
        setTeamTodos(prev => [...prev, newTodo]);
      }
      
      setNewItemTitle('');
      setEditingItem(null);
    }
  };

  const handleAddRock = () => {
    if (newItemTitle.trim()) {
      const newRock: Rock = {
        id: Date.now().toString(),
        title: newItemTitle,
        completed: false,
        dueDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        type: 'rock'
      };
      
      setRocks(prev => [...prev, newRock]);
      setNewItemTitle('');
      setEditingItem(null);
    }
  };

  const handleDeleteItem = (id: string, type: 'team-todo' | 'private-todo' | 'rock') => {
    switch (type) {
      case 'team-todo':
        setTeamTodos(prev => prev.filter(todo => todo.id !== id));
        // Also remove from meeting runner localStorage if this is a meeting-sourced todo
        if (id.startsWith('mt-')) {
          try {
            const raw = localStorage.getItem('runway_runner_state_v1');
            if (raw) {
              const saved = JSON.parse(raw);
              if (saved && Array.isArray(saved.todos)) {
                const originalId = id.slice(3);
                saved.todos = saved.todos.filter((t: any) => String(t.id) !== originalId);
                localStorage.setItem('runway_runner_state_v1', JSON.stringify(saved));
              }
            }
          } catch {
            // ignore storage errors
          }
        }
        break;
      case 'private-todo':
        setPrivateTodos(prev => prev.filter(todo => todo.id !== id));
        break;
      case 'rock':
        setRocks(prev => prev.filter(rock => rock.id !== id));
        break;
    }
  };

  const handleToggleSection = (sectionType: string) => {
    setSections(prev => prev.map(section => 
      section.type === sectionType ? { ...section, enabled: !section.enabled } : section
    ));
    
    // Update widgets visibility
    setWidgets(prev => prev.map(widget => 
      widget.type === sectionType ? { ...widget, visible: !widget.visible } : widget
    ));
    
    // If enabling a new section, make sure the widget exists
    const section = sections.find(s => s.type === sectionType);
    if (section && !section.enabled) {
      const existingWidget = widgets.find(w => w.type === sectionType);
      if (!existingWidget) {
        // Add new widget if it doesn't exist
        const newWidget: Widget = {
          id: Date.now().toString(),
          type: sectionType as any,
          title: section.title,
          position: { x: 0, y: widgets.length },
          size: { width: sectionType === 'scorecard' ? 3 : 1, height: 1 },
          visible: true
        };
        setWidgets(prev => [...prev, newWidget]);
      }
    }
  };

  const handleDragStart = (e: React.DragEvent, widgetId: string) => {
    if (!isEditMode) return;
    setDraggedWidget(widgetId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, widgetId: string) => {
    if (!isEditMode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverWidget(widgetId);
  };

  const handleDragLeave = () => {
    setDragOverWidget(null);
  };

  const handleDrop = (e: React.DragEvent, targetWidgetId: string) => {
    if (!isEditMode || !draggedWidget || draggedWidget === targetWidgetId) return;
    
    e.preventDefault();
    
    setWidgets(prev => {
      const draggedIndex = prev.findIndex(w => w.id === draggedWidget);
      const targetIndex = prev.findIndex(w => w.id === targetWidgetId);
      
      if (draggedIndex === -1 || targetIndex === -1) return prev;
      
      const newWidgets = [...prev];
      const [draggedItem] = newWidgets.splice(draggedIndex, 1);
      newWidgets.splice(targetIndex, 0, draggedItem);
      
      return newWidgets;
    });
    
    setDraggedWidget(null);
    setDragOverWidget(null);
  };

  const handleDragEnd = () => {
    setDraggedWidget(null);
    setDragOverWidget(null);
  };

  const renderWidget = (widget: Widget) => {
    switch (widget.type) {
      case 'team-todos':
        return renderTeamTodosWidget();
      case 'private-todos':
        return renderPrivateTodosWidget();
      case 'rocks':
        return renderRocksWidget();
      case 'scorecard':
        return renderScorecardWidget();
      case 'todos-90-days':
        return renderTodos90DaysWidget();
      case 'rock-statuses':
        return renderRockStatusesWidget();
      case 'kpis':
        return renderKPIsWidget();
      default:
        return null;
    }
  };

  const renderTeamTodosWidget = () => (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Team To-Dos {teamTodos.length}</CardTitle>
          <div className="w-3 h-3 bg-orange-500 rounded-sm"></div>
        </div>
        {!isEditMode && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditingItem('team-todo')}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editingItem === 'team-todo' && (
          <div className="mb-4 p-3 border rounded-lg bg-gray-50 dark:bg-gray-800">
            <input
              type="text"
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              placeholder="Enter new team todo..."
              className="w-full p-2 border rounded-md mb-2"
              onKeyPress={(e) => e.key === 'Enter' && handleAddTodo(false)}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleAddTodo(false)}>
                <Save className="h-4 w-4 mr-1" />
                Add
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingItem(null)}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        )}
        <div className="space-y-2">
          {teamTodos.map(todo => (
            <div key={todo.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded">
              <button
                onClick={() => handleToggleTodo(todo.id)}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                  todo.completed 
                    ? 'bg-green-500 border-green-500 text-white' 
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                {todo.completed && <CheckSquare className="h-3 w-3" />}
              </button>
              <span className={`flex-1 ${todo.completed ? 'line-through text-gray-500' : ''}`}>
                {todo.title}
              </span>
              <span className="text-sm text-gray-500">{todo.dueDate}</span>
              {isEditMode && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDeleteItem(todo.id, 'team-todo')}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  const renderPrivateTodosWidget = () => (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Private To-Dos {privateTodos.length}</CardTitle>
        </div>
        {!isEditMode && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditingItem('private-todo')}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editingItem === 'private-todo' && (
          <div className="mb-4 p-3 border rounded-lg bg-gray-50 dark:bg-gray-800">
            <input
              type="text"
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              placeholder="Enter new private todo..."
              className="w-full p-2 border rounded-md mb-2"
              onKeyPress={(e) => e.key === 'Enter' && handleAddTodo(true)}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleAddTodo(true)}>
                <Save className="h-4 w-4 mr-1" />
                Add
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingItem(null)}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        )}
        
        {privateTodos.length === 0 ? (
          <div className="text-center py-8">
            <CheckSquare className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              You have no Private To-Dos right now. Create and manage tasks that are only visible to you.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {privateTodos.map(todo => (
              <div key={todo.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded">
                <button
                  onClick={() => handleToggleTodo(todo.id, true)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                    todo.completed 
                      ? 'bg-green-500 border-green-500 text-white' 
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                >
                  {todo.completed && <CheckSquare className="h-3 w-3" />}
                </button>
                <span className={`flex-1 ${todo.completed ? 'line-through text-gray-500' : ''}`}>
                  {todo.title}
                </span>
                <span className="text-sm text-gray-500">{todo.dueDate}</span>
                {isEditMode && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeleteItem(todo.id, 'private-todo')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderRocksWidget = () => (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Rocks & Milestones</CardTitle>
        </div>
        {!isEditMode && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditingItem('rock')}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editingItem === 'rock' && (
          <div className="mb-4 p-3 border rounded-lg bg-gray-50 dark:bg-gray-800">
            <input
              type="text"
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              placeholder="Enter new rock or milestone..."
              className="w-full p-2 border rounded-md mb-2"
              onKeyPress={(e) => e.key === 'Enter' && handleAddRock()}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddRock}>
                <Save className="h-4 w-4 mr-1" />
                Add
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingItem(null)}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        )}
        <div className="space-y-3">
          {rocks.map(rock => (
            <div key={rock.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded">
              <button
                onClick={() => handleToggleRock(rock.id)}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                  rock.completed 
                    ? 'bg-green-500 border-green-500 text-white' 
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                {rock.completed && <CheckSquare className="h-3 w-3" />}
              </button>
              <div className="flex-1">
                <span className={`block ${rock.completed ? 'line-through text-gray-500' : ''}`}>
                  {rock.title}
                </span>
                <span className="text-sm text-gray-500">Due by {rock.dueDate}</span>
              </div>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                rock.type === 'rock' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
              }`}>
                {rock.type === 'rock' ? <Target className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
              </div>
              {isEditMode && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDeleteItem(rock.id, 'rock')}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  const renderTodos90DaysWidget = () => (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">To-Dos Created Last 90 Days</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          {/* Donut Chart */}
          <div className="relative w-24 h-24">
            <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 36 36">
              {/* Background circle */}
              <path
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="2"
              />
              {/* Completed on time - 36% */}
              <path
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
                strokeDasharray="36, 100"
                strokeDashoffset="0"
              />
              {/* Completed late - 33% */}
              <path
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#ef4444"
                strokeWidth="2"
                strokeDasharray="33, 100"
                strokeDashoffset="-36"
              />
              {/* Incomplete - 30% */}
              <path
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#f97316"
                strokeWidth="2"
                strokeDasharray="30, 100"
                strokeDashoffset="-69"
              />
            </svg>
          </div>
          
          {/* Stats */}
          <div className="flex-1 ml-6">
            <div className="text-2xl font-bold text-gray-900 dark:text-white mb-2">105 Total</div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Completed on Time: <span className="font-semibold">38 (36%)</span></span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Completed Late: <span className="font-semibold">35 (33%)</span></span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-orange-500 rounded-sm"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Incomplete: <span className="font-semibold">32 (30%)</span></span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-4">
          * Note: Completed On Time/Late and Past Due are based on the <strong>original due date</strong> of the To-Do
        </div>
      </CardContent>
    </Card>
  );

  const renderRockStatusesWidget = () => (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Rock Statuses</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex justify-between items-center">
          {/* Done Status */}
          <div className="flex flex-col items-center">
            <div className="relative w-20 h-20 mb-2">
              <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="2"
                />
                <path
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeDasharray="24, 100"
                  strokeDashoffset="0"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-sm font-bold text-gray-900 dark:text-white">24%</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Done</div>
              </div>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Total: 17</div>
          </div>

          {/* On Track Status */}
          <div className="flex flex-col items-center">
            <div className="relative w-20 h-20 mb-2">
              <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="2"
                />
                <path
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                  strokeDasharray="70, 100"
                  strokeDashoffset="0"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-sm font-bold text-gray-900 dark:text-white">70%</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">On Track</div>
              </div>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Total: 50</div>
          </div>

          {/* Off Track Status */}
          <div className="flex flex-col items-center">
            <div className="relative w-20 h-20 mb-2">
              <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="2"
                />
                <path
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2"
                  strokeDasharray="5.6, 100"
                  strokeDashoffset="0"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-sm font-bold text-gray-900 dark:text-white">5.6%</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Off Track</div>
              </div>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Total: 4</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderKPIsWidget = () => (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">KPIs</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Chart Area */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Measurables</span>
            <span className="text-sm text-gray-600 dark:text-gray-400">Teams</span>
          </div>
          
          {/* Horizontal Bar Chart */}
          <div className="relative">
            <div className="flex items-center mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 mr-4">0</span>
              <div className="flex-1 h-6 bg-gray-200 dark:bg-gray-700 rounded">
                {/* On Track - Green */}
                <div className="h-full bg-green-500 rounded-l" style={{ width: '0%' }}>
                  <div className="text-xs text-white text-center leading-6">0</div>
                </div>
                {/* At Risk - Yellow */}
                <div className="h-full bg-yellow-500" style={{ width: '0%' }}>
                  <div className="text-xs text-white text-center leading-6">0</div>
                </div>
                {/* Off Track - Red */}
                <div className="h-full bg-red-500 rounded-r" style={{ width: '0%' }}>
                  <div className="text-xs text-white text-center leading-6">0</div>
                </div>
              </div>
            </div>
            
            {/* Team Label */}
            <div className="text-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">AMP Leadership</span>
            </div>
          </div>
        </div>
        
        {/* Legend */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
            <span className="text-sm text-gray-600 dark:text-gray-400">On Track (3/3)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-yellow-500 rounded-sm"></div>
            <span className="text-sm text-gray-600 dark:text-gray-400">At Risk (1-2/3)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
            <span className="text-sm text-gray-600 dark:text-gray-400">Off Track (0/3)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderScorecardWidget = () => (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Scorecard</CardTitle>
          {!isEditMode && (
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1" />
              Add Metric
            </Button>
          )}
        </div>
        <div className="flex gap-4 mt-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Period Interval:</span>
            <select 
              value={scorecardPeriod} 
              onChange={(e) => setScorecardPeriod(e.target.value)}
              className="text-sm border rounded px-2 py-1"
            >
              <option value="Weekly">Weekly</option>
              <option value="Monthly">Monthly</option>
              <option value="Quarterly">Quarterly</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Number of Weeks:</span>
            <select 
              value={scorecardWeeks} 
              onChange={(e) => setScorecardWeeks(e.target.value)}
              className="text-sm border rounded px-2 py-1"
            >
              <option value="4">4</option>
              <option value="6 (default)">6 (default)</option>
              <option value="8">8</option>
              <option value="12">12</option>
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">?</th>
                <th className="text-left p-2">Title</th>
                <th className="text-left p-2">Goal</th>
                <th className="text-left p-2">Average</th>
                <th className="text-left p-2">Total</th>
                <th className="text-left p-2">Sep 08 - Sep 14</th>
                <th className="text-left p-2">Sep 01 - Sep 07</th>
                <th className="text-left p-2">Aug 25 - Aug 31</th>
                <th className="text-left p-2">Aug 18 - Aug 24</th>
                <th className="text-left p-2">Aug 11 - Aug 17</th>
                <th className="text-left p-2">Aug 04 - Aug 10</th>
              </tr>
            </thead>
            <tbody>
              {scorecardMetrics.map(metric => (
                <tr key={metric.id} className="border-b">
                  <td className="p-2">
                    <BarChart3 className="h-4 w-4 text-gray-400" />
                  </td>
                  <td className="p-2 font-medium">{metric.title}</td>
                  <td className="p-2">{metric.goal}</td>
                  <td className="p-2">{metric.average}</td>
                  <td className="p-2">{metric.total}</td>
                  {metric.weeklyData.map((value, index) => (
                    <td key={index} className="p-2">
                      {isEditMode ? (
                        <input
                          type="number"
                          value={value}
                          onChange={(e) => {
                            const newData = [...metric.weeklyData];
                            newData[index] = parseInt(e.target.value) || 0;
                            setScorecardMetrics(prev => prev.map(m => 
                              m.id === metric.id ? { ...m, weeklyData: newData } : m
                            ));
                          }}
                          className="w-16 p-1 border rounded text-sm"
                        />
                      ) : (
                        value
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-200">
      {/* Header */}
      <div className="bg-white dark:bg-dark-150 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Data</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                A personalized workspace to view tasks, data, goals, and more.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Team:</span>
                <select 
                  value={teamFilter} 
                  onChange={(e) => setTeamFilter(e.target.value)}
                  className="text-sm border rounded px-2 py-1"
                >
                  <option value="All">All</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Calibration">Calibration</option>
                  <option value="Field Services">Field Services</option>
                </select>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </div>
              {isEditMode ? (
                <div className="flex gap-2">
                  <Button
                    onClick={() => setIsEditMode(false)}
                    variant="outline"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => setIsEditMode(false)}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    Save
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => setIsEditMode(true)}
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  <Edit3 className="h-4 w-4 mr-2" />
                  Edit Layout
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 gap-6">
        {/* Dashboard Content */}
        <div className="flex-1 overflow-y-auto max-h-screen">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Render ALL visible widgets including scorecard */}
            {widgets.filter(widget => widget.visible).map((widget, index) => {
              return (
                <div 
                  key={widget.id} 
                  className={`${widget.type === 'scorecard' ? 'lg:col-span-3' : 'lg:col-span-1'} ${isEditMode ? 'cursor-move' : ''} ${
                    draggedWidget === widget.id ? 'opacity-50' : ''
                  } ${dragOverWidget === widget.id ? 'ring-2 ring-orange-500 ring-opacity-50' : ''}`}
                  draggable={isEditMode}
                  onDragStart={(e) => handleDragStart(e, widget.id)}
                  onDragOver={(e) => handleDragOver(e, widget.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, widget.id)}
                  onDragEnd={handleDragEnd}
                >
                  {isEditMode && (
                    <div className="mb-2 flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded">
                      <GripVertical className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">Drag to reorder</span>
                    </div>
                  )}
                  {renderWidget(widget)}
                </div>
              );
            })}
          </div>
          
          {/* Bottom padding for scrolling */}
          <div className="h-20"></div>
        </div>

        {/* Add Sections Sidebar */}
        {isEditMode && (
          <div className="w-80 bg-white dark:bg-dark-150 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 h-fit sticky top-8">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Add Sections</h3>
            <div className="space-y-3">
              {sections.map(section => {
                const Icon = section.icon;
                return (
                  <div key={section.id} className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <input
                      type="checkbox"
                      checked={section.enabled}
                      onChange={() => handleToggleSection(section.type)}
                      className="mt-1 w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="h-4 w-4 text-gray-500" />
                        <span className="font-medium text-gray-900 dark:text-white">{section.title}</span>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{section.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
