/**
 * Custom Forms home page (/custom-forms)
 *
 * The way in to the custom forms tools, plus the most recently edited templates.
 */

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { FileText, PenLine, Puzzle, Table2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { fetchActiveTemplates } from "@/lib/customForms/templateActions";

const RECENT_COUNT = 5;

const TOOLS = [
  {
    title: "Templates",
    description: "See, edit, preview and publish your form templates.",
    path: "/custom-forms/templates",
    Icon: FileText,
  },
  {
    title: "Form Builder",
    description: "Start a new form from a blank page.",
    path: "/custom-forms/builder",
    Icon: PenLine,
  },
  {
    title: "Components",
    description: "Edit the reusable tables and sections forms are built from.",
    path: "/custom-forms/components",
    Icon: Puzzle,
  },
  {
    title: "Lookup Tables",
    description: "Manage shared tables, like NETA criteria, that formulas can read.",
    path: "/custom-forms/lookups",
    Icon: Table2,
  },
];

export const CustomFormsHome: React.FC = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setTemplates(await fetchActiveTemplates());
      } catch (error) {
        console.error("Error loading templates:", error);
        toast.error("Failed to load templates");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const publishedCount = templates.filter((t) => t.is_published).length;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-dark-200 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Custom Forms</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Build the forms your technicians fill out on jobs.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {TOOLS.map(({ title, description, path, Icon }) => (
            <button
              key={path}
              type="button"
              onClick={() => navigate(path)}
              className="text-left p-4 rounded-none border border-neutral-200 dark:border-dark-100 bg-white dark:bg-dark-150 hover:border-brand dark:hover:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <Icon className="w-5 h-5 mb-2 text-brand" />
              <span className="block font-medium text-neutral-900 dark:text-white">{title}</span>
              <span className="block mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                {description}
              </span>
            </button>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recently edited</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <LoadingSpinner />
            ) : templates.length === 0 ? (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                No templates yet. Open the Form Builder to create your first one.
              </p>
            ) : (
              <>
                <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">
                  {templates.length} templates, {publishedCount} published
                </p>
                <ul className="divide-y divide-neutral-200 dark:divide-dark-100">
                  {templates.slice(0, RECENT_COUNT).map((template) => (
                    <li key={template.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                          {template.name}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          {template.is_published ? "Published" : "Draft"} · Updated{" "}
                          {new Date(template.updated_at).toLocaleDateString()}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/custom-forms/builder/${template.id}`)}
                      >
                        Open
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CustomFormsHome;
