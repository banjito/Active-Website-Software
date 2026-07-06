import React, { useState, useEffect } from "react";
import Card, {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Textarea } from "../../../components/ui/Textarea";
import { Select } from "../../../components/ui/Select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/Dialog";
import {
  Folder,
  Plus,
  Edit,
  Trash2,
  Upload,
  Download,
  FileText,
  Loader2,
  X,
  Search,
  Filter,
  FolderPlus,
  Calendar,
  Tag,
  Archive,
  ArchiveRestore,
  AlertCircle,
} from "lucide-react";
import {
  employeeDocumentsService,
  EmployeeDocument,
  EmployeeDocumentFolder,
  DocumentCategory,
  DOCUMENT_CATEGORIES,
  formatFileSize,
  canDeleteEmployeeDocumentSync,
} from "../../../services/hr/employeeDocumentsService";
import { formatDateOnly, toDateOnlyISO } from "../../../services/hr/dateUtils";
import { useAuth } from "../../../lib/AuthContext";
import { toast } from "../../../components/ui/toast";
import { supabase } from "../../../lib/supabase";

interface User {
  id: string;
  email: string;
  name?: string;
  user_metadata?: {
    name?: string;
    [key: string]: any;
  };
}

interface DocumentStorageProps {
  initialEmployeeId?: string;
}

