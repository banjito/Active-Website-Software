import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/Card";
import { Badge } from "../../components/ui";
import { Plus, TrendingUp, Users, DollarSign, Calendar } from "lucide-react";

import { useAuth } from "../../lib/AuthContext";

import BidsOverview from "../../components/sales/BidsOverview";
import DailyReport from "../../components/sales/DailyReport";
import InteractionsFeed from "../../components/sales/InteractionsFeed";

export default function SalesDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <main className="flex-1 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Daily Report */}
      <div className="mb-8">
        <DailyReport />
      </div>

      {/* Bids Overview (Weekly Bids) */}
      <div className="mb-8">
        <BidsOverview />
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-900">
            Quick Actions
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-6">
          <Card
            className="border border-gray-200 dark:border-dark-200 dark:bg-dark-150 cursor-pointer hover:border-[#f26722] dark:hover:border-amp-orange-600 transition-colors"
            onClick={() => navigate("/sales-dashboard/opportunities")}
          >
            <CardHeader className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-full bg-emerald-50 dark:bg-emerald-900/50">
                  <TrendingUp className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
                </div>
                <div>
                  <CardTitle className="text-base font-medium text-gray-900 dark:text-dark-900">
                    View Opportunities
                  </CardTitle>
                  <CardDescription className="text-sm text-gray-500 dark:text-dark-400">
                    Manage your sales pipeline
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card
            className="border border-gray-200 dark:border-dark-200 dark:bg-dark-150 cursor-pointer hover:border-[#f26722] dark:hover:border-amp-orange-600 transition-colors"
            onClick={() => navigate("/sales-dashboard/customers")}
          >
            <CardHeader className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-full bg-blue-50 dark:bg-blue-900/50">
                  <Users className="h-5 w-5 text-blue-500 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-base font-medium text-gray-900 dark:text-dark-900">
                    Manage Customers
                  </CardTitle>
                  <CardDescription className="text-sm text-gray-500 dark:text-dark-400">
                    View and edit customer data
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card
            className="border border-gray-200 dark:border-dark-200 dark:bg-dark-150 cursor-pointer hover:border-[#f26722] dark:hover:border-amp-orange-600 transition-colors"
            onClick={() => navigate("/sales-dashboard/contacts")}
          >
            <CardHeader className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-full bg-rose-50 dark:bg-rose-900/50">
                  <Users className="h-5 w-5 text-rose-500 dark:text-rose-400" />
                </div>
                <div>
                  <CardTitle className="text-base font-medium text-gray-900 dark:text-dark-900">
                    Manage Contacts
                  </CardTitle>
                  <CardDescription className="text-sm text-gray-500 dark:text-dark-400">
                    View and edit contact information
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </div>
      </div>

      {/* Interactions Feed */}
      <div className="mb-8">
        <InteractionsFeed />
      </div>
    </main>
  );
}
