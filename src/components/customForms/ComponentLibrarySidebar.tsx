/**
 * Component Library Sidebar
 *
 * Shows all available components that can be dragged onto the form.
 * Organized by category with search/filter functionality.
 */

import React, { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  Search,
  FileText,
  Zap,
  Eye,
  Wrench,
  Table,
  Table2,
  MessageSquare,
  Thermometer,
  Tag,
  Activity,
  TrendingUp,
  CircleDot,
  Type,
  ArrowLeftRight,
  FlaskConical,
  Clock,
  Settings,
  PanelLeftClose,
} from "lucide-react";

import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  COMPONENT_LIBRARY,
  getAllCategories,
} from "@/lib/customForms/componentLibrary";
import type { SavedComponent } from "@/lib/customForms/savedComponents";
import { ComponentDefinition } from "@/lib/types/customForms";

const iconMap: Record<string, any> = {
  FileText,
  Zap,
  Eye,
  Wrench,
  Table,
  Table2,
  MessageSquare,
  Thermometer,
  Tag,
  Activity,
  TrendingUp,
  CircleDot,
  Type,
  ArrowLeftRight,
  FlaskConical,
  Clock,
  Settings,
};

interface DraggableComponentProps {
  component: ComponentDefinition;
}

const DraggableComponent: React.FC<DraggableComponentProps> = ({
  component,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: component.id,
      data: {
        type: "library-component",
        component,
      },
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = iconMap[component.icon] || FileText;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="bg-white dark:bg-dark-100 border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-[#f26722] hover:shadow-md transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 bg-neutral-100 dark:bg-dark-200 rounded flex items-center justify-center">
          <Icon className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-neutral-900 dark:text-white truncate">
            {component.name}
          </h4>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-2">
            {component.description}
          </p>
        </div>
      </div>
    </div>
  );
};

interface DraggableSavedComponentProps {
  saved: SavedComponent;
  onView?: (saved: SavedComponent) => void;
}

const DraggableSavedComponent: React.FC<DraggableSavedComponentProps> = ({
  saved,
  onView,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `saved-${saved.id}`,
      data: {
        type: "saved-component",
        sectionConfig: saved.section_config,
        name: saved.name,
        savedComponentId: saved.id,
      },
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white dark:bg-dark-100 border border-[#f26722]/40 dark:border-[#f26722]/50 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-[#f26722] hover:shadow-md transition-all"
    >
      <div className="flex items-start gap-3">
        <div
          {...attributes}
          {...listeners}
          className="flex-shrink-0 w-8 h-8 bg-orange-50 dark:bg-orange-900/20 rounded flex items-center justify-center touch-none"
        >
          <Table2 className="w-4 h-4 text-[#f26722]" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-neutral-900 dark:text-white truncate">
            {saved.name}
          </h4>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-2">
            {saved.description ||
              (saved.section_config?.title as string) ||
              "Custom table or section"}
          </p>
          {onView && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onView(saved);
              }}
              className="mt-2 text-xs font-medium text-[#f26722] hover:underline"
            >
              View
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const ComponentLibrarySidebar: React.FC<{
  savedComponents?: SavedComponent[];
  onViewSavedComponent?: (saved: SavedComponent) => void;
  onHide?: () => void;
}> = ({ savedComponents = [], onViewSavedComponent, onHide }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = getAllCategories();

  const filteredComponents = COMPONENT_LIBRARY.filter((component) => {
    // Filter by search query
    const matchesSearch =
      searchQuery === "" ||
      component.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      component.description.toLowerCase().includes(searchQuery.toLowerCase());

    // Filter by category
    const matchesCategory =
      selectedCategory === null || component.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  // Group components by category for display
  const groupedComponents = filteredComponents.reduce(
    (acc, component) => {
      if (!acc[component.category]) {
        acc[component.category] = [];
      }
      acc[component.category].push(component);
      return acc;
    },
    {} as Record<string, ComponentDefinition[]>,
  );

  return (
    <div className="w-80 min-w-[280px] shrink-0 bg-white dark:bg-dark-150 border-r dark:border-neutral-700 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b dark:border-neutral-700">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Components
          </h2>
          {onHide && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onHide}
              title="Hide component library"
              aria-label="Hide component library"
              className="h-9 w-9 shrink-0 rounded-full p-0 border-0 bg-transparent hover:bg-transparent hover:text-[#f26722] [&>span:first-child]:mr-0"
              leftIcon={<PanelLeftClose className="w-4 h-4" />}
            />
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search components..."
            leftIcon={<Search className="w-4 h-4 text-neutral-400" />}
            className="pl-10"
          />
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 mt-3 flex-wrap">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              selectedCategory === null
                ? "bg-[#f26722] text-white"
                : "bg-neutral-100 dark:bg-dark-100 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-dark-200"
            }`}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1 text-xs font-medium rounded-full capitalize transition-colors ${
                selectedCategory === category
                  ? "bg-[#f26722] text-white"
                  : "bg-neutral-100 dark:bg-dark-100 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-dark-200"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Component List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {savedComponents.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">
              Saved components
            </h3>
            <div className="space-y-2">
              {savedComponents.map((saved) => (
                <DraggableSavedComponent
                  key={saved.id}
                  saved={saved}
                  onView={onViewSavedComponent}
                />
              ))}
            </div>
          </div>
        )}
        {Object.entries(groupedComponents).length === 0 &&
        savedComponents.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-neutral-500 dark:text-neutral-400 text-sm">
              No components found
            </p>
          </div>
        ) : Object.entries(groupedComponents).length > 0 ? (
          Object.entries(groupedComponents).map(([category, components]) => (
            <div key={category}>
              <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">
                {category}
              </h3>
              <div className="space-y-2">
                {components.map((component) => (
                  <DraggableComponent
                    key={component.id}
                    component={component}
                  />
                ))}
              </div>
            </div>
          ))
        ) : null}
      </div>

      {/* Help Text */}
      <div className="p-4 border-t dark:border-neutral-700 bg-neutral-50 dark:bg-dark-200">
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          💡 <strong>Tip:</strong> Drag components to the canvas to add them to
          your form. You can reorder and customize them after adding.
        </p>
      </div>
    </div>
  );
};
