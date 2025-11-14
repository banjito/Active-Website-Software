import React, { useState } from 'react';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { 
  RefreshCw,
  TrendingUp,
  FileText,
  Archive
} from 'lucide-react';

const VisionPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'vision' | 'goals' | 'long-term-issues' | 'swot'>('vision');
  const [teamFilter, setTeamFilter] = useState('amp-leadership');

  const tabs = [
    { id: 'vision', label: 'Vision' },
    { id: 'goals', label: 'Goals' },
    { id: 'long-term-issues', label: 'Long-Term Issues' },
    { id: 'swot', label: 'SWOT' },
  ];

  const coreValues = [
    {
      title: 'Poise',
      description: 'Being totally balanced in mind, body(physical/financial), and spirit(keeping our mission from God part of our daily focus).'
    },
    {
      title: 'Diligence',
      description: 'Being totally balanced in mind, body(physical/financial), and spirit(keeping our mission from God part of our daily focus).'
    },
    {
      title: 'Attentiveness',
      description: 'Showing the worth of a person or task by giving our undivided concentration.'
    },
    {
      title: 'Commitment',
      description: 'Devoting ourselves to following up on our words (promises, pledges, or vows) with action.'
    },
    {
      title: 'Creativity',
      description: 'Approaching a need, a task or an idea from a new perspective.'
    },
    {
      title: 'Dependability',
      description: 'Fulfilling what we consented to do even if it means unexpected sacrifice.'
    }
  ];

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Vision
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Communicate and share your Vision at a company, departmental, and individual level.
          </p>
        </div>

        {/* Main Navigation Tabs */}
        <div className="flex space-x-1 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 font-medium transition-colors relative ${
                activeTab === tab.id
                  ? 'text-gray-900 dark:text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#f26722]"></div>
              )}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mb-6">
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

            <Button variant="outline" size="sm">
              <Archive className="h-4 w-4 mr-2" />
              Archive
            </Button>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm">
              <TrendingUp className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm">
              <FileText className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Main Content */}
        {activeTab === 'vision' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Core Values */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl font-bold text-gray-900 dark:text-white">
                    Core Values
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {coreValues.map((value, index) => (
                      <div key={index} className="border-b border-gray-200 dark:border-gray-700 pb-4 last:border-b-0">
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                          {value.title}
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                          {value.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Purpose/Cause/Passion */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl font-bold text-gray-900 dark:text-white">
                    Purpose/Cause/Passion
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                    To further the Gospel, while sustaining exceptional employment while providing quality services to the energy industry.
                  </p>
                </CardContent>
              </Card>

              {/* Niche */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl font-bold text-gray-900 dark:text-white">
                    NICHE
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                    Ancillary services to the energy industry.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Right Column */}
            <div>
              {/* Go to Market Strategy */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl font-bold text-gray-900 dark:text-white">
                    Go to Market Strategy
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* Target Market */}
                    <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                        Target Market
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                        Power customers who value reliability and a partnering relationship
                      </p>
                    </div>

                    {/* Three Uniques */}
                    <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                        Three Uniques
                      </h3>
                      <div className="text-gray-500 dark:text-gray-500 text-sm italic">
                        (Content area is blank)
                      </div>
                    </div>

                    {/* Proven Process */}
                    <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                        Proven Process
                      </h3>
                      <div className="text-gray-500 dark:text-gray-500 text-sm italic">
                        (Content area is blank)
                      </div>
                    </div>

                    {/* Guarantee */}
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                        Guarantee
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                        The report is our product. Customers will have their reports within 7 days. If we ever fall short of our core values, we ask that you please notify us so we can do everything in our power to correct the problem
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Other Tabs Content */}
        {activeTab === 'goals' && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-gray-500 dark:text-gray-400">
                Goals content will be implemented here.
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'long-term-issues' && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-gray-500 dark:text-gray-400">
                Long-Term Issues content will be implemented here.
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'swot' && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-gray-500 dark:text-gray-400">
                SWOT analysis content will be implemented here.
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default VisionPage;
