import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Calendar, Plus, Users, Clock, FileText, Settings } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';

export default function MeetingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Load meetings from database
    setLoading(false);
  }, []);

  const handleCreateMeeting = () => {
    // TODO: Navigate to create meeting page
    console.log('Create new meeting');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-200">
      {/* Header */}
      <div className="bg-white dark:bg-dark-150 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/20">
                <Calendar className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Meetings Portal</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Schedule and manage team meetings</p>
              </div>
            </div>
            <Button
              onClick={handleCreateMeeting}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md inline-flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>New Meeting</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upcoming Meetings */}
          <div className="lg:col-span-2">
            <Card className="border border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center space-x-2">
                  <Clock className="h-5 w-5 text-purple-600" />
                  <span>Upcoming Meetings</span>
                </CardTitle>
                <CardDescription className="text-gray-500 dark:text-gray-400">
                  Your scheduled meetings and events
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
                    <p className="mt-2 text-gray-500 dark:text-gray-400">Loading meetings...</p>
                  </div>
                ) : meetings.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No meetings scheduled</h3>
                    <p className="text-gray-500 dark:text-gray-400 mb-4">Get started by creating your first meeting</p>
                    <Button
                      onClick={handleCreateMeeting}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      Create Meeting
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Meeting items would go here */}
                    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-gray-900 dark:text-white">Sample Meeting</h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400">Today at 2:00 PM</p>
                        </div>
                        <Button variant="outline" size="sm">
                          Join
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <div className="space-y-6">
            <Card className="border border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  onClick={handleCreateMeeting}
                  className="w-full justify-start bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Schedule Meeting
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => console.log('View calendar')}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  View Calendar
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => console.log('Meeting templates')}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Meeting Templates
                </Button>
              </CardContent>
            </Card>

            <Card className="border border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">Team Stats</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Total Meetings</span>
                    <span className="font-medium text-gray-900 dark:text-white">0</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">This Month</span>
                    <span className="font-medium text-gray-900 dark:text-white">0</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Team Members</span>
                    <span className="font-medium text-gray-900 dark:text-white">1</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
