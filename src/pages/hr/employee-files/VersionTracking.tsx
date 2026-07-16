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
  Award,
  Plus,
  Edit,
  Trash2,
  Calendar,
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  X,
  Search,
  Filter,
  Upload,
} from "lucide-react";
import {
  employeeCertificationsService,
  EmployeeCertification,
  CERT_TYPES,
  CERT_CATEGORIES,
  CERT_STATUSES,
  getCertificationStatus,
  formatDate,
} from "../../../services/hr/employeeCertificationsService";
import { uploadEmployeeDocument } from "../../../services/hr/employeeDocumentsService";
import { toDateOnlyISO } from "../../../services/hr/dateUtils";
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

interface VersionTrackingProps {
  initialEmployeeId?: string;
}

export const VersionTracking: React.FC<VersionTrackingProps> = ({
  initialEmployeeId,
}) => {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(
    initialEmployeeId || "",
  );
  const [certifications, setCertifications] = useState<EmployeeCertification[]>(
    [],
  );
  const [loading, setLoading] = useState(true);

  // Tab/Category filter
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modal states
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);
  const [editingCert, setEditingCert] = useState<EmployeeCertification | null>(
    null,
  );
  const [certFile, setCertFile] = useState<File | null>(null);

  // Form state
  const [certForm, setCertForm] = useState({
    cert_name: "",
    cert_type: "certification" as const,
    cert_category: "professional",
    cert_number: "",
    issuing_organization: "",
    cert_date: "",
    expiration_date: "",
    renewal_date: "",
    renewal_required: true,
    status: "active" as const,
    document_id: "",
    notes: "",
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
      fetchCertifications();
    } else {
      setCertifications([]);
    }
  }, [selectedEmployeeId, activeTab, statusFilter]);

  const fetchUsers = async () => {
    try {
      setLoading(true);

      // Try to use admin_get_users RPC function
      let { data: adminData, error: adminError } = await supabase
        .schema("common")
        .rpc("admin_get_users");

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
    } finally {
      setLoading(false);
    }
  };

  const fetchCertifications = async () => {
    if (!selectedEmployeeId) return;

    try {
      setLoading(true);
      const filter: any = {
        employeeId: selectedEmployeeId,
      };

      if (activeTab !== "all") {
        filter.certCategory = activeTab;
      }

      if (statusFilter !== "all") {
        filter.status = statusFilter;
      }

      const data =
        await employeeCertificationsService.fetchCertifications(filter);

      // Apply search filter client-side
      let filteredData = data;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filteredData = data.filter(
          (cert) =>
            cert.cert_name.toLowerCase().includes(query) ||
            cert.cert_number?.toLowerCase().includes(query) ||
            cert.issuing_organization?.toLowerCase().includes(query) ||
            cert.notes?.toLowerCase().includes(query),
        );
      }

      setCertifications(filteredData);
    } catch (error: any) {
      console.error("Error fetching certifications:", error);
      toast({
        title: "Error",
        description: "Failed to load certifications. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCertModal = (cert?: EmployeeCertification) => {
    if (cert) {
      setEditingCert(cert);
      setCertForm({
        cert_name: cert.cert_name,
        cert_type: cert.cert_type,
        cert_category: cert.cert_category,
        cert_number: cert.cert_number || "",
        issuing_organization: cert.issuing_organization || "",
        cert_date: cert.cert_date,
        expiration_date: cert.expiration_date || "",
        renewal_date: cert.renewal_date || "",
        renewal_required: cert.renewal_required,
        status: cert.status,
        document_id: cert.document_id || "",
        notes: cert.notes || "",
      });
    } else {
      setEditingCert(null);
      setCertForm({
        cert_name: "",
        cert_type: "certification",
        cert_category: "professional",
        cert_number: "",
        issuing_organization: "",
        cert_date: "",
        expiration_date: "",
        renewal_date: "",
        renewal_required: true,
        status: "active",
        document_id: "",
        notes: "",
      });
    }
    setCertFile(null);
    setIsCertModalOpen(true);
  };

  const handleSaveCert = async () => {
    if (!selectedEmployeeId || !certForm.cert_name || !certForm.cert_date) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      let documentId: string | null = certForm.document_id || null;
      if (certFile && selectedEmployeeId) {
        const doc = await uploadEmployeeDocument({
          file: certFile,
          employeeId: selectedEmployeeId,
          name: certForm.cert_name + " (certification)",
          category: "certifications",
          expirationDate: toDateOnlyISO(certForm.expiration_date) || null,
        });
        documentId = doc.id;
      }

      const certData = {
        employee_id: selectedEmployeeId,
        cert_name: certForm.cert_name,
        cert_type: certForm.cert_type,
        cert_category: certForm.cert_category,
        cert_number: certForm.cert_number || null,
        issuing_organization: certForm.issuing_organization || null,
        cert_date: toDateOnlyISO(certForm.cert_date) || certForm.cert_date,
        expiration_date: toDateOnlyISO(certForm.expiration_date) || null,
        renewal_date: toDateOnlyISO(certForm.renewal_date) || null,
        renewal_required: certForm.renewal_required,
        status: certForm.status,
        document_id: documentId,
        notes: certForm.notes || null,
        created_by: user?.id || "",
      };

      if (editingCert) {
        await employeeCertificationsService.updateCertification(
          editingCert.id,
          certData,
        );
        toast({
          title: "Success",
          description: "Certification updated successfully.",
        });
      } else {
        await employeeCertificationsService.createCertification(certData);
        toast({
          title: "Success",
          description: "Certification added successfully.",
        });
      }

      setIsCertModalOpen(false);
      setCertFile(null);
      fetchCertifications();
    } catch (error: any) {
      console.error("Error saving certification:", error);
      toast({
        title: "Error",
        description:
          error.message || "Failed to save certification. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCert = async (certId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this certification? This action cannot be undone.",
      )
    ) {
      return;
    }

    try {
      await employeeCertificationsService.deleteCertification(certId);
      toast({
        title: "Success",
        description: "Certification deleted successfully.",
      });
      fetchCertifications();
    } catch (error: any) {
      console.error("Error deleting certification:", error);
      toast({
        title: "Error",
        description: "Failed to delete certification. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (cert: EmployeeCertification) => {
    const statusInfo = getCertificationStatus(cert);

    if (statusInfo.isExpired) {
      return (
        <span className="text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 px-2 py-1 rounded flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Expired
        </span>
      );
    }

    if (statusInfo.isExpiringSoon) {
      return (
        <span className="text-xs bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 px-2 py-1 rounded flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Expires in {statusInfo.daysUntilExpiration} days
        </span>
      );
    }

    if (cert.status === "active") {
      return (
        <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-1 rounded flex items-center gap-1">
          <CheckCircle className="h-3 w-3" />
          Active
        </span>
      );
    }

    return (
      <span className="text-xs bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 px-2 py-1 rounded capitalize">
        {cert.status.replace("_", " ")}
      </span>
    );
  };

  const selectedEmployee = users.find((u) => u.id === selectedEmployeeId);
  const tabs = [
    { id: "all", label: "All" },
    ...CERT_CATEGORIES.map((cat) => ({
      id: cat,
      label: cat.charAt(0).toUpperCase() + cat.slice(1),
    })),
  ];

  // Group certifications by category for tab counts
  const certsByCategory = certifications.reduce(
    (acc, cert) => {
      const cat = cert.cert_category || "other";
      acc[cat] = (acc[cat] || 0) + 1;
      acc.all = (acc.all || 0) + 1;
      return acc;
    },
    { all: 0 } as Record<string, number>,
  );

  const filteredCerts =
    activeTab === "all"
      ? certifications
      : certifications.filter((cert) => cert.cert_category === activeTab);

  return (
    <div className="space-y-6">
      {!initialEmployeeId && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Version/Expiration Tracking</h1>
            <p className="text-muted-foreground mt-1">
              Track certifications, licenses, and renewals
            </p>
          </div>
          {selectedEmployeeId && (
            <Button onClick={() => handleOpenCertModal()} leftIcon={<Plus className="h-4 w-4" />}>
              Add Certification
            </Button>
          )}
        </div>
      )}

      {/* Action Button - Show when embedded */}
      {initialEmployeeId && selectedEmployeeId && (
        <div className="flex gap-2 justify-end">
          <Button onClick={() => handleOpenCertModal()} leftIcon={<Plus className="h-4 w-4" />}>
            Add Certification
          </Button>
        </div>
      )}

      {/* User Selection - Only show if no initialEmployeeId */}
      {!initialEmployeeId && (
        <Card>
          <CardHeader>
            <CardTitle>Select User</CardTitle>
            <CardDescription>
              Choose a user to view and manage their certifications
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
          {/* Tabs and Filters */}
          <Card>
            <CardContent className="pt-6">
              {/* Tabs */}
              <div className="flex space-x-1 border-b mb-4">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.label} ({certsByCategory[tab.id] || 0})
                  </button>
                ))}
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search certifications..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  options={[
                    { value: "all", label: "All Statuses" },
                    ...CERT_STATUSES.map((status) => ({
                      value: status,
                      label:
                        status.charAt(0).toUpperCase() +
                        status.slice(1).replace("_", " "),
                    })),
                  ]}
                />
              </div>
            </CardContent>
          </Card>

          {/* Certifications List */}
          <Card>
            <CardHeader>
              <CardTitle>
                Certifications{" "}
                {selectedEmployee &&
                  `- ${selectedEmployee.name || selectedEmployee.email}`}
              </CardTitle>
              <CardDescription>
                {filteredCerts.length} certification
                {filteredCerts.length !== 1 ? "s" : ""} found
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredCerts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Award className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No certifications found.</p>
                  <p className="text-sm mt-2">
                    Add a certification to get started.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredCerts.map((cert) => {
                    const statusInfo = getCertificationStatus(cert);
                    return (
                      <div
                        key={cert.id}
                        className={`flex items-center justify-between p-4 border rounded-none hover:bg-muted/50 transition-colors ${
                          statusInfo.isExpired
                            ? "border-red-500 bg-red-50 dark:bg-red-950"
                            : statusInfo.isExpiringSoon
                              ? "border-orange-500 bg-orange-50 dark:bg-orange-950"
                              : ""
                        }`}
                      >
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <Award className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium truncate">
                                {cert.cert_name}
                              </h3>
                              {getStatusBadge(cert)}
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                              <span className="capitalize">
                                {cert.cert_type}
                              </span>
                              {cert.cert_number && (
                                <span>#{cert.cert_number}</span>
                              )}
                              {cert.issuing_organization && (
                                <span>
                                  Issued by: {cert.issuing_organization}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Cert Date: {formatDate(cert.cert_date)}
                              </span>
                              {cert.expiration_date && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Expires: {formatDate(cert.expiration_date)}
                                </span>
                              )}
                              {cert.renewal_date && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Renewal: {formatDate(cert.renewal_date)}
                                </span>
                              )}
                            </div>
                            {cert.notes && (
                              <p className="text-sm text-muted-foreground mt-1 truncate">
                                {cert.notes}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenCertModal(cert)}
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteCert(cert.id)}
                            className="text-destructive hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Certification Modal */}
      <Dialog open={isCertModalOpen} onOpenChange={setIsCertModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCert ? "Edit Certification" : "Add Certification"}
            </DialogTitle>
            <DialogDescription>
              {editingCert
                ? "Update certification details"
                : `Add a new certification for ${selectedEmployee?.name || selectedEmployee?.email}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">
                Certification Name *
              </label>
              <Input
                value={certForm.cert_name}
                onChange={(e) =>
                  setCertForm((prev) => ({
                    ...prev,
                    cert_name: e.target.value,
                  }))
                }
                placeholder="e.g., Professional Engineer License"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Type *</label>
                <Select
                  value={certForm.cert_type}
                  onChange={(e) =>
                    setCertForm((prev) => ({
                      ...prev,
                      cert_type: e.target.value as any,
                    }))
                  }
                  options={CERT_TYPES.map((type) => ({
                    value: type,
                    label: type.charAt(0).toUpperCase() + type.slice(1),
                  }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Category *</label>
                <Select
                  value={certForm.cert_category}
                  onChange={(e) =>
                    setCertForm((prev) => ({
                      ...prev,
                      cert_category: e.target.value,
                    }))
                  }
                  options={CERT_CATEGORIES.map((cat) => ({
                    value: cat,
                    label: cat.charAt(0).toUpperCase() + cat.slice(1),
                  }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">
                  Certificate Number
                </label>
                <Input
                  value={certForm.cert_number}
                  onChange={(e) =>
                    setCertForm((prev) => ({
                      ...prev,
                      cert_number: e.target.value,
                    }))
                  }
                  placeholder="License/cert number"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">
                  Issuing Organization
                </label>
                <Input
                  value={certForm.issuing_organization}
                  onChange={(e) =>
                    setCertForm((prev) => ({
                      ...prev,
                      issuing_organization: e.target.value,
                    }))
                  }
                  placeholder="e.g., State Board, OSHA"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">
                  Certification Date *
                </label>
                <Input
                  type="date"
                  value={certForm.cert_date}
                  onChange={(e) =>
                    setCertForm((prev) => ({
                      ...prev,
                      cert_date: e.target.value,
                    }))
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Expiration Date</label>
                <Input
                  type="date"
                  value={certForm.expiration_date}
                  onChange={(e) =>
                    setCertForm((prev) => ({
                      ...prev,
                      expiration_date: e.target.value,
                    }))
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Renewal Date</label>
                <Input
                  type="date"
                  value={certForm.renewal_date}
                  onChange={(e) =>
                    setCertForm((prev) => ({
                      ...prev,
                      renewal_date: e.target.value,
                    }))
                  }
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select
                  value={certForm.status}
                  onChange={(e) =>
                    setCertForm((prev) => ({
                      ...prev,
                      status: e.target.value as any,
                    }))
                  }
                  options={CERT_STATUSES.map((status) => ({
                    value: status,
                    label:
                      status.charAt(0).toUpperCase() +
                      status.slice(1).replace("_", " "),
                  }))}
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={certForm.renewal_required}
                    onChange={(e) =>
                      setCertForm((prev) => ({
                        ...prev,
                        renewal_required: e.target.checked,
                      }))
                    }
                    className="rounded"
                  />
                  <span className="text-sm font-medium">Renewal Required</span>
                </label>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                value={certForm.notes}
                onChange={(e) =>
                  setCertForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Additional notes..."
                className="mt-1"
                rows={3}
              />
            </div>
            <div>
              <label className="text-sm font-medium flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Attach PDF or document
              </label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-1">
                Upload the certificate PDF or image. It will be saved to this
                employee&apos;s documents and linked to this certification.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".pdf,application/pdf,image/*,.png,.jpg,.jpeg,.gif,.webp"
                  onChange={(e) => setCertFile(e.target.files?.[0] || null)}
                  className="mt-1 flex-1"
                />
                {certFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setCertFile(null)}
                    className="text-muted-foreground hover:text-foreground"
                    title="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {certFile && (
                <p className="text-sm text-muted-foreground mt-1">
                  Selected: {certFile.name}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCertModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveCert} disabled={loading}>
              {loading ? (
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
