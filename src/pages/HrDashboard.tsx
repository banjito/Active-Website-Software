import React from 'react';
import { Link } from 'react-router-dom';
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Users, Briefcase, UserPlus, Clock, Award, BarChart3, ClipboardList, BookOpen } from 'lucide-react';

export const HrDashboard: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-neutral-900 dark:text-white">HR Dashboard</h1>
        <Link to="/hr/handbook">
          <Button
            leftIcon={<BookOpen className="h-4 w-4" />}
            className="bg-brand text-white hover:!bg-[#f5834a] hover:!text-white"
          >
            Employee Handbook
          </Button>
        </Link>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-row items-center gap-2">
              <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <CardTitle className="text-sm font-medium leading-none">Active Employees</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-row items-center gap-2">
              <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <CardTitle className="text-sm font-medium leading-none">Open Positions</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-row items-center gap-2">
              <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <CardTitle className="text-sm font-medium leading-none">New Hires</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-row items-center gap-2">
              <Award className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <CardTitle className="text-sm font-medium leading-none">Pending Reviews</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="flex flex-row items-center gap-2">
              <Briefcase className="h-5 w-5 shrink-0 text-brand" aria-hidden />
              <CardTitle className="leading-none">Recruiting</CardTitle>
            </div>
            <CardDescription>
              Manage requisitions, candidates, and hiring.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="flex flex-row items-center gap-2">
              <ClipboardList className="h-5 w-5 shrink-0 text-brand" aria-hidden />
              <CardTitle className="leading-none">Onboarding</CardTitle>
            </div>
            <CardDescription>
              New hire packets, checklists, and welcome communications.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="flex flex-row items-center gap-2">
              <Users className="h-5 w-5 shrink-0 text-brand" aria-hidden />
              <CardTitle className="leading-none">Employee Data</CardTitle>
            </div>
            <CardDescription>
              Employee profiles, job history, and organizational charts.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="flex flex-row items-center gap-2">
              <Clock className="h-5 w-5 shrink-0 text-brand" aria-hidden />
              <CardTitle className="leading-none">Time & Attendance</CardTitle>
            </div>
            <CardDescription>
              PTO tracking, leave management, and timesheet approvals.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="flex flex-row items-center gap-2">
              <Award className="h-5 w-5 shrink-0 text-brand" aria-hidden />
              <CardTitle className="leading-none">Performance Reviews</CardTitle>
            </div>
            <CardDescription>
              Review cycles, goals, and feedback management.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="flex flex-row items-center gap-2">
              <BarChart3 className="h-5 w-5 shrink-0 text-brand" aria-hidden />
              <CardTitle className="leading-none">Analytics</CardTitle>
            </div>
            <CardDescription>
              HR dashboards, custom reports, and data exports.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
};
