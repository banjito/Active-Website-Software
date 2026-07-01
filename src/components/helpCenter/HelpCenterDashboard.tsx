/**
 * Help Center Dashboard
 *
 * Main dashboard for viewing and managing help guides.
 * Features:
 * - Collapsible portal category sections
 * - Search and filter guides
 * - Create new guides
 * - Upload files/documents
 */

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { isSuperUser } from "@/lib/roles";
import { supabase } from "@/lib/supabase";
import { toast } from "react-hot-toast";
import {
  Search,
  Plus,
  ChevronDown,
  ChevronRight,
  BookOpen,
  FileText,
  Upload,
  Edit3,
  Trash2,
  Eye,
  Clock,
  Video,
  User,
  Tag,
  Filter,
  LayoutGrid,
  List,
  Sparkles,
  HelpCircle,
  Settings,
  X,
  ExternalLink,
  Briefcase,
  ShoppingCart,
  Users,
  Wrench,
  Building,
  FlaskConical,
  HardDrive,
  Globe,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

import {
  HelpGuide,
  PortalCategory,
  PORTAL_CATEGORY_LABELS,
  HelpCenterDocument,
  isVideoDocument,
} from "@/lib/types/helpCenter";
import { UploadPdfModal } from "./UploadPdfModal";
import { PdfViewerModal } from "./PdfViewerModal";
import { HeaderBar } from "@/components/ui/HeaderBar";

// Portal category icons
const PORTAL_ICONS: Record<PortalCategory, React.ReactNode> = {
  [PortalCategory.OPERATIONS]: <Briefcase className="w-5 h-5" />,
  [PortalCategory.SALES]: <ShoppingCart className="w-5 h-5" />,
  [PortalCategory.OFFICE_ADMIN]: <Building className="w-5 h-5" />,
  [PortalCategory.ENGINEERING]: <Wrench className="w-5 h-5" />,
  [PortalCategory.HR]: <Users className="w-5 h-5" />,
  [PortalCategory.LAB]: <FlaskConical className="w-5 h-5" />,
  [PortalCategory.FIELD_TECH]: <HardDrive className="w-5 h-5" />,
  [PortalCategory.GENERAL]: <Globe className="w-5 h-5" />,
};

// Portal category colors - vibrant gradients
const PORTAL_COLORS: Record<PortalCategory, string> = {
  [PortalCategory.OPERATIONS]: "bg-gradient-to-br from-blue-500 to-blue-600",
  [PortalCategory.SALES]: "bg-gradient-to-br from-emerald-500 to-emerald-600",
  [PortalCategory.OFFICE_ADMIN]:
    "bg-gradient-to-br from-violet-500 to-violet-600",
  [PortalCategory.ENGINEERING]: "bg-gradient-to-br from-[#f26722] to-[#e55611]",
  [PortalCategory.HR]: "bg-gradient-to-br from-pink-500 to-pink-600",
  [PortalCategory.LAB]: "bg-gradient-to-br from-cyan-500 to-cyan-600",
  [PortalCategory.FIELD_TECH]: "bg-gradient-to-br from-amber-500 to-amber-600",
  [PortalCategory.GENERAL]: "bg-gradient-to-br from-slate-500 to-slate-600",
};

export const HelpCenterDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // State
  const [guides, setGuides] = useState<HelpGuide[]>([]);
  const [documents, setDocuments] = useState<HelpCenterDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<
    PortalCategory | "all"
  >("all");
  const [expandedCategories, setExpandedCategories] = useState<
    Set<PortalCategory>
  >(new Set(Object.values(PortalCategory)));
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [selectedDocument, setSelectedDocument] =
    useState<HelpCenterDocument | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Load guides and documents
  useEffect(() => {
    loadGuides();
    loadDocuments();
    checkAdminStatus();
  }, []);

  const checkAdminStatus = async () => {
    if (
      user?.user_metadata?.role === "Admin" ||
      user?.user_metadata?.role === "Super Admin" ||
      isSuperUser(user?.email)
    ) {
      setIsAdmin(true);
    }
  };

  const loadGuides = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .schema("common")
        .from("help_guides")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        // If table doesn't exist yet, just use empty array
        if (error.code === "42P01") {
          setGuides([]);
          return;
        }
        throw error;
      }

      setGuides(
        data?.map((g) => ({
          id: g.id,
          title: g.title,
          description: g.description,
          category: g.category,
          tags: g.tags || [],
          createdBy: g.created_by,
          createdAt: g.created_at,
          updatedAt: g.updated_at,
          isPublished: g.is_published,
          viewCount: g.view_count || 0,
          content: g.content || { blocks: [], settings: {} },
        })) || [],
      );
    } catch (error: any) {
      console.error("Error loading guides:", error);
      // Don't show error toast if table doesn't exist
      if (error.code !== "42P01") {
        toast.error(`Failed to load guides: ${error.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Load documents
  const loadDocuments = async () => {
    try {
      const { data, error } = await supabase
        .schema("common")
        .from("help_center_documents")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        // If table doesn't exist yet, just use empty array
        if (error.code === "42P01") {
          setDocuments([]);
          return;
        }
        throw error;
      }

      setDocuments(
        data?.map((d) => ({
          id: d.id,
          name: d.name,
          category: d.category,
          file_path: d.file_path,
          file_url: d.file_url,
          file_size: d.file_size,
          file_type: d.file_type,
          createdBy: d.created_by,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
          viewCount: d.view_count || 0,
        })) || [],
      );
    } catch (error: any) {
      console.error("Error loading documents:", error);
      // Don't show error toast if table doesn't exist
      if (error.code !== "42P01") {
        toast.error(`Failed to load documents: ${error.message}`);
      }
    }
  };

  // Delete guide
  const deleteGuide = async (guideId: string) => {
    // Check admin status before allowing deletion
    if (!isAdmin) {
      toast.error("You do not have permission to delete guides");
      return;
    }

    if (!window.confirm("Are you sure you want to delete this guide?")) return;

    try {
      const { error } = await supabase
        .schema("common")
        .from("help_guides")
        .delete()
        .eq("id", guideId);

      if (error) throw error;

      setGuides((prev) => prev.filter((g) => g.id !== guideId));
      toast.success("Guide deleted successfully");
    } catch (error: any) {
      console.error("Error deleting guide:", error);
      toast.error(`Failed to delete guide: ${error.message}`);
    }
  };

  // View document
  const viewDocument = (document: HelpCenterDocument) => {
    setSelectedDocument(document);
    setShowPdfViewer(true);
  };

  // Delete document
  const deleteDocument = async (documentId: string, filePath: string) => {
    // Check admin status before allowing deletion
    if (!isAdmin) {
      toast.error("You do not have permission to delete documents");
      return;
    }

    if (!window.confirm("Are you sure you want to delete this document?"))
      return;

    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("help-center-documents")
        .remove([filePath]);

      if (storageError) {
        console.warn("Error deleting file from storage:", storageError);
        // Continue with database deletion even if storage deletion fails
      }

      // Delete from database
      const { error } = await supabase
        .schema("common")
        .from("help_center_documents")
        .delete()
        .eq("id", documentId);

      if (error) throw error;

      setDocuments((prev) => prev.filter((d) => d.id !== documentId));
      toast.success("Document deleted successfully");
    } catch (error: any) {
      console.error("Error deleting document:", error);
      toast.error(`Failed to delete document: ${error.message}`);
    }
  };

  // Toggle category expansion
  const toggleCategory = (category: PortalCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Filter guides based on search and category
  const filteredGuides = guides.filter((guide) => {
    const matchesSearch =
      searchQuery === "" ||
      guide.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      guide.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      guide.tags?.some((tag) =>
        tag.toLowerCase().includes(searchQuery.toLowerCase()),
      );

    const matchesCategory =
      selectedCategory === "all" || guide.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  // Filter documents based on search and category
  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      searchQuery === "" ||
      doc.name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === "all" || doc.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  // Group guides by category
  const guidesByCategory = Object.values(PortalCategory).reduce(
    (acc, category) => {
      acc[category] = filteredGuides.filter((g) => g.category === category);
      return acc;
    },
    {} as Record<PortalCategory, HelpGuide[]>,
  );

  // Group documents by category
  const documentsByCategory = Object.values(PortalCategory).reduce(
    (acc, category) => {
      acc[category] = filteredDocuments.filter((d) => d.category === category);
      return acc;
    },
    {} as Record<PortalCategory, HelpCenterDocument[]>,
  );

  // Format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return "Unknown";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-dark-200">
      <div className="sticky top-0 z-30 w-full shrink-0 border-b border-neutral-200 dark:border-dark-200">
        <HeaderBar />
      </div>

      <div className="bg-white dark:bg-dark-150 border-b border-neutral-200 dark:border-neutral-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-[#f26722] to-[#ff8c4a] rounded-none flex items-center justify-center shadow-lg">
                <HelpCircle className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold text-neutral-900 dark:text-white">
                  Help Center
                </h1>
                <p className="text-neutral-500 dark:text-neutral-400 mt-1">
                  Guides and documentation for all ampOS tasks
                </p>
              </div>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-none shadow-md hover:shadow-lg transition-all"
                >
                  <Upload className="w-5 h-5" />
                  Upload PDF or Video
                </button>
                <button
                  onClick={() => navigate("/help-center/builder")}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#f26722] hover:bg-[#e55611] text-white font-semibold rounded-none shadow-md hover:shadow-lg transition-all"
                >
                  <Plus className="w-5 h-5" />
                  Create Guide
                </button>
              </div>
            )}
          </div>

          {/* Search Bar */}
          <div className="mt-6 relative max-w-xl">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search guides, topics, or keywords..."
              className="w-full pl-12 pr-4 py-3 rounded-none border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-dark-100 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-6">
        {/* Filters Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 bg-white dark:bg-dark-150 rounded-none p-4 shadow-sm border border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-3">
            <Filter className="w-4 h-4 text-neutral-400" />
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Filter:
            </span>
            <select
              value={selectedCategory}
              onChange={(e) =>
                setSelectedCategory(e.target.value as PortalCategory | "all")
              }
              className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-neutral-50 dark:bg-dark-100 text-neutral-900 dark:text-white text-sm focus:ring-2 focus:ring-[#f26722] focus:border-transparent"
            >
              <option value="all">All Categories</option>
              {Object.entries(PORTAL_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1 bg-neutral-100 dark:bg-dark-100 rounded-none p-1">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 rounded-none transition-colors ${
                viewMode === "grid"
                  ? "bg-white dark:bg-dark-200 text-[#f26722] shadow-sm"
                  : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
              }`}
              title="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 rounded-none transition-colors ${
                viewMode === "list"
                  ? "bg-white dark:bg-dark-200 text-[#f26722] shadow-sm"
                  : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
              }`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {/* Loading skeleton */}
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-dark-150 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-700 overflow-hidden animate-pulse"
              >
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-neutral-200 dark:bg-dark-100 rounded-none" />
                    <div>
                      <div className="h-5 w-40 bg-neutral-200 dark:bg-dark-100 rounded mb-2" />
                      <div className="h-4 w-24 bg-neutral-100 dark:bg-dark-200 rounded" />
                    </div>
                  </div>
                  <div className="w-8 h-8 bg-neutral-100 dark:bg-dark-100 rounded-none" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredGuides.length === 0 && searchQuery === "" ? (
          /* Empty State */
          <div className="bg-white dark:bg-dark-150 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-700 p-12">
            <div className="text-center max-w-2xl mx-auto">
              <div className="w-20 h-20 bg-neutral-100 dark:bg-dark-100 rounded-none flex items-center justify-center mx-auto mb-6">
                <BookOpen className="w-10 h-10 text-neutral-400 dark:text-neutral-500" />
              </div>
              <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-3">
                {isAdmin
                  ? "Welcome to the Help Center"
                  : "No guides available yet"}
              </h3>
              <p className="text-neutral-500 dark:text-neutral-400 mb-8 text-lg">
                {isAdmin
                  ? "Create helpful guides and documentation to assist your team with common tasks and workflows."
                  : "Check back soon for helpful guides and documentation."}
              </p>
              {isAdmin && (
                <>
                  <button
                    onClick={() => navigate("/help-center/builder")}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#f26722] hover:bg-[#e55611] text-white font-semibold rounded-none shadow-md hover:shadow-lg transition-all text-lg"
                  >
                    <Plus className="w-5 h-5" />
                    Create Your First Guide
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          /* Category Sections */
          <div className="space-y-6">
            {Object.entries(guidesByCategory).map(
              ([category, categoryGuides]) => {
                const categoryDocs =
                  documentsByCategory[category as PortalCategory] || [];
                const hasContent =
                  categoryGuides.length > 0 || categoryDocs.length > 0;

                if (!hasContent && selectedCategory !== "all") return null;
                if (!hasContent) return null;

                const isExpanded = expandedCategories.has(
                  category as PortalCategory,
                );

                return (
                  <div
                    key={category}
                    className="bg-white dark:bg-dark-150 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-700 overflow-hidden"
                  >
                    <button
                      onClick={() => toggleCategory(category as PortalCategory)}
                      className="w-full flex items-center justify-between p-4 hover:bg-neutral-50 dark:hover:bg-dark-100 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-12 h-12 ${PORTAL_COLORS[category as PortalCategory]} text-white rounded-none flex items-center justify-center shadow-sm`}
                        >
                          {PORTAL_ICONS[category as PortalCategory]}
                        </div>
                        <div className="text-left">
                          <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
                            {PORTAL_CATEGORY_LABELS[category as PortalCategory]}
                          </h2>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400">
                            {categoryGuides.length} guide
                            {categoryGuides.length !== 1 ? "s" : ""}
                            {categoryDocs.length > 0 && (
                              <>
                                {" "}
                                • {categoryDocs.length} document
                                {categoryDocs.length !== 1 ? "s" : ""}
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                      <div
                        className={`w-8 h-8 rounded-none flex items-center justify-center transition-colors ${isExpanded ? "bg-[#f26722]/10" : "bg-neutral-100 dark:bg-dark-100"}`}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-[#f26722]" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-neutral-400" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-neutral-100 dark:border-neutral-700 pt-4 space-y-6">
                        {/* Guides */}
                        {categoryGuides.length > 0 && (
                          <div>
                            <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">
                              Guides
                            </h3>
                            {viewMode === "grid" ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {categoryGuides.map((guide) => (
                                  <GuideCard
                                    key={guide.id}
                                    guide={guide}
                                    onView={() =>
                                      navigate(`/help-center/guide/${guide.id}`)
                                    }
                                    onEdit={() =>
                                      navigate(
                                        `/help-center/builder/${guide.id}`,
                                      )
                                    }
                                    onDelete={() => deleteGuide(guide.id!)}
                                    isAdmin={isAdmin}
                                  />
                                ))}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {categoryGuides.map((guide) => (
                                  <GuideListItem
                                    key={guide.id}
                                    guide={guide}
                                    onView={() =>
                                      navigate(`/help-center/guide/${guide.id}`)
                                    }
                                    onEdit={() =>
                                      navigate(
                                        `/help-center/builder/${guide.id}`,
                                      )
                                    }
                                    onDelete={() => deleteGuide(guide.id!)}
                                    isAdmin={isAdmin}
                                    formatDate={formatDate}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Documents (PDFs & Videos) */}
                        {categoryDocs.length > 0 && (
                          <div>
                            <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">
                              Documents
                            </h3>
                            {viewMode === "grid" ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {categoryDocs.map((doc) => (
                                  <DocumentCard
                                    key={doc.id}
                                    document={doc}
                                    onView={() => viewDocument(doc)}
                                    onDelete={() =>
                                      deleteDocument(doc.id!, doc.file_path)
                                    }
                                    isAdmin={isAdmin}
                                  />
                                ))}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {categoryDocs.map((doc) => (
                                  <DocumentListItem
                                    key={doc.id}
                                    document={doc}
                                    onView={() => viewDocument(doc)}
                                    onDelete={() =>
                                      deleteDocument(doc.id!, doc.file_path)
                                    }
                                    isAdmin={isAdmin}
                                    formatDate={formatDate}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              },
            )}

            {/* No Results */}
            {filteredGuides.length === 0 &&
              filteredDocuments.length === 0 &&
              searchQuery !== "" && (
                <div className="bg-white dark:bg-dark-150 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-700 p-12 text-center">
                  <div className="w-16 h-16 bg-neutral-100 dark:bg-dark-100 rounded-none flex items-center justify-center mx-auto mb-4">
                    <Search className="w-8 h-8 text-neutral-400" />
                  </div>
                  <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">
                    No guides found
                  </h3>
                  <p className="text-neutral-500 dark:text-neutral-400 max-w-md mx-auto">
                    No guides match your search for "
                    <span className="font-medium text-neutral-700 dark:text-neutral-300">
                      {searchQuery}
                    </span>
                    ". Try adjusting your search terms or filter.
                  </p>
                  <button
                    onClick={() => setSearchQuery("")}
                    className="mt-4 px-4 py-2 text-[#f26722] hover:bg-[#f26722]/10 rounded-none font-medium transition-colors"
                  >
                    Clear search
                  </button>
                </div>
              )}
          </div>
        )}

        {/* Upload PDF Modal */}
        <UploadPdfModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          onUploadSuccess={() => {
            loadDocuments();
          }}
        />

        {/* PDF Viewer Modal */}
        <PdfViewerModal
          isOpen={showPdfViewer}
          onClose={() => {
            setShowPdfViewer(false);
            setSelectedDocument(null);
          }}
          document={selectedDocument}
        />
      </div>
    </div>
  );
};

// Guide Card Component
interface GuideCardProps {
  guide: HelpGuide;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isAdmin: boolean;
}

const GuideCard: React.FC<GuideCardProps> = ({
  guide,
  onView,
  onEdit,
  onDelete,
  isAdmin,
}) => (
  <div
    onClick={onView}
    className="group bg-neutral-50 dark:bg-dark-100 border border-neutral-200 dark:border-neutral-600 rounded-none p-5 hover:shadow-lg hover:border-[#f26722] hover:bg-white dark:hover:bg-dark-150 transition-all cursor-pointer relative"
  >
    {/* Admin actions */}
    {isAdmin && (
      <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="p-2 bg-white dark:bg-dark-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-600 opacity-80 hover:opacity-100 transition-opacity"
          title="Edit"
        >
          <Edit3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-2 bg-white dark:bg-dark-200 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-600 opacity-80 hover:opacity-100 transition-opacity"
          title="Delete"
        >
          <Trash2 className="w-4 h-4 text-red-500" />
        </button>
      </div>
    )}

    {/* Icon */}
    <div
      className={`w-12 h-12 ${PORTAL_COLORS[guide.category]} text-white rounded-none flex items-center justify-center shadow-md mb-4`}
    >
      <BookOpen className="w-6 h-6" />
    </div>

    {/* Title */}
    <h3 className="font-bold text-neutral-900 dark:text-white group-hover:text-[#f26722] transition-colors line-clamp-2 text-lg">
      {guide.title}
    </h3>

    {/* Description */}
    {guide.description && (
      <p className="text-neutral-600 dark:text-neutral-400 mt-2 line-clamp-2 text-sm">
        {guide.description}
      </p>
    )}

    {/* Tags */}
    {guide.tags && guide.tags.length > 0 && (
      <div className="flex flex-wrap gap-1.5 mt-4">
        {guide.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="px-2.5 py-1 bg-[#f26722]/10 text-[#f26722] rounded-none text-xs font-medium"
          >
            {tag}
          </span>
        ))}
        {guide.tags.length > 3 && (
          <span className="px-2.5 py-1 text-xs text-neutral-400 font-medium">
            +{guide.tags.length - 3}
          </span>
        )}
      </div>
    )}

    {/* Footer */}
    <div className="flex items-center gap-4 mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-600">
      {guide.viewCount !== undefined && (
        <span className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          <Eye className="w-3.5 h-3.5" />
          {guide.viewCount} views
        </span>
      )}
      <span className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
        <Clock className="w-3.5 h-3.5" />
        {guide.updatedAt
          ? new Date(guide.updatedAt).toLocaleDateString()
          : "Recently"}
      </span>
    </div>
  </div>
);

// Guide List Item Component
interface GuideListItemProps {
  guide: HelpGuide;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isAdmin: boolean;
  formatDate: (date?: string) => string;
}

const GuideListItem: React.FC<GuideListItemProps> = ({
  guide,
  onView,
  onEdit,
  onDelete,
  isAdmin,
  formatDate,
}) => (
  <div
    onClick={onView}
    className="group flex items-center gap-4 p-4 bg-neutral-50 dark:bg-dark-100 border border-neutral-200 dark:border-neutral-600 rounded-none hover:shadow-md hover:border-[#f26722] hover:bg-white dark:hover:bg-dark-150 transition-all cursor-pointer"
  >
    <div
      className={`w-11 h-11 ${PORTAL_COLORS[guide.category]} text-white rounded-none flex items-center justify-center flex-shrink-0 shadow-sm`}
    >
      <BookOpen className="w-5 h-5" />
    </div>
    <div className="flex-1 min-w-0">
      <h3 className="font-semibold text-neutral-900 dark:text-white group-hover:text-[#f26722] transition-colors truncate">
        {guide.title}
      </h3>
      {guide.description && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
          {guide.description}
        </p>
      )}
    </div>
    <div className="flex items-center gap-3 flex-shrink-0">
      <span className="text-sm text-neutral-400 hidden sm:flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5" />
        {formatDate(guide.updatedAt)}
      </span>
      <div className="flex items-center gap-1">
        {isAdmin && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="p-2 bg-white dark:bg-dark-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-600 opacity-80 hover:opacity-100 transition-opacity"
              title="Edit"
            >
              <Edit3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-2 bg-white dark:bg-dark-200 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-600 opacity-80 hover:opacity-100 transition-opacity"
              title="Delete"
            >
              <Trash2 className="w-4 h-4 text-red-500" />
            </button>
          </>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onView();
          }}
          className="p-2 bg-white dark:bg-dark-200 hover:bg-[#f26722]/10 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-600"
          title="View"
        >
          <ExternalLink className="w-4 h-4 text-[#f26722]" />
        </button>
      </div>
    </div>
  </div>
);

// Document Card Component
interface DocumentCardProps {
  document: HelpCenterDocument;
  onView: () => void;
  onDelete: () => void;
  isAdmin: boolean;
}

const DocumentCard: React.FC<DocumentCardProps> = ({
  document,
  onView,
  onDelete,
  isAdmin,
}) => {
  const isVideo = isVideoDocument(document);
  return (
    <div
      onClick={onView}
      className="group bg-neutral-50 dark:bg-dark-100 border border-neutral-200 dark:border-neutral-600 rounded-none p-5 hover:shadow-lg hover:border-[#f26722] hover:bg-white dark:hover:bg-dark-150 transition-all cursor-pointer relative"
    >
      {/* Admin actions */}
      {isAdmin && (
        <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-2 bg-white dark:bg-dark-200 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-600 opacity-80 hover:opacity-100 transition-opacity"
            title="Delete"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      )}

      {/* Icon */}
      <div
        className={`w-12 h-12 ${PORTAL_COLORS[document.category]} text-white rounded-none flex items-center justify-center shadow-md mb-4`}
      >
        {isVideo ? (
          <Video className="w-6 h-6" />
        ) : (
          <FileText className="w-6 h-6" />
        )}
      </div>

      {/* Title */}
      <h3 className="font-bold text-neutral-900 dark:text-white group-hover:text-[#f26722] transition-colors line-clamp-2 text-lg">
        {document.name}
      </h3>

      {/* File info */}
      <div className="flex items-center gap-2 mt-2 text-xs text-neutral-500 dark:text-neutral-400">
        <span>{isVideo ? "Video" : "PDF"}</span>
        <span>•</span>
        <span>{(document.file_size / 1024 / 1024).toFixed(2)} MB</span>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-600">
        {document.viewCount !== undefined && (
          <span className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            <Eye className="w-3.5 h-3.5" />
            {document.viewCount} views
          </span>
        )}
        <span className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          <Clock className="w-3.5 h-3.5" />
          {document.updatedAt
            ? new Date(document.updatedAt).toLocaleDateString()
            : "Recently"}
        </span>
      </div>
    </div>
  );
};

// Document List Item Component
interface DocumentListItemProps {
  document: HelpCenterDocument;
  onView: () => void;
  onDelete: () => void;
  isAdmin: boolean;
  formatDate: (date?: string) => string;
}

const DocumentListItem: React.FC<DocumentListItemProps> = ({
  document,
  onView,
  onDelete,
  isAdmin,
  formatDate,
}) => {
  const isVideo = isVideoDocument(document);
  return (
    <div
      onClick={onView}
      className="group flex items-center gap-4 p-4 bg-neutral-50 dark:bg-dark-100 border border-neutral-200 dark:border-neutral-600 rounded-none hover:shadow-md hover:border-[#f26722] hover:bg-white dark:hover:bg-dark-150 transition-all cursor-pointer"
    >
      <div
        className={`w-11 h-11 ${PORTAL_COLORS[document.category]} text-white rounded-none flex items-center justify-center flex-shrink-0 shadow-sm`}
      >
        {isVideo ? (
          <Video className="w-5 h-5" />
        ) : (
          <FileText className="w-5 h-5" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-neutral-900 dark:text-white group-hover:text-[#f26722] transition-colors truncate">
          {document.name}
        </h3>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
          {isVideo ? "Video" : "PDF"} •{" "}
          {(document.file_size / 1024 / 1024).toFixed(2)} MB
        </p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-sm text-neutral-400 hidden sm:flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          {formatDate(document.updatedAt)}
        </span>
        <div className="flex items-center gap-1">
          {isAdmin && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-2 bg-white dark:bg-dark-200 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-600 opacity-80 hover:opacity-100 transition-opacity"
              title="Delete"
            >
              <Trash2 className="w-4 h-4 text-red-500" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onView();
            }}
            className="p-2 bg-white dark:bg-dark-200 hover:bg-[#f26722]/10 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-600"
            title="View"
          >
            <ExternalLink className="w-4 h-4 text-[#f26722]" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default HelpCenterDashboard;