export const DocumentStorage: React.FC<DocumentStorageProps> = ({
  initialEmployeeId,
}) => {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(
    initialEmployeeId || "",
  );
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [folders, setFolders] = useState<EmployeeDocumentFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Filter states
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // Modal states
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] =
    useState<EmployeeDocument | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    category: "general" as DocumentCategory,
    folderId: "",
    expirationDate: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Upload form state
  const [uploadForm, setUploadForm] = useState({
    file: null as File | null,
    name: "",
    description: "",
    category: "general" as DocumentCategory,
    folderId: "",
    tags: [] as string[],
    expirationDate: "",
  });

  // Folder form state
  const [folderForm, setFolderForm] = useState({
    name: "",
    description: "",
    parentFolderId: "",
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (initialEmployeeId && initialEmployeeId !== selectedEmployeeId) {
      setSelectedEmployeeId(initialEmployeeId);
    }
  }, [initialEmployeeId]);

  useEffect(() => {
    if (selectedEmployeeId) {
      fetchDocuments();
      fetchFolders();
    } else {
      setDocuments([]);
      setFolders([]);
    }
  }, [selectedEmployeeId, categoryFilter, folderFilter, showArchived]);

  const fetchUsers = async () => {
    try {
      setLoading(true);

      // Try to use admin_get_users RPC function
      let { data: adminData, error: adminError } = await supabase
        .schema("common")
        .rpc("admin_get_users");

      // Fallback: try without schema
      if (adminError) {
        const fallback = await supabase.rpc("admin_get_users");
        if (!fallback.error) {
          adminData = fallback.data;
          adminError = null;
        }
      }

      if (!adminError && adminData) {
        const mappedUsers = adminData.map((u: any) => ({
          id: u.id,
          email: u.email || "",
          name:
            u.raw_user_meta_data?.name ||
            u.user_metadata?.name ||
            u.email?.split("@")[0] ||
            "Unknown",
          user_metadata: {
            name: u.raw_user_meta_data?.name || u.user_metadata?.name || null,
            ...(u.raw_user_meta_data || u.user_metadata || {}),
          },
        }));
        setUsers(
          mappedUsers.sort((a, b) =>
            (a.name || a.email).localeCompare(b.name || b.email),
          ),
        );
        return;
      }

      // Fallback: try profiles table
      const { data: profiles, error: profileError } = await supabase
        .schema("common")
        .from("profiles")
        .select("id, email, user_metadata")
        .limit(500);

      if (!profileError && profiles && profiles.length > 0) {
        const mappedUsers = profiles.map((p: any) => ({
          id: p.id,
          email: p.email || "",
          name: p.user_metadata?.name || p.email?.split("@")[0] || "Unknown",
          user_metadata: p.user_metadata || {},
        }));
        setUsers(
          mappedUsers.sort((a, b) =>
            (a.name || a.email).localeCompare(b.name || b.email),
          ),
        );
        return;
      }

      // Fallback: try users table
      const { data: usersData, error: usersError } = await supabase
        .from("users")
        .select("*")
        .limit(500);
      if (!usersError && usersData && usersData.length > 0) {
        const mappedUsers = usersData.map((u: any) => ({
          id: u.id,
          email: u.email || "",
          name:
            u.name ||
            u.user_metadata?.name ||
            u.email?.split("@")[0] ||
            "Unknown",
          user_metadata: { name: u.name || u.user_metadata?.name },
        }));
        setUsers(
          mappedUsers.sort((a, b) =>
            (a.name || a.email).localeCompare(b.name || b.email),
          ),
        );
        return;
      }

      // Final fallback: use current user
      if (user) {
        setUsers([
          {
            id: user.id,
            email: user.email || "",
            name:
              user.user_metadata?.name ||
              user.email?.split("@")[0] ||
              "Unknown",
            user_metadata: user.user_metadata || {},
          },
        ]);
      }
    } catch (error: any) {
      console.error("Error fetching users:", error);
      toast({
        title: "Error",
        description: "Failed to load users. Please try again.",
        variant: "destructive",
      });
      // If all else fails, use current user
      if (user) {
        setUsers([
          {
            id: user.id,
            email: user.email || "",
            name:
              user.user_metadata?.name ||
              user.email?.split("@")[0] ||
              "Unknown",
            user_metadata: user.user_metadata || {},
          },
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchDocuments = async () => {
    if (!selectedEmployeeId) return;

    try {
      setLoading(true);
      const filter: any = {
        employeeId: selectedEmployeeId,
        archived: showArchived,
      };

      if (categoryFilter !== "all") {
        filter.category = categoryFilter;
      }

      if (folderFilter !== "all") {
        filter.folderId = folderFilter === "none" ? null : folderFilter;
      }

      const data =
        await employeeDocumentsService.fetchEmployeeDocuments(filter);

      // Apply search filter client-side
      let filteredData = data;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filteredData = data.filter(
          (doc) =>
            doc.name.toLowerCase().includes(query) ||
            doc.description?.toLowerCase().includes(query) ||
            doc.tags.some((tag) => tag.toLowerCase().includes(query)),
        );
      }

      setDocuments(filteredData);
    } catch (error: any) {
      console.error("Error fetching documents:", error);
      toast({
        title: "Error",
        description: "Failed to load documents. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchFolders = async () => {
    if (!selectedEmployeeId) return;

    try {
      const data =
        await employeeDocumentsService.fetchEmployeeDocumentFolders(
          selectedEmployeeId,
        );
      setFolders(data);
    } catch (error: any) {
      console.error("Error fetching folders:", error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadForm((prev) => ({
        ...prev,
        file,
        name: prev.name || file.name,
      }));
    }
  };

  const handleUpload = async () => {
    if (!uploadForm.file || !selectedEmployeeId) {
      toast({
        title: "Error",
        description: "Please select a file and employee.",
        variant: "destructive",
      });
      return;
    }

    try {
      setUploading(true);
      await employeeDocumentsService.uploadEmployeeDocument({
        file: uploadForm.file,
        employeeId: selectedEmployeeId,
        name: uploadForm.name || uploadForm.file.name,
        description: uploadForm.description || undefined,
        category: uploadForm.category,
        folderId: uploadForm.folderId || null,
        tags: uploadForm.tags,
        expirationDate: toDateOnlyISO(uploadForm.expirationDate) || null,
      });

      toast({
        title: "Success",
        description: "Document uploaded successfully.",
      });

      // Reset form
      setUploadForm({
        file: null,
        name: "",
        description: "",
        category: "general",
        folderId: "",
        tags: [],
        expirationDate: "",
      });
      setIsUploadModalOpen(false);
      fetchDocuments();
    } catch (error: any) {
      console.error("Error uploading document:", error);
      toast({
        title: "Error",
        description:
          error.message || "Failed to upload document. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    const docCount = documents.filter((d) => d.folder_id === folderId).length;
    const message =
      docCount > 0
        ? `Remove folder "${folderName}"? The ${docCount} document${docCount !== 1 ? "s" : ""} inside will be moved to "No Folder".`
        : `Remove folder "${folderName}"?`;
    if (!confirm(message)) return;
    try {
      await employeeDocumentsService.deleteEmployeeDocumentFolder(folderId);
      toast({
        title: "Success",
        description: "Folder removed.",
        variant: "success",
      });
      if (folderFilter === folderId) setFolderFilter("all");
      fetchFolders();
      fetchDocuments();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to remove folder.",
        variant: "destructive",
      });
    }
  };

  const handleCreateFolder = async () => {
    if (!folderForm.name || !selectedEmployeeId) {
      toast({
        title: "Error",
        description: "Please enter a folder name.",
        variant: "destructive",
      });
      return;
    }

    try {
      await employeeDocumentsService.createEmployeeDocumentFolder({
        employee_id: selectedEmployeeId,
        name: folderForm.name,
        description: folderForm.description || undefined,
        parent_folder_id: folderForm.parentFolderId || null,
      });

      toast({
        title: "Success",
        description: "Folder created successfully.",
      });

      setFolderForm({
        name: "",
        description: "",
        parentFolderId: "",
      });
      setIsFolderModalOpen(false);
      fetchFolders();
    } catch (error: any) {
      console.error("Error creating folder:", error);
      toast({
        title: "Error",
        description:
          error.message || "Failed to create folder. Please try again.",
        variant: "destructive",
      });
    }
  };

  const userRole = user?.user_metadata?.role as string | undefined;

  const handleDeleteDocument = async (documentId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this document? This action cannot be undone.",
      )
    ) {
      return;
    }

    try {
      await employeeDocumentsService.deleteEmployeeDocument(documentId);
      toast({
        title: "Success",
        description: "Document deleted successfully.",
      });
      fetchDocuments();
    } catch (error: any) {
      console.error("Error deleting document:", error);
      toast({
        title: "Error",
        description:
          error?.message || "Failed to delete document. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleArchiveDocument = async (
    documentId: string,
    archived: boolean,
  ) => {
    try {
      await employeeDocumentsService.archiveEmployeeDocument(
        documentId,
        archived,
      );
      toast({
        title: "Success",
        description: archived ? "Document archived." : "Document restored.",
      });
      fetchDocuments();
    } catch (error: any) {
      console.error("Error archiving document:", error);
      toast({
        title: "Error",
        description: "Failed to update document. Please try again.",
        variant: "destructive",
      });
    }
  };

  const openEditModal = (doc: EmployeeDocument) => {
    setSelectedDocument(doc);
    setEditForm({
      name: doc.name,
      description: doc.description || "",
      category: doc.category || "general",
      folderId: doc.folder_id || "",
      expirationDate: doc.expiration_date
        ? doc.expiration_date.slice(0, 10)
        : "",
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedDocument) return;
    setSavingEdit(true);
    try {
      await employeeDocumentsService.updateEmployeeDocument(
        selectedDocument.id,
        {
          name: editForm.name,
          description: editForm.description || null,
          category: editForm.category,
          folder_id: editForm.folderId || null,
          expiration_date: toDateOnlyISO(editForm.expirationDate) || null,
        },
      );
      toast({
        title: "Saved",
        description: "Document updated.",
        variant: "success",
      });
      setIsEditModalOpen(false);
      setSelectedDocument(null);
      fetchDocuments();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to update document",
        variant: "destructive",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDownload = async (document: EmployeeDocument) => {
    try {
      // Refresh the signed URL
      const { data: urlData } = await supabase.storage
        .from("employee-documents")
        .createSignedUrl(document.file_path, 3600);

      if (urlData?.signedUrl) {
        window.open(urlData.signedUrl, "_blank");
      } else {
        window.open(document.file_url, "_blank");
      }
    } catch (error: any) {
      console.error("Error downloading document:", error);
      toast({
        title: "Error",
        description: "Failed to download document. Please try again.",
        variant: "destructive",
      });
    }
  };

  const selectedEmployee = users.find((u) => u.id === selectedEmployeeId);

  return (
    <div className="space-y-6">
      {!initialEmployeeId && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Document Storage</h1>
            <p className="text-muted-foreground mt-1">
              Manage employee documents and files
            </p>
          </div>
          <div className="flex gap-2">
            {selectedEmployeeId && (
              <>
                <Button
                  onClick={() => setIsFolderModalOpen(true)}
                  variant="outline"
                  leftIcon={<FolderPlus size={16} />}
                >
                  New Folder
                </Button>
                <Button
                  onClick={() => setIsUploadModalOpen(true)}
                  leftIcon={<Upload size={16} />}
                >
                  Upload Document
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* User Selection - Only show if no initialEmployeeId */}
      {!initialEmployeeId && (
        <Card>
          <CardHeader>
            <CardTitle>Select User</CardTitle>
            <CardDescription>
              Choose a user to view and manage their documents
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              options={[
                { value: "", label: "-- Select User --" },
                ...users.map((u) => ({
                  value: u.id,
                  label: `${u.name || u.email} (${u.email})`,
                })),
              ]}
            />
          </CardContent>
        </Card>
      )}

      {selectedEmployeeId && (
        <>
          {/* Action Buttons - Show when embedded */}
          {initialEmployeeId && (
            <div className="flex gap-2 justify-end mb-4">
              <Button
                onClick={() => setIsFolderModalOpen(true)}
                variant="outline"
              >
                <FolderPlus className="mr-2 h-4 w-4" />
                New Folder
              </Button>
              <Button onClick={() => setIsUploadModalOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Upload Document
              </Button>
            </div>
          )}

          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search documents..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  options={[
                    { value: "all", label: "All Categories" },
                    ...DOCUMENT_CATEGORIES.map((cat) => ({
                      value: cat,
                      label: cat.charAt(0).toUpperCase() + cat.slice(1),
                    })),
                  ]}
                />
                <Select
                  value={folderFilter}
                  onChange={(e) => setFolderFilter(e.target.value)}
                  options={[
                    { value: "all", label: "All Folders" },
                    { value: "none", label: "No Folder" },
                    ...folders.map((folder) => ({
                      value: folder.id,
                      label: folder.name,
                    })),
                  ]}
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant={showArchived ? "default" : "outline"}
                    onClick={() => setShowArchived(!showArchived)}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    {showArchived ? "Hide Archived" : "Show Archived"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Folders - show created folders so they're visible even when there are no documents */}
          {folders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Folder className="h-5 w-5" />
                  Folders
                </CardTitle>
                <CardDescription>
                  {folders.length} folder{folders.length !== 1 ? "s" : ""}.
                  Click a folder to filter documents, or use the &quot;All
                  Folders&quot; dropdown above.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {folders.map((folder) => (
                    <div
                      key={folder.id}
                      className={`flex items-center gap-2 px-4 py-3 rounded-none border transition-colors ${
                        folderFilter === folder.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-neutral-200 dark:border-neutral-700 hover:bg-muted/50"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setFolderFilter(folder.id)}
                        className="flex items-center gap-2 text-left flex-1 min-w-0"
                      >
                        <Folder className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="font-medium">{folder.name}</div>
                          {folder.description && (
                            <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                              {folder.description}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {
                              documents.filter((d) => d.folder_id === folder.id)
                                .length
                            }{" "}
                            document
                            {documents.filter((d) => d.folder_id === folder.id)
                              .length !== 1
                              ? "s"
                              : ""}
                          </div>
                        </div>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFolder(folder.id, folder.name);
                        }}
                        className="flex-shrink-0 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 p-1.5"
                        title="Remove folder"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Documents List */}
          <Card>
            <CardHeader>
              <CardTitle>
                Documents{" "}
                {selectedEmployee &&
                  `- ${selectedEmployee.name || selectedEmployee.email}`}
              </CardTitle>
              <CardDescription>
                {documents.length} document{documents.length !== 1 ? "s" : ""}{" "}
                found
                {folderFilter !== "all" &&
                  folderFilter !== "none" &&
                  folders.find((f) => f.id === folderFilter) && (
                    <span>
                      {" "}
                      in &quot;
                      {folders.find((f) => f.id === folderFilter)?.name}&quot;
                    </span>
                  )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No documents found.</p>
                  <p className="text-sm mt-2">
                    {folders.length > 0
                      ? "Upload a document or click a folder above to filter. Use the dropdown to show documents in a specific folder."
                      : "Upload a document to get started."}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className={`flex items-center justify-between p-4 border rounded-none hover:bg-muted/50 transition-colors cursor-pointer ${
                        doc.archived ? "opacity-60" : ""
                      } ${doc.is_expired ? "border-orange-500 bg-orange-50 dark:bg-orange-950" : ""}`}
                    >
                      <div
                        className="flex items-center gap-4 flex-1 min-w-0"
                        onClick={() => handleDownload(doc)}
                      >
                        <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium truncate hover:text-primary">
                              {doc.name}
                            </h3>
                            {doc.is_expired && (
                              <span className="text-xs bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 px-2 py-1 rounded flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Expired
                              </span>
                            )}
                            {doc.archived && (
                              <span className="text-xs bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 px-2 py-1 rounded">
                                Archived
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                            <span>{formatFileSize(doc.file_size)}</span>
                            <span className="capitalize">{doc.category}</span>
                            {doc.expiration_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Expires: {formatDateOnly(doc.expiration_date)}
                              </span>
                            )}
                            {doc.tags.length > 0 && (
                              <span className="flex items-center gap-1">
                                <Tag className="h-3 w-3" />
                                {doc.tags.join(", ")}
                              </span>
                            )}
                          </div>
                          {doc.description && (
                            <p className="text-sm text-muted-foreground mt-1 truncate">
                              {doc.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(doc);
                          }}
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(doc);
                          }}
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleArchiveDocument(doc.id, !doc.archived);
                          }}
                          title={doc.archived ? "Restore" : "Archive"}
                        >
                          {doc.archived ? (
                            <ArchiveRestore className="h-4 w-4" />
                          ) : (
                            <Archive className="h-4 w-4" />
                          )}
                        </Button>
                        {canDeleteEmployeeDocumentSync(
                          doc,
                          user?.id,
                          userRole,
                        ) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteDocument(doc.id);
                            }}
                            className="text-destructive hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Upload Modal */}
      <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Upload a new document for{" "}
              {selectedEmployee?.name || selectedEmployee?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">File</label>
              <Input
                type="file"
                accept=".pdf,application/pdf,image/*,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileSelect}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                PDF, images, or Word documents. Certifications can be uploaded
                as PDF.
              </p>
              {uploadForm.file && (
                <p className="text-sm text-muted-foreground mt-1">
                  Selected: {uploadForm.file.name} (
                  {formatFileSize(uploadForm.file.size)})
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">Document Name</label>
              <Input
                value={uploadForm.name}
                onChange={(e) =>
                  setUploadForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Enter document name"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={uploadForm.description}
                onChange={(e) =>
                  setUploadForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Enter description (optional)"
                className="mt-1"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Category</label>
                <Select
                  value={uploadForm.category}
                  onChange={(e) =>
                    setUploadForm((prev) => ({
                      ...prev,
                      category: e.target.value as DocumentCategory,
                    }))
                  }
                  options={DOCUMENT_CATEGORIES.map((cat) => ({
                    value: cat,
                    label: cat.charAt(0).toUpperCase() + cat.slice(1),
                  }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Folder</label>
                <Select
                  value={uploadForm.folderId}
                  onChange={(e) =>
                    setUploadForm((prev) => ({
                      ...prev,
                      folderId: e.target.value,
                    }))
                  }
                  options={[
                    { value: "", label: "No Folder" },
                    ...folders.map((folder) => ({
                      value: folder.id,
                      label: folder.name,
                    })),
                  ]}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">
                Expiration Date (Optional)
              </label>
              <Input
                type="date"
                value={uploadForm.expirationDate}
                onChange={(e) =>
                  setUploadForm((prev) => ({
                    ...prev,
                    expirationDate: e.target.value,
                  }))
                }
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsUploadModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploading || !uploadForm.file}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                "Upload"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Folder Modal */}
      <Dialog open={isFolderModalOpen} onOpenChange={setIsFolderModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
            <DialogDescription>
              Create a new folder to organize documents for{" "}
              {selectedEmployee?.name || selectedEmployee?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Folder Name</label>
              <Input
                value={folderForm.name}
                onChange={(e) =>
                  setFolderForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Enter folder name"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={folderForm.description}
                onChange={(e) =>
                  setFolderForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Enter description (optional)"
                className="mt-1"
                rows={3}
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                Parent Folder (Optional)
              </label>
              <Select
                value={folderForm.parentFolderId}
                onChange={(e) =>
                  setFolderForm((prev) => ({
                    ...prev,
                    parentFolderId: e.target.value,
                  }))
                }
                options={[
                  { value: "", label: "None (Root Level)" },
                  ...folders.map((folder) => ({
                    value: folder.id,
                    label: folder.name,
                  })),
                ]}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsFolderModalOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateFolder}>Create Folder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Document Modal */}
      <Dialog
        open={isEditModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsEditModalOpen(false);
            setSelectedDocument(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
            <DialogDescription>
              Update name, description, category, folder, or expiration date
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Document Name</label>
              <Input
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Enter document name"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                value={editForm.description}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Optional description"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Category</label>
                <Select
                  value={editForm.category}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      category: e.target.value as DocumentCategory,
                    }))
                  }
                  options={DOCUMENT_CATEGORIES.map((cat) => ({
                    value: cat,
                    label: cat.charAt(0).toUpperCase() + cat.slice(1),
                  }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Folder</label>
                <Select
                  value={editForm.folderId}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      folderId: e.target.value,
                    }))
                  }
                  options={[
                    { value: "", label: "No Folder" },
                    ...folders.map((folder) => ({
                      value: folder.id,
                      label: folder.name,
                    })),
                  ]}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">
                Expiration Date (Optional)
              </label>
              <Input
                type="date"
                value={editForm.expirationDate}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    expirationDate: e.target.value,
                  }))
                }
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditModalOpen(false);
                setSelectedDocument(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={savingEdit || !editForm.name.trim()}
            >
              {savingEdit ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
