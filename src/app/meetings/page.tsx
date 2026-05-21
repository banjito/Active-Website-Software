import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Printer, Info, Play, Pause, SkipForward, SkipBack, Timer as TimerIcon, ListOrdered, Flag, Plus, Check, X, ChevronUp, ChevronDown, Download, FileText } from 'lucide-react';
import { DEFAULT_L10_AGENDA } from '@/types/meetings';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { usePermissions } from '@/hooks/usePermissions';

type RunnerAgendaItem = {
  order: number;
  title: string;
  key: 'segue' | 'scorecard' | 'rocks' | 'headlines' | 'todos' | 'issues' | 'conclude' | 'custom' | string;
  durationMin: number;
};

type RunnerIssue = {
  id: string;
  title: string;
  status: 'open' | 'solved';
  priority: number; // lower number = higher priority
};

type RunnerTodo = {
  id: string;
  title: string;
  owner?: string;
  dueDate?: string;
  done: boolean;
};

type RunnerMetric = {
  id: string;
  name: string;
  target?: number;
  value?: number;
};

export default function MeetingsPage() {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [teamFilter, setTeamFilter] = useState('amp-leadership');
  const [isRunnerMode, setIsRunnerMode] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<'Leadership' | 'Department'>('Leadership');
  const [agenda, setAgenda] = useState<RunnerAgendaItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const intervalRef = useRef<number | null>(null);
  const [issues, setIssues] = useState<RunnerIssue[]>([]);
  const [newIssueTitle, setNewIssueTitle] = useState('');
  const [todos, setTodos] = useState<RunnerTodo[]>([]);
  const [newTodoTitle, setNewTodoTitle] = useState('');

  const STORAGE_KEY = 'runway_runner_state_v1';
  const { checkPermission, isAdmin } = usePermissions();
  const [isPresenter, setIsPresenter] = useState<boolean>(false);
  const location = useLocation();
  const { user } = useAuth();
  const [flagScorecardTitle, setFlagScorecardTitle] = useState('');
  const [flagRocksTitle, setFlagRocksTitle] = useState('');
  const [dragIssueId, setDragIssueId] = useState<string | null>(null);
  const [dragOverIssueId, setDragOverIssueId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<RunnerMetric[]>([]);

  // Build agenda from default template
  const defaultAgenda: RunnerAgendaItem[] = useMemo(() => {
    return DEFAULT_L10_AGENDA.map((a) => ({
      order: a.order_num,
      title: a.title,
      key:
        a.type === 'scorecard' ? 'scorecard' :
        a.type === 'rocks' ? 'rocks' :
        a.type === 'headlines' ? 'headlines' :
        a.type === 'todoReview' ? 'todos' :
        a.type === 'issues' ? 'issues' :
        'custom',
      durationMin: a.duration_min || 5,
    }));
  }, []);

  useEffect(() => {
    // On mount, attempt to restore previous runner state
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          isRunnerMode?: boolean;
          currentIndex?: number;
          secondsRemaining?: number;
          issues?: RunnerIssue[];
          todos?: RunnerTodo[];
          metrics?: RunnerMetric[];
        };
        if (saved && saved.isRunnerMode) {
          const idx = Math.max(0, Math.min((saved.currentIndex ?? 0), defaultAgenda.length - 1));
          setAgenda(defaultAgenda);
          setCurrentIndex(idx);
          setSecondsRemaining(saved.secondsRemaining ?? (defaultAgenda[idx]?.durationMin || 5) * 60);
          setIssues(Array.isArray(saved.issues) ? saved.issues : []);
          setTodos(Array.isArray(saved.todos) ? saved.todos : []);
          setMetrics(Array.isArray(saved.metrics) ? saved.metrics : []);
          setIsTimerRunning(false); // Always resume paused
          setIsRunnerMode(true);
          return;
        }
      }
    } catch {
      // ignore restore errors
    }
    // Fresh default state
    setAgenda(defaultAgenda);
  }, [defaultAgenda]);

  // Deep-link: ?section=<order>
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      const sectionParam = params.get('section');
      if (!sectionParam) return;
      const desiredOrder = parseInt(sectionParam, 10);
      if (Number.isNaN(desiredOrder)) return;
      const agendaSource = agenda.length ? agenda : defaultAgenda;
      const idx = Math.max(0, agendaSource.findIndex(a => a.order === desiredOrder));
      const indexToUse = idx === -1 ? 0 : idx;
      setAgenda(agendaSource);
      setCurrentIndex(indexToUse);
      setSecondsRemaining((agendaSource[indexToUse]?.durationMin || 5) * 60);
      setIsRunnerMode(true); // view mode; controls still gated by presenter
      setIsTimerRunning(false);
    } catch {
      // ignore
    }
  }, [location.search, defaultAgenda]);

  // Determine presenter privileges (Operations Manager/Admin etc.)
  useEffect(() => {
    try {
      const allowed = isAdmin || checkPermission('canManageContent');
      setIsPresenter(Boolean(allowed));
    } catch {
      setIsPresenter(false);
    }
  }, [isAdmin, checkPermission]);

  useEffect(() => {
    if (!isRunnerMode) return;
    // Persist state on changes
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          isRunnerMode,
          currentIndex,
          secondsRemaining,
          issues,
          todos,
          metrics,
        })
      );
    } catch {
      // ignore persist errors
    }
  }, [isRunnerMode, currentIndex, secondsRemaining, issues, todos, metrics]);

  useEffect(() => {
    if (!isTimerRunning) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = window.setInterval(() => {
      setSecondsRemaining((s) => {
        if (s <= 1) {
          handleNextSection(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000) as unknown as number;
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isTimerRunning]);

  // Keyboard shortcuts for presenter: Space (play/pause), Left (prev), Right (next), R (reset)
  useEffect(() => {
    if (!isRunnerMode || !isPresenter) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.getAttribute('contenteditable') === 'true')) return;
      if (e.key === ' ') { e.preventDefault(); handleToggleTimer(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); handlePrevSection(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); handleNextSection(); }
      else if (e.key.toLowerCase() === 'r') { e.preventDefault(); handleResetTimer(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isRunnerMode, isPresenter, currentIndex, isTimerRunning, secondsRemaining, agenda]);

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleStartMeeting = () => {
    if (!isPresenter) return;
    // Reset to a fresh meeting run
    setAgenda(defaultAgenda);
    setCurrentIndex(0);
    setSecondsRemaining((defaultAgenda[0]?.durationMin || 5) * 60);
    setIssues([]);
    setTodos([]);
    setIsTimerRunning(false);
    setIsRunnerMode(true);
  };

  const handlePrevSection = () => {
    setIsTimerRunning(false);
    setCurrentIndex((idx) => {
      const next = Math.max(0, idx - 1);
      const dur = agenda[next]?.durationMin || 5;
      setSecondsRemaining(dur * 60);
      return next;
    });
  };

  const handleNextSection = (auto = false) => {
    setIsTimerRunning(false);
    setCurrentIndex((idx) => {
      const next = Math.min(agenda.length - 1, idx + 1);
      const dur = agenda[next]?.durationMin || 5;
      setSecondsRemaining(dur * 60);
      return next;
    });
  };

  const handleResetTimer = () => {
    const dur = agenda[currentIndex]?.durationMin || 5;
    setSecondsRemaining(dur * 60);
    setIsTimerRunning(false);
  };

  const handleToggleTimer = () => {
    setIsTimerRunning((r) => !r);
  };

  const addIssue = () => {
    if (!newIssueTitle.trim()) return;
    setIssues((prev) => [
      ...prev,
      { id: Date.now().toString(), title: newIssueTitle.trim(), status: 'open', priority: prev.length },
    ]);
    setNewIssueTitle('');
  };

  const addIssueFromFlag = (title: string) => {
    const t = title.trim();
    if (!t) return;
    setIssues((prev) => [
      ...prev,
      { id: Date.now().toString(), title: t, status: 'open', priority: prev.length },
    ]);
  };

  const addMetric = () => {
    setMetrics(prev => ([
      ...prev,
      { id: Date.now().toString(), name: `Metric ${prev.length + 1}`, target: undefined, value: undefined }
    ]));
  };

  const updateMetric = (id: string, field: keyof RunnerMetric, value: string) => {
    setMetrics(prev => prev.map(m => (
      m.id === id
        ? {
            ...m,
            [field]: field === 'target' || field === 'value' ? (value === '' ? undefined : Number(value)) : value
          }
        : m
    )));
  };

  const flagMetricToIssues = (metric: RunnerMetric) => {
    const title = metric.name
      ? `Metric Flag: ${metric.name}${metric.value !== undefined ? ` = ${metric.value}` : ''}${metric.target !== undefined ? ` (target ${metric.target})` : ''}`
      : 'Metric Flag';
    addIssueFromFlag(title);
  };

  // Drag & Drop handlers for Issues prioritization
  const handleIssueDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    if (!isPresenter) return;
    setDragIssueId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleIssueDragOver = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    if (!isPresenter) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIssueId !== id) setDragOverIssueId(id);
  };

  const handleIssueDragLeave = () => {
    if (dragOverIssueId) setDragOverIssueId(null);
  };

  const handleIssueDrop = (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
    if (!isPresenter) return;
    e.preventDefault();
    if (!dragIssueId || dragIssueId === targetId) return;
    setIssues(prev => {
      const sourceIdx = prev.findIndex(i => i.id === dragIssueId);
      const targetIdx = prev.findIndex(i => i.id === targetId);
      if (sourceIdx === -1 || targetIdx === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(sourceIdx, 1);
      next.splice(targetIdx, 0, moved);
      return next.map((i, idx) => ({ ...i, priority: idx }));
    });
    setDragIssueId(null);
    setDragOverIssueId(null);
  };

  const handleIssueDragEnd = () => {
    setDragIssueId(null);
    setDragOverIssueId(null);
  };

  const toggleIssueStatus = (id: string) => {
    setIssues((prev) => prev.map((i) => (i.id === id ? { ...i, status: i.status === 'open' ? 'solved' : 'open' } : i)));
  };

  const moveIssue = (id: string, dir: 'up' | 'down') => {
    setIssues((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx === -1) return prev;
      const newArr = [...prev];
      const swapWith = dir === 'up' ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= newArr.length) return prev;
      const tmp = newArr[swapWith];
      newArr[swapWith] = newArr[idx];
      newArr[idx] = tmp;
      return newArr.map((i, index) => ({ ...i, priority: index }));
    });
  };

  const addTodo = () => {
    const titleBefore = newTodoTitle.trim();
    if (!titleBefore) return;
    setTodos((prev) => [
      ...prev,
      { id: Date.now().toString(), title: titleBefore, done: false },
    ]);
    setNewTodoTitle('');

    // Persist to Supabase meeting_todos if logged in
    (async () => {
      try {
        if (!user?.id) return;
        const { data, error } = await supabase
          .schema('neta_ops')
          .from('meeting_todos')
          .insert({
            title: titleBefore,
            user_id: user.id,
            status: 'open'
          })
          .select('id')
          .single();
        if (error) {
          console.error('Error saving meeting todo:', error);
        } else {
          // Optionally map local todo id to db id in localStorage (not strictly required)
        }
      } catch (e) {
        console.error('Unexpected error saving meeting todo:', e);
      }
    })();
  };

  const toggleTodo = (id: string) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const currentItem = agenda[currentIndex];
  const lowTime = secondsRemaining <= 60;

  const buildPrintStyles = () => `
    <style>
      @media print {
        body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
        * { color: black !important; }
        input, select, textarea { 
          background-color: white !important; 
          border: 1px solid black !important; 
          color: black !important;
          padding: 2px !important; 
          font-size: 10px !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
        }
        select { background-image: none !important; padding-right: 8px !important; }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none !important; margin: 0 !important; }
        input[type="number"] { -moz-appearance: textfield !important; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid black !important; padding: 4px !important; }
        th { background-color: #f0f0f0 !important; font-weight: bold !important; }
        button { display: none !important; }
        section { break-inside: avoid !important; margin-bottom: 20px !important; }
        .print\\:break-before-page { page-break-before: always; }
        .print\\:break-after-page { page-break-after: always; }
        .print\\:break-inside-avoid { page-break-inside: avoid; }
        .print\\:text-black { color: black !important; }
        .print\\:bg-white { background-color: white !important; }
        .print\\:border-black { border-color: black !important; }
        .print\\:font-bold { font-weight: bold !important; }
        .print\\:text-center { text-align: center !important; }
      }
      .h1 { font-size: 20px; font-weight: bold; margin: 0 0 8px 0; }
      .h2 { font-size: 16px; font-weight: bold; margin: 16px 0 8px 0; }
      .muted { color: #4b5563; }
      .mb-8 { margin-bottom: 16px; }
      .mb-4 { margin-bottom: 12px; }
      .mt-2 { margin-top: 8px; }
      ul { margin: 0; padding-left: 18px; }
    </style>
  `;

  const buildAgendaPrintHtml = () => {
    const a = agenda.length ? agenda : defaultAgenda;
    const now = new Date().toLocaleString();
    const items = a
      .sort((x, y) => x.order - y.order)
      .map((it) => `<li><strong>${it.order}. ${it.title}</strong> — ${it.durationMin} min</li>`) 
      .join('');
    return `<!doctype html><html><head><meta charset="utf-8" />${buildPrintStyles()}</head><body>
      <div class="h1">Meeting Agenda</div>
      <div class="muted mb-8">Template: ${selectedTemplate} • Team: ${teamFilter} • Generated: ${now}</div>
      <section>
        <div class="h2">Agenda</div>
        <ul>${items}</ul>
      </section>
      <section class="mt-2">
        <div class="h2">Notes</div>
        <div class="muted">Scorecard entries, Rock statuses, To-Dos and Issues will be captured during the meeting.</div>
      </section>
    </body></html>`;
  };

  const openPrintWindow = (html: string) => {
    const w = window.open('', 'print');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  const handlePrintAgenda = () => {
    openPrintWindow(buildAgendaPrintHtml());
  };

  const buildSummary = () => {
    const now = new Date().toLocaleString();
    const solvedIssues = issues.filter(i => i.status === 'solved');
    const openIssues = issues.filter(i => i.status !== 'solved');
    const todoOpen = todos.filter(t => !t.done);
    const todoDone = todos.filter(t => t.done);
    return {
      now,
      solvedIssues,
      openIssues,
      todoOpen,
      todoDone,
      currentSection: currentItem?.title || '',
      template: selectedTemplate,
      team: teamFilter,
    };
  };

  const buildSummaryHtml = () => {
    const s = buildSummary();
    const solved = s.solvedIssues.map((i, idx) => `<li>${idx + 1}. ${i.title}</li>`).join('') || '<li>None</li>';
    const open = s.openIssues.map((i, idx) => `<li>${idx + 1}. ${i.title}</li>`).join('') || '<li>None</li>';
    const tOpen = s.todoOpen.map((t, idx) => `<li>${idx + 1}. ${t.title}</li>`).join('') || '<li>None</li>';
    const tDone = s.todoDone.map((t, idx) => `<li>${idx + 1}. ${t.title}</li>`).join('') || '<li>None</li>';
    return `<!doctype html><html><head><meta charset="utf-8" />${buildPrintStyles()}</head><body>
      <div class="h1">End-of-Meeting Summary</div>
      <div class="muted mb-8">Template: ${s.template} • Team: ${s.team} • Generated: ${s.now}</div>
      <section>
        <div class="h2">Solved Issues</div>
        <ul>${solved}</ul>
      </section>
      <section>
        <div class="h2">Unresolved Issues</div>
        <ul>${open}</ul>
      </section>
      <section>
        <div class="h2">To-Dos Created (Open)</div>
        <ul>${tOpen}</ul>
      </section>
      <section>
        <div class="h2">Completed During Meeting</div>
        <ul>${tDone}</ul>
      </section>
    </body></html>`;
  };

  const handlePrintSummary = () => {
    openPrintWindow(buildSummaryHtml());
  };

  const handleDownloadSummary = () => {
    const s = buildSummary();
    const data = {
      generatedAt: s.now,
      team: s.team,
      template: s.template,
      currentSection: s.currentSection,
      solvedIssues: s.solvedIssues.map(i => i.title),
      openIssues: s.openIssues.map(i => i.title),
      todoOpen: s.todoOpen.map(t => t.title),
      todoDone: s.todoDone.map(t => t.title),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-summary-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Meetings
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Improve alignment and transparency across your organization.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {!isRunnerMode && (
                <>
                  <select
                    value={selectedTemplate}
                    onChange={(e) => setSelectedTemplate(e.target.value as any)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="Leadership">Leadership (Level 10)</option>
                    <option value="Department">Department Weekly</option>
                  </select>
                  <Button onClick={handleStartMeeting} disabled={!isPresenter} className={`bg-[#f26722] hover:bg-[#e55611] text-white ${!isPresenter ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <Play className="h-4 w-4 mr-2" />
                    Start Meeting
                  </Button>
                </>
              )}
              <Button onClick={handlePrintAgenda} variant="outline" className="border-[#f26722] text-[#f26722] hover:bg-[#f26722] hover:text-white">
                <Printer className="h-4 w-4 mr-2" />
                Print Meeting Agenda
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs and Controls */}
        {!isRunnerMode && (
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-6">
              {/* Tabs */}
              <div className="flex space-x-1">
                <button
                  onClick={() => setActiveTab('upcoming')}
                  className={`px-4 py-2 font-medium transition-colors relative ${
                    activeTab === 'upcoming'
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Upcoming
                  {activeTab === 'upcoming' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#f26722]"></div>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('past')}
                  className={`px-4 py-2 font-medium transition-colors relative ${
                    activeTab === 'past'
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Past Meetings
                  {activeTab === 'past' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#f26722]"></div>
                  )}
                </button>
              </div>

              {/* Team Filter */}
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
            </div>
          </div>
        )}

        {!isRunnerMode ? (
          <>
            {/* Main Banner */}
            <div className="relative mb-8 rounded-lg overflow-hidden">
              <div 
                className="h-64 bg-cover bg-center bg-blend-overlay"
                style={{
                  backgroundImage: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400"><rect fill="%23f3f4f6" width="1200" height="400"/><rect fill="%23e5e7eb" x="200" y="100" width="300" height="200" rx="10"/><rect fill="%23d1d5db" x="600" y="150" width="100" height="100" rx="50"/><rect fill="%23e5e7eb" x="800" y="120" width="200" height="160" rx="5"/></svg>')`,
                  backgroundColor: 'rgba(243, 244, 246, 0.8)'
                }}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
                      AMP Leadership
                    </h2>
                    <h3 className="text-3xl font-bold text-gray-900 dark:text-white">
                      No Meetings in progress
                    </h3>
                  </div>
                </div>
              </div>
            </div>

            {/* Upcoming Meetings Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg">Upcoming Meetings</CardTitle>
                  <Info className="h-4 w-4 text-gray-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                    <div className="w-8 h-8 bg-gray-400 dark:bg-gray-500 rounded-full flex items-center justify-center">
                      <div className="flex space-x-1">
                        <div className="w-1 h-1 bg-gray-600 dark:bg-gray-300 rounded-full"></div>
                        <div className="w-1 h-1 bg-gray-600 dark:bg-gray-300 rounded-full"></div>
                        <div className="w-1 h-1 bg-gray-600 dark:bg-gray-300 rounded-full"></div>
                      </div>
                    </div>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    Your team hasn't created any scheduled Meetings yet.
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    Scheduled Meetings are a great way to keep your team aligned.
                  </p>
                  <a 
                    href="#" 
                    className="text-[#f26722] hover:text-[#e55611] font-medium"
                  >
                    Learn more about Scheduled Meetings
                  </a>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          // Runner Mode
          <div className="space-y-6">
            {/* Runner Controls */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <TimerIcon className={`h-5 w-5 ${lowTime ? 'text-red-500' : 'text-gray-400'}`} />
                    <CardTitle className="text-lg">
                      {currentItem?.order}. {currentItem?.title}
                    </CardTitle>
                    <span className={`text-sm px-2 py-1 rounded ${lowTime ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                      {formatTime(secondsRemaining)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handlePrevSection} disabled={!isPresenter}>
                      <SkipBack className="h-4 w-4" />
                    </Button>
                    <Button onClick={handleToggleTimer} disabled={!isPresenter} className={`bg-[#f26722] hover:bg-[#e55611] text-white ${!isPresenter ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      {isTimerRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button variant="outline" onClick={handleResetTimer} disabled={!isPresenter}>
                      Reset
                    </Button>
                    <Button variant="outline" onClick={() => handleNextSection()} disabled={!isPresenter}>
                      <SkipForward className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Section-specific quick inputs */}
                {currentItem?.key === 'scorecard' && (
                  <div className="space-y-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Enter weekly metrics here (UI placeholder). Flag issues below to discuss in IDS.
                    </div>
                    {/* Metrics Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2 text-sm text-gray-500 dark:text-gray-400">Metric</th>
                            <th className="text-left p-2 text-sm text-gray-500 dark:text-gray-400">Target</th>
                            <th className="text-left p-2 text-sm text-gray-500 dark:text-gray-400">Value</th>
                            <th className="text-left p-2 text-sm text-gray-500 dark:text-gray-400"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {metrics.length === 0 && (
                            <tr>
                              <td colSpan={4} className="p-3 text-sm text-gray-500 dark:text-gray-400">No metrics yet.</td>
                            </tr>
                          )}
                          {metrics.map(metric => (
                            <tr key={metric.id} className="border-b">
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={metric.name}
                                  onChange={(e) => updateMetric(metric.id, 'name', e.target.value)}
                                  disabled={!isPresenter}
                                  className={`w-full p-2 border rounded text-sm ${!isPresenter ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
                                  placeholder="Metric name"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="number"
                                  value={metric.target ?? ''}
                                  onChange={(e) => updateMetric(metric.id, 'target', e.target.value)}
                                  disabled={!isPresenter}
                                  className={`w-28 p-2 border rounded text-sm ${!isPresenter ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
                                  placeholder="—"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="number"
                                  value={metric.value ?? ''}
                                  onChange={(e) => updateMetric(metric.id, 'value', e.target.value)}
                                  disabled={!isPresenter}
                                  className={`w-28 p-2 border rounded text-sm ${!isPresenter ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
                                  placeholder="—"
                                />
                              </td>
                              <td className="p-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => flagMetricToIssues(metric)}
                                >
                                  <Flag className="h-4 w-4 mr-1" /> Flag
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div>
                      <Button onClick={addMetric} disabled={!isPresenter} className={`${!isPresenter ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <Plus className="h-4 w-4 mr-2" /> Add Metric
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={flagScorecardTitle}
                        onChange={(e) => setFlagScorecardTitle(e.target.value)}
                        placeholder="Flag to Issues... e.g. KPI Breach: On-time delivery"
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { addIssueFromFlag(flagScorecardTitle); setFlagScorecardTitle(''); }
                        }}
                      />
                      <Button onClick={() => { addIssueFromFlag(flagScorecardTitle); setFlagScorecardTitle(''); }}>
                        <Flag className="h-4 w-4 mr-2" />
                        Flag to Issues
                      </Button>
                    </div>
                  </div>
                )}
                {currentItem?.key === 'rocks' && (
                  <div className="space-y-3">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Review rock statuses (UI placeholder). Flag off-track items to IDS.
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={flagRocksTitle}
                        onChange={(e) => setFlagRocksTitle(e.target.value)}
                        placeholder="Flag to Issues... e.g. Rock Off-Track: Hiring Plan"
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { addIssueFromFlag(flagRocksTitle); setFlagRocksTitle(''); }
                        }}
                      />
                      <Button onClick={() => { addIssueFromFlag(flagRocksTitle); setFlagRocksTitle(''); }}>
                        <Flag className="h-4 w-4 mr-2" />
                        Flag to Issues
                      </Button>
                    </div>
                  </div>
                )}
                {currentItem?.key === 'todos' && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newTodoTitle}
                        onChange={(e) => setNewTodoTitle(e.target.value)}
                        placeholder="Quick add To-Do..."
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        onKeyDown={(e) => e.key === 'Enter' && addTodo()}
                      />
                      <Button onClick={addTodo}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {todos.length === 0 && (
                        <div className="text-sm text-gray-500 dark:text-gray-400">No To-Dos yet.</div>
                      )}
                      {todos.map((t) => (
                        <div key={t.id} className="flex items-center gap-2 p-2 rounded border border-gray-200 dark:border-gray-700">
                          <button
                            onClick={() => toggleTodo(t.id)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center ${t.done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 dark:border-gray-600'}`}
                          >
                            {t.done && <Check className="h-3 w-3" />}
                          </button>
                          <span className={`flex-1 text-sm ${t.done ? 'line-through text-gray-500' : 'text-gray-900 dark:text-white'}`}>{t.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {currentItem?.key === 'issues' && (
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Discuss top 3 prioritized issues below.
                  </div>
                )}
                {/* Conclude (Baggage Claim) */}
                {currentItem?.key === 'custom' && /conclude/i.test(currentItem?.title || '') && (
                  <div className="space-y-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Baggage Claim: review decisions, To-Dos, and unresolved issues. Generate a summary below.
                    </div>
                    <div className="flex items-center gap-2">
                      <Button onClick={handlePrintSummary} className="bg-[#f26722] hover:bg-[#e55611] text-white">
                        <Printer className="h-4 w-4 mr-2" />
                        Print Summary
                      </Button>
                      <Button onClick={handleDownloadSummary} variant="outline">
                        <Download className="h-4 w-4 mr-2" />
                        Download Summary
                      </Button>
                    </div>
                    <div className="text-sm">
                      <div className="font-medium mb-2">Preview</div>
                      <ul className="list-disc ml-5 text-gray-700 dark:text-gray-300">
                        <li>Solved Issues: {issues.filter(i=>i.status==='solved').length}</li>
                        <li>Open Issues: {issues.filter(i=>i.status!=='solved').length}</li>
                        <li>Open To-Dos: {todos.filter(t=>!t.done).length}</li>
                        <li>Completed To-Dos: {todos.filter(t=>t.done).length}</li>
                      </ul>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Issues Queue */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flag className="h-4 w-4 text-gray-400" />
                    <CardTitle className="text-lg">Issues Queue</CardTitle>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newIssueTitle}
                        onChange={(e) => setNewIssueTitle(e.target.value)}
                        placeholder="Add issue..."
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        onKeyDown={(e) => e.key === 'Enter' && addIssue()}
                      />
                      <Button onClick={addIssue}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {issues.length === 0 && (
                    <div className="text-sm text-gray-500 dark:text-gray-400">No issues yet. Add from sections or here.</div>
                  )}
                  {issues.map((issue, idx) => (
                    <div
                      key={issue.id}
                      className={`flex items-center gap-2 p-2 border border-gray-200 dark:border-gray-700 rounded ${dragIssueId === issue.id ? 'opacity-60' : ''} ${dragOverIssueId === issue.id ? 'ring-2 ring-orange-500 ring-opacity-50' : ''}`}
                      draggable={isPresenter}
                      onDragStart={(e) => handleIssueDragStart(e, issue.id)}
                      onDragOver={(e) => handleIssueDragOver(e, issue.id)}
                      onDragLeave={handleIssueDragLeave}
                      onDrop={(e) => handleIssueDrop(e, issue.id)}
                      onDragEnd={handleIssueDragEnd}
                    >
                      <span className="w-6 text-sm text-gray-400">{idx + 1}</span>
                      <span className={`flex-1 text-sm ${issue.status === 'solved' ? 'line-through text-gray-500' : 'text-gray-900 dark:text-white'}`}>{issue.title}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant={issue.status === 'solved' ? 'outline' : 'default'}
                          size="sm"
                          className={issue.status === 'solved' ? '' : 'bg-green-600 hover:bg-green-700 text-white'}
                          onClick={() => toggleIssueStatus(issue.id)}
                        >
                          {issue.status === 'solved' ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-3">Drag to reorder. Discuss top 3 first.</div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
