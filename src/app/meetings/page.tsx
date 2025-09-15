import React, { useState } from 'react';
import { Button } from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Printer, Info } from 'lucide-react';

export default function MeetingsPage() {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [teamFilter, setTeamFilter] = useState('amp-leadership');

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Meetings
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Improve alignment and transparency across your organization.
          </p>
        </div>

        {/* Tabs and Controls */}
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

          {/* Print Button */}
          <Button variant="outline" className="border-[#f26722] text-[#f26722] hover:bg-[#f26722] hover:text-white">
            <Printer className="h-4 w-4 mr-2" />
            Print Meeting Agenda
          </Button>
        </div>

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
      </div>
    </div>
  );
}
