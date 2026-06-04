import React, { useState, useEffect } from 'react';
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { FileBarChart, Download, Loader2, Users, PieChart, Shield, BarChart3, ArrowRight, UserCheck, UserX } from 'lucide-react';
import { eeoComplianceService, EeoAggregation, EeoPipelineSummary } from '../../../services/hr/eeoComplianceService';
import { toast } from '../../../components/ui/toast';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export const EeoReporting: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [aggregations, setAggregations] = useState<EeoAggregation[]>([]);
  const [overallSummary, setOverallSummary] = useState<Awaited<ReturnType<typeof eeoComplianceService.getOverallSummary>> | null>(null);
  const [pipeline, setPipeline] = useState<EeoPipelineSummary[]>([]);
  const [filterPosition, setFilterPosition] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [agg, summary, pipe] = await Promise.all([
        eeoComplianceService.getAggregatedByPosition(),
        eeoComplianceService.getOverallSummary(),
        eeoComplianceService.getPipelineBreakdown(filterPosition),
      ]);
      setAggregations(agg);
      setOverallSummary(summary);
      setPipeline(pipe);
    } catch (e: any) {
      console.error(e);
      toast({
        title: 'Error',
        description: e?.message || 'Failed to load EEO compliance data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    eeoComplianceService.getPipelineBreakdown(filterPosition).then(setPipeline).catch(() => {});
  }, [filterPosition]);

  const positionOptions = [
    { value: 'all', label: 'All Positions' },
    ...aggregations.map(a => ({ value: a.position_title, label: a.position_title })),
  ];

  const filteredAggregations = filterPosition === 'all'
    ? aggregations
    : aggregations.filter(a => a.position_title === filterPosition);

  const displaySummary = filterPosition === 'all'
    ? overallSummary
    : (() => {
        const agg = filteredAggregations[0];
        if (!agg) return null;
        const pct = (n: number) => agg.total > 0 ? Math.round((n / agg.total) * 100) : 0;
        return {
          total: agg.total,
          genderBreakdown: agg.genderBreakdown,
          genderPercent: Object.fromEntries(Object.entries(agg.genderBreakdown).map(([k, v]) => [k, pct(v)])),
          raceBreakdown: agg.raceBreakdown,
          racePercent: Object.fromEntries(Object.entries(agg.raceBreakdown).map(([k, v]) => [k, pct(v)])),
          veteranCount: agg.veteranCount,
          veteranPercent: pct(agg.veteranCount),
          disabilityCount: agg.disabilityCount,
          disabilityPercent: pct(agg.disabilityCount),
        };
      })();

  const handleExport = async () => {
    try {
      const submissions = await eeoComplianceService.getAll();
      const headers = ['Position', 'Department', 'Gender', 'Race', 'Veteran', 'Disability', 'Candidate Status', 'Submitted'];
      const csvRows = submissions.map(s =>
        [
          s.position_title,
          s.department || '',
          s.gender || '',
          s.race || '',
          s.veteran ? 'Yes' : 'No',
          s.disability ? 'Yes' : 'No',
          s.candidate_status || '',
          s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : '',
        ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
      );
      const csv = [headers.join(','), ...csvRows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `eeo-compliance-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast({ title: 'Exported', description: 'Anonymized EEO compliance CSV downloaded.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Export failed', variant: 'destructive' });
    }
  };

  const PercentBar: React.FC<{ label: string; count: number; percent: number; color: string }> = ({ label, count, percent, color }) => (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-700 dark:text-gray-300">{label}</span>
        <span className="font-medium text-gray-900 dark:text-white">{count} ({percent}%)</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
        <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${Math.max(percent, 2)}%` }} />
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#f26722]" />
          <div className="flex justify-center py-6"><LoadingSpinner size="md" /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <Shield className="h-8 w-8 text-[#f26722]" />
            EEO Compliance Reporting
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Anonymized applicant demographics by position. No identifying information is stored or displayed.
          </p>
        </div>
        <div className="flex gap-2">
          <Select
            name="filterPosition"
            value={filterPosition}
            onChange={(e) => setFilterPosition(e.target.value)}
            options={positionOptions}
          />
          <Button variant="outline" onClick={handleExport} disabled={!overallSummary || overallSummary.total === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {!displaySummary || displaySummary.total === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <FileBarChart className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">No EEO data yet</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                EEO data is collected during the application process and stored anonymously here.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Total Submissions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{displaySummary.total}</div>
                <p className="text-xs text-muted-foreground">anonymous EEO records</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <PieChart className="h-4 w-4" />
                  Positions Tracked
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{aggregations.length}</div>
                <p className="text-xs text-muted-foreground">unique positions with EEO data</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Veterans</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{displaySummary.veteranCount}</div>
                <p className="text-xs text-muted-foreground">{displaySummary.veteranPercent}% of applicants</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Disability</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{displaySummary.disabilityCount}</div>
                <p className="text-xs text-muted-foreground">{displaySummary.disabilityPercent}% of applicants</p>
              </CardContent>
            </Card>
          </div>

          {/* Pipeline Breakdown: Applied → Rejected → Hired */}
          {pipeline.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ArrowRight className="h-4 w-4" />
                  Pipeline Breakdown
                </CardTitle>
                <CardDescription>
                  Demographics by hiring stage — see how representation changes from application through hire
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {pipeline.map((stage) => {
                    const stageIcon = stage.stage === 'hired'
                      ? <UserCheck className="h-5 w-5 text-green-600" />
                      : stage.stage === 'rejected'
                      ? <UserX className="h-5 w-5 text-red-500" />
                      : <Users className="h-5 w-5 text-blue-600" />;
                    const stageBorder = stage.stage === 'hired'
                      ? 'border-green-200 dark:border-green-800'
                      : stage.stage === 'rejected'
                      ? 'border-red-200 dark:border-red-800'
                      : 'border-blue-200 dark:border-blue-800';
                    const stageBg = stage.stage === 'hired'
                      ? 'bg-green-50 dark:bg-green-900/20'
                      : stage.stage === 'rejected'
                      ? 'bg-red-50 dark:bg-red-900/20'
                      : 'bg-blue-50 dark:bg-blue-900/20';

                    return (
                      <div key={stage.stage} className={`rounded-lg border-2 ${stageBorder} p-4 ${stageBg}`}>
                        <div className="flex items-center gap-2 mb-3">
                          {stageIcon}
                          <h4 className="font-semibold text-gray-900 dark:text-white">{stage.label}</h4>
                          <span className="ml-auto text-lg font-bold text-gray-900 dark:text-white">{stage.total}</span>
                        </div>

                        {stage.total > 0 ? (
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Gender</p>
                              <div className="space-y-1">
                                {Object.entries(stage.genderBreakdown).sort((a, b) => b[1] - a[1]).map(([label, count]) => (
                                  <div key={label} className="flex justify-between text-sm">
                                    <span className="text-gray-700 dark:text-gray-300">{label}</span>
                                    <span className="font-medium">{count} ({stage.genderPercent[label] || 0}%)</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Race / Ethnicity</p>
                              <div className="space-y-1">
                                {Object.entries(stage.raceBreakdown).sort((a, b) => b[1] - a[1]).map(([label, count]) => (
                                  <div key={label} className="flex justify-between text-sm">
                                    <span className="text-gray-700 dark:text-gray-300">{label}</span>
                                    <span className="font-medium">{count} ({stage.racePercent[label] || 0}%)</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="flex gap-4 text-sm pt-1 border-t border-gray-200 dark:border-gray-700">
                              <span className="text-gray-700 dark:text-gray-300">
                                Veterans: <strong>{stage.veteranCount}</strong> ({stage.veteranPercent}%)
                              </span>
                              <span className="text-gray-700 dark:text-gray-300">
                                Disability: <strong>{stage.disabilityCount}</strong> ({stage.disabilityPercent}%)
                              </span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400 italic">No data for this stage</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Gender Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Gender Breakdown
              </CardTitle>
              <CardDescription>Applicant self-identification</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-w-xl">
                {Object.entries(displaySummary.genderBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([label, count], idx) => (
                    <PercentBar
                      key={label}
                      label={label}
                      count={count}
                      percent={displaySummary.genderPercent[label] || 0}
                      color={['bg-blue-500', 'bg-pink-500', 'bg-purple-500', 'bg-gray-400'][idx % 4]}
                    />
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* Race Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Race / Ethnicity Breakdown
              </CardTitle>
              <CardDescription>Applicant self-identification for EEO-1 reporting</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-w-xl">
                {Object.entries(displaySummary.raceBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([label, count], idx) => (
                    <PercentBar
                      key={label}
                      label={label}
                      count={count}
                      percent={displaySummary.racePercent[label] || 0}
                      color={['bg-emerald-500', 'bg-amber-500', 'bg-cyan-500', 'bg-rose-500', 'bg-indigo-500', 'bg-lime-500', 'bg-gray-400'][idx % 7]}
                    />
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* Per-position breakdown */}
          {filteredAggregations.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">By Position</CardTitle>
                <CardDescription>Aggregated demographics per open requisition</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Position</th>
                        <th className="text-left p-3 font-medium">Dept</th>
                        <th className="text-right p-3 font-medium">Total</th>
                        <th className="text-left p-3 font-medium">Gender Split</th>
                        <th className="text-left p-3 font-medium">Race Split</th>
                        <th className="text-right p-3 font-medium">Veteran</th>
                        <th className="text-right p-3 font-medium">Disability</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAggregations
                        .sort((a, b) => b.total - a.total)
                        .map((agg) => {
                          const topGender = Object.entries(agg.genderBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 2);
                          const topRace = Object.entries(agg.raceBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 2);
                          const pct = (n: number) => agg.total > 0 ? Math.round((n / agg.total) * 100) : 0;
                          return (
                            <tr key={agg.position_title} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="p-3 font-medium">{agg.position_title}</td>
                              <td className="p-3 text-muted-foreground">{agg.department || '—'}</td>
                              <td className="p-3 text-right font-medium">{agg.total}</td>
                              <td className="p-3 text-muted-foreground">
                                {topGender.map(([g, c]) => `${g} ${pct(c)}%`).join(', ')}
                              </td>
                              <td className="p-3 text-muted-foreground">
                                {topRace.map(([r, c]) => `${r} ${pct(c)}%`).join(', ')}
                              </td>
                              <td className="p-3 text-right">{agg.veteranCount} ({pct(agg.veteranCount)}%)</td>
                              <td className="p-3 text-right">{agg.disabilityCount} ({pct(agg.disabilityCount)}%)</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
