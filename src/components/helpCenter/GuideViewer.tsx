/**
 * Guide Viewer Component
 *
 * Displays a help guide in read-only mode with beautiful formatting.
 * Features:
 * - Table of contents navigation
 * - Related guides
 */

import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { isSuperUser } from "@/lib/roles";
import { supabase } from "@/lib/supabase";
import { toast } from "react-hot-toast";
import {
  ArrowLeft,
  Edit3,
  Share2,
  Clock,
  User,
  Tag,
  Eye,
  BookOpen,
  ChevronRight,
  List,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

import {
  HelpGuide,
  ContentBlock,
  ContentBlockType,
  PortalCategory,
  PORTAL_CATEGORY_LABELS,
  TextBlockConfig,
  HeadingBlockConfig,
  ImageBlockConfig,
  TableBlockConfig,
  ListBlockConfig,
  CalloutBlockConfig,
  StepBlockConfig,
  VideoBlockConfig,
} from "@/lib/types/helpCenter";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export const GuideViewer: React.FC = () => {
  const { guideId } = useParams<{ guideId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // State
  const [guide, setGuide] = useState<HelpGuide | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [relatedGuides, setRelatedGuides] = useState<HelpGuide[]>([]);
  const [copied, setCopied] = useState(false);
  const [showToc, setShowToc] = useState(true);

  // Check if user is admin
  const isAdmin =
    user?.user_metadata?.role === "Admin" ||
    user?.user_metadata?.role === "Super Admin" ||
    isSuperUser(user?.email);

  // Load guide
  useEffect(() => {
    if (guideId) {
      loadGuide();
    }
  }, [guideId]);

  const loadGuide = async () => {
    if (!guideId) return;

    try {
      setIsLoading(true);

      // Load the guide
      const { data, error } = await supabase
        .schema("common")
        .from("help_guides")
        .select("*")
        .eq("id", guideId)
        .single();

      if (error) throw error;

      if (data) {
        setGuide({
          id: data.id,
          title: data.title,
          description: data.description,
          category: data.category,
          tags: data.tags || [],
          createdBy: data.created_by,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          isPublished: data.is_published,
          viewCount: data.view_count || 0,
          content: data.content || { blocks: [], settings: {} },
        });

        // Increment view count
        await supabase
          .schema("common")
          .from("help_guides")
          .update({ view_count: (data.view_count || 0) + 1 })
          .eq("id", guideId);

        // Load related guides
        loadRelatedGuides(data.category, data.tags || [], guideId);
      }
    } catch (error: any) {
      console.error("Error loading guide:", error);
      toast.error(`Failed to load guide: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadRelatedGuides = async (
    category: string,
    tags: string[],
    currentId: string,
  ) => {
    try {
      const { data, error } = await supabase
        .schema("common")
        .from("help_guides")
        .select("id, title, description, category, tags")
        .eq("category", category)
        .neq("id", currentId)
        .limit(5);

      if (!error && data) {
        setRelatedGuides(
          data.map((g) => ({
            id: g.id,
            title: g.title,
            description: g.description,
            category: g.category,
            tags: g.tags || [],
            content: {
              blocks: [],
              settings: {
                showTableOfContents: false,
                allowComments: false,
                showLastUpdated: false,
              },
            },
          })),
        );
      }
    } catch (error) {
      console.error("Error loading related guides:", error);
    }
  };

  // Get headings for table of contents
  const getHeadings = (): { id: string; text: string; level: number }[] => {
    if (!guide) return [];

    return guide.content.blocks
      .filter((block) => block.type === ContentBlockType.HEADING)
      .map((block) => {
        const config = block.config as HeadingBlockConfig;
        return {
          id: block.id,
          text: config.content,
          level: config.level,
        };
      });
  };

  // Copy link to clipboard
  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Link copied to clipboard");
  };

  // Format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return "Unknown";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50 dark:bg-dark-200">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!guide) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-50 dark:bg-dark-200">
        <BookOpen className="w-16 h-16 text-neutral-300 dark:text-neutral-600 mb-4" />
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-2">
          Guide not found
        </h2>
        <p className="text-neutral-500 dark:text-neutral-400 mb-4">
          The guide you're looking for doesn't exist or has been removed.
        </p>
        <Button onClick={() => navigate("/help-center")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Help Center
        </Button>
      </div>
    );
  }

  const headings = getHeadings();

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-dark-200">
      {/* Header */}
      <div className="bg-white dark:bg-dark-150 border-b border-neutral-200 dark:border-neutral-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => navigate("/help-center")}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Help Center</span>
              </Button>
              <div className="h-6 w-px bg-neutral-300 dark:bg-neutral-600" />
              <span className="text-sm text-neutral-500 dark:text-neutral-400">
                {PORTAL_CATEGORY_LABELS[guide.category]}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={copyLink}
                className="flex items-center gap-2"
              >
                {copied ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">
                  {copied ? "Copied!" : "Copy Link"}
                </span>
              </Button>
              {isAdmin && (
                <Button
                  onClick={() => navigate(`/help-center/builder/${guide.id}`)}
                  className="bg-brand hover:bg-brand-dark text-white"
                >
                  <Edit3 className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-8">
        <div className="flex gap-8">
          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <article className="bg-white dark:bg-dark-150 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-700 p-6 lg:p-10">
              {/* Guide Header */}
              <header className="mb-8 pb-6 border-b border-neutral-200 dark:border-neutral-700">
                <h1 className="text-3xl lg:text-4xl font-bold text-neutral-900 dark:text-white mb-4">
                  {guide.title}
                </h1>
                {guide.description && (
                  <p className="text-lg text-neutral-600 dark:text-neutral-400 mb-4">
                    {guide.description}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-500 dark:text-neutral-400">
                  {guide.updatedAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      Updated {formatDate(guide.updatedAt)}
                    </span>
                  )}
                  {guide.viewCount !== undefined && (
                    <span className="flex items-center gap-1">
                      <Eye className="w-4 h-4" />
                      {guide.viewCount} views
                    </span>
                  )}
                </div>
                {guide.tags && guide.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {guide.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-neutral-100 dark:bg-dark-100 text-neutral-600 dark:text-neutral-400 rounded-none text-sm"
                      >
                        <Tag className="w-3 h-3" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </header>

              {/* Guide Content */}
              <div className="prose prose-neutral dark:prose-invert max-w-none">
                {guide.content.blocks.map((block) => (
                  <ContentBlockRenderer key={block.id} block={block} />
                ))}
              </div>

              {/* Empty State */}
              {guide.content.blocks.length === 0 && (
                <div className="text-center py-12">
                  <BookOpen className="w-12 h-12 mx-auto text-neutral-300 dark:text-neutral-600 mb-4" />
                  <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-2">
                    No content yet
                  </h3>
                  <p className="text-neutral-500 dark:text-neutral-400 mb-4">
                    {isAdmin
                      ? "This guide is empty. Add content to help your team."
                      : "This guide is coming soon. Check back later for helpful content."}
                  </p>
                  {isAdmin && (
                    <Button
                      onClick={() =>
                        navigate(`/help-center/builder/${guide.id}`)
                      }
                      className="bg-brand hover:bg-brand-dark text-white"
                    >
                      <Edit3 className="w-4 h-4 mr-2" />
                      Add Content
                    </Button>
                  )}
                </div>
              )}
            </article>
          </div>

          {/* Sidebar */}
          <aside className="hidden lg:block w-72 flex-shrink-0">
            <div className="sticky top-24 space-y-6">
              {/* Table of Contents */}
              {headings.length > 0 &&
                guide.content.settings?.showTableOfContents && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <List className="w-4 h-4" />
                        On this page
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <nav className="space-y-1">
                        {headings.map((heading) => (
                          <a
                            key={heading.id}
                            href={`#${heading.id}`}
                            className={`block text-sm hover:text-brand transition-colors ${
                              heading.level === 1
                                ? "font-medium text-neutral-900 dark:text-white"
                                : heading.level === 2
                                  ? "text-neutral-700 dark:text-neutral-300 pl-3"
                                  : "text-neutral-500 dark:text-neutral-400 pl-6"
                            }`}
                          >
                            {heading.text}
                          </a>
                        ))}
                      </nav>
                    </CardContent>
                  </Card>
                )}

              {/* Related Guides */}
              {relatedGuides.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      Related Guides
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {relatedGuides.map((related) => (
                        <button
                          key={related.id}
                          onClick={() =>
                            navigate(`/help-center/guide/${related.id}`)
                          }
                          className="w-full text-left p-2 rounded-none hover:bg-neutral-50 dark:hover:bg-dark-100 transition-colors group"
                        >
                          <span className="text-sm font-medium text-neutral-900 dark:text-white group-hover:text-brand transition-colors line-clamp-2">
                            {related.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

// Content Block Renderer
const ContentBlockRenderer: React.FC<{ block: ContentBlock }> = ({ block }) => {
  const config = block.config;

  switch (block.type) {
    case ContentBlockType.HEADING:
      const hConfig = config as HeadingBlockConfig;
      const HeadingTag = `h${hConfig.level}` as keyof JSX.IntrinsicElements;
      const headingClasses = {
        1: "text-3xl font-bold mt-8 mb-4",
        2: "text-2xl font-bold mt-6 mb-3",
        3: "text-xl font-semibold mt-5 mb-2",
        4: "text-lg font-semibold mt-4 mb-2",
      };
      return (
        <HeadingTag
          id={block.id}
          className={`${headingClasses[hConfig.level]} text-neutral-900 dark:text-white scroll-mt-24`}
        >
          {hConfig.content}
        </HeadingTag>
      );

    case ContentBlockType.TEXT:
      return (
        <div
          className="mb-4 text-neutral-700 dark:text-neutral-300 leading-relaxed"
          dangerouslySetInnerHTML={{
            __html: (config as TextBlockConfig).content || "",
          }}
        />
      );

    case ContentBlockType.BULLET_LIST:
      return (
        <ul className="list-disc list-outside ml-6 mb-4 space-y-1 text-neutral-700 dark:text-neutral-300">
          {((config as ListBlockConfig).items || []).map((item, i) => (
            <li key={i} className="leading-relaxed">
              {item.content}
            </li>
          ))}
        </ul>
      );

    case ContentBlockType.NUMBERED_LIST:
      return (
        <ol className="list-decimal list-outside ml-6 mb-4 space-y-1 text-neutral-700 dark:text-neutral-300">
          {((config as ListBlockConfig).items || []).map((item, i) => (
            <li key={i} className="leading-relaxed">
              {item.content}
            </li>
          ))}
        </ol>
      );

    case ContentBlockType.IMAGE:
      const imgConfig = config as ImageBlockConfig;
      return imgConfig.url ? (
        <figure
          className={`mb-6 ${
            imgConfig.alignment === "center"
              ? "mx-auto"
              : imgConfig.alignment === "right"
                ? "ml-auto"
                : ""
          }`}
          style={{ width: imgConfig.width || "100%", maxWidth: "100%" }}
        >
          <img
            src={imgConfig.url}
            alt={imgConfig.alt || ""}
            className="rounded-none shadow-md w-full"
          />
          {imgConfig.caption && (
            <figcaption className="text-center text-sm text-neutral-500 dark:text-neutral-400 mt-2 italic">
              {imgConfig.caption}
            </figcaption>
          )}
        </figure>
      ) : null;

    case ContentBlockType.CALLOUT:
      const cConfig = config as CalloutBlockConfig;
      const calloutStyles = {
        info: {
          bg: "bg-blue-50 dark:bg-blue-900/20",
          border: "border-blue-500",
          text: "text-blue-800 dark:text-blue-200",
          icon: "ℹ️",
        },
        warning: {
          bg: "bg-yellow-50 dark:bg-yellow-900/20",
          border: "border-yellow-500",
          text: "text-yellow-800 dark:text-yellow-200",
          icon: "⚠️",
        },
        success: {
          bg: "bg-green-50 dark:bg-green-900/20",
          border: "border-green-500",
          text: "text-green-800 dark:text-green-200",
          icon: "✅",
        },
        error: {
          bg: "bg-red-50 dark:bg-red-900/20",
          border: "border-red-500",
          text: "text-red-800 dark:text-red-200",
          icon: "❌",
        },
        tip: {
          bg: "bg-purple-50 dark:bg-purple-900/20",
          border: "border-purple-500",
          text: "text-purple-800 dark:text-purple-200",
          icon: "💡",
        },
      };
      const style = calloutStyles[cConfig.type];
      return (
        <div
          className={`mb-6 border-l-4 ${style.border} ${style.bg} p-4 rounded-none`}
        >
          <div className={`${style.text}`}>
            {cConfig.title && (
              <p className="font-semibold mb-1">
                {style.icon} {cConfig.title}
              </p>
            )}
            <p className="leading-relaxed">{cConfig.content}</p>
          </div>
        </div>
      );

    case ContentBlockType.STEP:
      const sConfig = config as StepBlockConfig;
      return (
        <div className="flex gap-4 mb-6">
          <div className="flex-shrink-0 w-12 h-12 bg-brand text-white rounded-none flex items-center justify-center font-bold text-xl shadow-md">
            {sConfig.stepNumber}
          </div>
          <div className="flex-1 pt-1">
            <h4 className="text-xl font-semibold text-neutral-900 dark:text-white mb-2">
              {sConfig.title}
            </h4>
            <div
              className="text-neutral-700 dark:text-neutral-300 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: sConfig.content || "" }}
            />
          </div>
        </div>
      );

    case ContentBlockType.TABLE:
      const tConfig = config as TableBlockConfig;
      return (
        <div className="mb-6 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {(tConfig.headers || []).map((header, i) => (
                  <th
                    key={i}
                    className="border border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-dark-200 px-4 py-3 text-left font-semibold text-neutral-900 dark:text-white"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(tConfig.rows || []).map((row, ri) => (
                <tr
                  key={ri}
                  className={
                    ri % 2 === 0
                      ? "bg-white dark:bg-dark-150"
                      : "bg-neutral-50 dark:bg-dark-100"
                  }
                >
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="border border-neutral-300 dark:border-neutral-600 px-4 py-3 text-neutral-700 dark:text-neutral-300"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case ContentBlockType.VIDEO:
      const vConfig = config as VideoBlockConfig;
      // Extract video ID from YouTube/Vimeo URLs
      const getVideoEmbed = (url: string) => {
        if (!url) return null;

        // YouTube
        const ytMatch = url.match(
          /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/,
        );
        if (ytMatch) {
          return `https://www.youtube.com/embed/${ytMatch[1]}`;
        }

        // Vimeo
        const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
        if (vimeoMatch) {
          return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
        }

        return url;
      };

      const embedUrl = getVideoEmbed(vConfig.url);
      return embedUrl ? (
        <div className="mb-6">
          {vConfig.title && (
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              {vConfig.title}
            </p>
          )}
          <div className="aspect-video">
            <iframe
              src={embedUrl}
              className="w-full h-full rounded-none shadow-md"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          </div>
        </div>
      ) : null;

    case ContentBlockType.CODE_BLOCK:
      return (
        <pre className="mb-6 p-4 bg-neutral-900 text-neutral-100 rounded-none overflow-x-auto">
          <code>{(config as any).code || ""}</code>
        </pre>
      );

    case ContentBlockType.DIVIDER:
      return (
        <hr className="my-8 border-t-2 border-neutral-200 dark:border-neutral-700" />
      );

    default:
      return null;
  }
};

export default GuideViewer;
