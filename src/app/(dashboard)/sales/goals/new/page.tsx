import React from "react";
import { Link } from "react-router-dom";
import { GoalForm } from "../../../../../components/goals/GoalForm";
import { ChevronLeft } from "lucide-react";

export default function NewGoalPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          to="/sales/goals"
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-white dark:hover:text-zinc-300 flex items-center"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Goals
        </Link>
      </div>

      <div className="bg-white dark:bg-dark-150 rounded-lg shadow-sm p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
            Create New Goal
          </h1>
          <p className="text-zinc-500 dark:text-white mt-1">
            Set up a new sales goal, target, or objective
          </p>
        </div>

        <GoalForm />
      </div>
    </div>
  );
}
