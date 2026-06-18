import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  jobRequisitionsService,
  JobRequisition,
  getJobRequisitionDisplayHtml,
} from "../../../services/hr/jobRequisitionsService";
import {
  candidatesService,
  CreateCandidateInput,
} from "../../../services/hr/candidatesService";
import { eeoComplianceService } from "../../../services/hr/eeoComplianceService";
import { supabase } from "../../../lib/supabase";
import { toast } from "../../../components/ui/toast";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/Dialog";
import {
  Search,
  MapPin,
  Briefcase,
  DollarSign,
  Upload,
  X,
  FileText,
  Mail,
  Phone,
  User,
  Shirt,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export const PublicCareerPage: React.FC = () => {
  const [approvedRequisitions, setApprovedRequisitions] = useState<
    JobRequisition[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [isApplicationModalOpen, setIsApplicationModalOpen] = useState(false);
  const [selectedRequisition, setSelectedRequisition] =
    useState<JobRequisition | null>(null);
  const [expandedRequisitionId, setExpandedRequisitionId] = useState<
    string | null
  >(null);

  // Application form state
  const [applicationForm, setApplicationForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    location: "",
    cover_letter: "",
    resume: null as File | null,
    eeo_gender: "",
    eeo_race: "",
    eeo_veteran: false,
    eeo_disability: false,
    fr_shirt_size: "",
    fr_pant_size: "",
    fr_jacket_size: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    fetchApprovedRequisitions();
  }, []);

  const fetchApprovedRequisitions = async () => {
    try {
      setLoading(true);
      const all = await jobRequisitionsService.getAll();
      // Only show approved and posted requisitions on public page
      const approved = all.filter(
        (req) => req.status === "approved" || req.status === "posted",
      );
      setApprovedRequisitions(approved);
    } catch (error: any) {
      console.error("Error fetching approved requisitions:", error);
      toast({
        title: "Error",
        description: "Failed to load job listings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openApplicationModal = (requisition: JobRequisition) => {
    setSelectedRequisition(requisition);
    setIsApplicationModalOpen(true);
    // Reset form
    setApplicationForm({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      location: "",
      cover_letter: "",
      resume: null,
      eeo_gender: "",
      eeo_race: "",
      eeo_veteran: false,
      eeo_disability: false,
      fr_shirt_size: "",
      fr_pant_size: "",
      fr_jacket_size: "",
    });
    setUploadProgress(0);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF or Word document",
          variant: "destructive",
        });
        return;
      }
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please upload a file smaller than 10MB",
          variant: "destructive",
        });
        return;
      }
      setApplicationForm({ ...applicationForm, resume: file });
    }
  };

  const handleSubmitApplication = async () => {
    if (!selectedRequisition) return;

    // Validate required fields
    if (
      !applicationForm.first_name.trim() ||
      !applicationForm.last_name.trim()
    ) {
      toast({
        title: "Validation Error",
        description: "Please enter your first and last name",
        variant: "destructive",
      });
      return;
    }

    if (!applicationForm.email.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter your email address",
        variant: "destructive",
      });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(applicationForm.email)) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    if (!applicationForm.resume) {
      toast({
        title: "Validation Error",
        description: "Please upload your resume",
        variant: "destructive",
      });
      return;
    }

    if (!applicationForm.eeo_gender.trim()) {
      toast({
        title: "Validation Error",
        description: "Please select your gender for EEO reporting",
        variant: "destructive",
      });
      return;
    }

    if (!applicationForm.eeo_race.trim()) {
      toast({
        title: "Validation Error",
        description: "Please select your race/ethnicity for EEO reporting",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(0);

    try {
      let resumeUrl = "";

      // Upload resume to Supabase Storage
      if (applicationForm.resume) {
        setUploadProgress(20);
        const fileExt = applicationForm.resume.name.split(".").pop();
        const fileName = `resumes/${selectedRequisition.id}/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("resumes")
          .upload(fileName, applicationForm.resume, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          throw new Error(`Failed to upload resume: ${uploadError.message}`);
        }

        setUploadProgress(60);

        // Get public URL
        const {
          data: { publicUrl },
        } = supabase.storage.from("resumes").getPublicUrl(fileName);

        resumeUrl = publicUrl;
        setUploadProgress(80);
      }

      // Create candidate record (no EEO data — stored separately for compliance)
      const candidateData: CreateCandidateInput = {
        first_name: applicationForm.first_name.trim(),
        last_name: applicationForm.last_name.trim(),
        email: applicationForm.email.trim(),
        phone: applicationForm.phone.trim() || undefined,
        location: applicationForm.location.trim() || undefined,
        position_applied: selectedRequisition.title,
        requisition_id: selectedRequisition.id,
        status: "new",
        source: "Career Page",
        resume_url: resumeUrl || undefined,
        cover_letter: applicationForm.cover_letter.trim() || undefined,
        fr_shirt_size: applicationForm.fr_shirt_size.trim() || undefined,
        fr_pant_size: applicationForm.fr_pant_size.trim() || undefined,
        fr_jacket_size: applicationForm.fr_jacket_size.trim() || undefined,
      };

      setUploadProgress(90);
      await candidatesService.create(candidateData);

      // Save EEO data anonymously to the compliance table (no candidate identifiers)
      try {
        await eeoComplianceService.submit({
          requisition_id: selectedRequisition.id,
          position_title: selectedRequisition.title,
          department: selectedRequisition.department || undefined,
          gender: applicationForm.eeo_gender || undefined,
          race: applicationForm.eeo_race || undefined,
          veteran: applicationForm.eeo_veteran || false,
          disability: applicationForm.eeo_disability || false,
          candidate_status: "new",
        });
      } catch (eeoErr) {
        console.error("EEO submission failed (non-blocking):", eeoErr);
      }
      setUploadProgress(100);

      toast({
        title: "Application Submitted",
        description:
          "Thank you for your application! We will review it and get back to you soon.",
        variant: "success",
      });

      // Close modal and reset form
      setIsApplicationModalOpen(false);
      setApplicationForm({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        location: "",
        cover_letter: "",
        resume: null,
        eeo_gender: "",
        eeo_race: "",
        eeo_veteran: false,
        eeo_disability: false,
        fr_shirt_size: "",
        fr_pant_size: "",
        fr_jacket_size: "",
      });
      setUploadProgress(0);
    } catch (error: any) {
      console.error("Error submitting application:", error);
      toast({
        title: "Error",
        description:
          error.message || "Failed to submit application. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
    }
  };

  const filteredRequisitions = approvedRequisitions.filter((req) => {
    const matchesSearch =
      req.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter =
      filterDepartment === "all" || req.department === filterDepartment;
    return matchesSearch && matchesFilter;
  });

  const departments = Array.from(
    new Set(approvedRequisitions.map((req) => req.department)),
  );

  const formatSalaryRange = (min?: number, max?: number) => {
    if (!min && !max) return "Competitive";
    if (min && max)
      return `$${min.toLocaleString()} - $${max.toLocaleString()}`;
    if (min) return `$${min.toLocaleString()}+`;
    if (max) return `Up to $${max.toLocaleString()}`;
    return "Competitive";
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-neutral-800 shadow-sm border-b border-neutral-200 dark:border-neutral-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/" className="flex-shrink-0">
                <img
                  src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
                  alt="AMP Logo"
                  className="h-10 cursor-pointer hover:opacity-80 transition-opacity"
                />
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
                  Join Our Team
                </h1>
                <p className="text-neutral-600 dark:text-neutral-400 mt-1">
                  Explore exciting career opportunities
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search and Filters */}
        <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700 p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400" />
              <input
                type="text"
                placeholder="Search jobs by title, department, or location..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-transparent"
              />
            </div>
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="px-4 py-2.5 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-transparent"
            >
              <option value="all">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Job Listings */}
        {loading ? (
          <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700 p-12">
            <div className="text-center">
              <LoadingSpinner size="md" />
            </div>
          </div>
        ) : filteredRequisitions.length === 0 ? (
          <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700 p-12">
            <div className="text-center">
              <Briefcase className="mx-auto h-12 w-12 text-neutral-400" />
              <h3 className="mt-4 text-lg font-medium text-neutral-900 dark:text-white">
                No positions available
              </h3>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                Check back soon for new opportunities
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredRequisitions.map((req) => (
              <div
                key={req.id}
                className="bg-white dark:bg-neutral-800 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-3">
                      {req.title}
                    </h2>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" />
                        {req.location}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Briefcase className="h-4 w-4" />
                        {req.department}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <DollarSign className="h-4 w-4" />
                        {formatSalaryRange(
                          req.salary_range_min,
                          req.salary_range_max,
                        )}
                      </span>
                      {req.employment_type && (
                        <span className="px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300">
                          {req.employment_type}
                        </span>
                      )}
                    </div>
                    {(req.description || req.requirements) && (
                      <div className="mb-4">
                        <div
                          className={`text-neutral-700 dark:text-neutral-300 prose prose-sm max-w-none [&_p]:m-0 [&_p]:mb-2 [&_ul]:my-2 [&_ol]:my-2 ${expandedRequisitionId === req.id ? "" : "line-clamp-3"}`}
                          dangerouslySetInnerHTML={{
                            __html: getJobRequisitionDisplayHtml(req, {
                              excludeNotes: true,
                            }),
                          }}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedRequisitionId((prev) =>
                              prev === req.id ? null : req.id,
                            )
                          }
                          className="mt-2 flex items-center gap-1 text-sm font-medium text-[#f26722] hover:text-[#e55611] focus:outline-none"
                        >
                          {expandedRequisitionId === req.id ? (
                            <>
                              <ChevronUp className="h-4 w-4" />
                              Show less
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-4 w-4" />
                              Show full description
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    <Button
                      onClick={() => openApplicationModal(req)}
                      className="bg-[#f26722] hover:bg-[#f26722]/90 text-white w-full lg:w-auto"
                    >
                      Apply Now
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto bg-white dark:bg-neutral-800 border-t border-neutral-200 dark:border-neutral-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-sm text-neutral-600 dark:text-neutral-400">
            <p>
              © {new Date().getFullYear()} AMP Quality Electrical Services. All
              rights reserved.
            </p>
            <div className="mt-4 flex justify-center gap-6">
              <Link
                to="/privacy"
                className="hover:text-[#f26722] transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                to="/eula"
                className="hover:text-[#f26722] transition-colors"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </footer>

      {/* Application Modal */}
      <Dialog
        open={isApplicationModalOpen}
        onOpenChange={setIsApplicationModalOpen}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Apply for {selectedRequisition?.title}</DialogTitle>
            <DialogDescription>
              Please fill out the form below to submit your application
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Personal Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={applicationForm.first_name}
                    onChange={(e) =>
                      setApplicationForm({
                        ...applicationForm,
                        first_name: e.target.value,
                      })
                    }
                    placeholder="John"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={applicationForm.last_name}
                    onChange={(e) =>
                      setApplicationForm({
                        ...applicationForm,
                        last_name: e.target.value,
                      })
                    }
                    placeholder="Doe"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <Input
                  type="email"
                  value={applicationForm.email}
                  onChange={(e) =>
                    setApplicationForm({
                      ...applicationForm,
                      email: e.target.value,
                    })
                  }
                  placeholder="john.doe@example.com"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Phone
                  </label>
                  <Input
                    type="tel"
                    value={applicationForm.phone}
                    onChange={(e) =>
                      setApplicationForm({
                        ...applicationForm,
                        phone: e.target.value,
                      })
                    }
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Location
                  </label>
                  <Input
                    value={applicationForm.location}
                    onChange={(e) =>
                      setApplicationForm({
                        ...applicationForm,
                        location: e.target.value,
                      })
                    }
                    placeholder="City, State"
                  />
                </div>
              </div>
            </div>

            {/* Resume Upload */}
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Resume <span className="text-red-500">*</span>
              </h3>
              <div className="border-2 border-dashed border-neutral-300 dark:border-neutral-600 rounded-lg p-6">
                <input
                  type="file"
                  id="resume-upload"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label
                  htmlFor="resume-upload"
                  className="cursor-pointer flex flex-col items-center justify-center"
                >
                  <Upload className="h-8 w-8 text-neutral-400 mb-2" />
                  <span className="text-sm text-neutral-600 dark:text-neutral-400">
                    {applicationForm.resume
                      ? applicationForm.resume.name
                      : "Click to upload resume (PDF or Word)"}
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                    Max file size: 10MB
                  </span>
                </label>
                {applicationForm.resume && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                    <FileText className="h-4 w-4" />
                    <span>{applicationForm.resume.name}</span>
                    <button
                      onClick={() =>
                        setApplicationForm({ ...applicationForm, resume: null })
                      }
                      className="ml-auto text-red-500 hover:text-red-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Cover Letter */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Notes (Optional)
              </label>
              <textarea
                value={applicationForm.cover_letter}
                onChange={(e) =>
                  setApplicationForm({
                    ...applicationForm,
                    cover_letter: e.target.value,
                  })
                }
                placeholder="Tell us why you're interested in this position..."
                rows={5}
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-transparent resize-none"
              />
            </div>

            {/* EEO Information (Required) */}
            <div className="space-y-4 border-t border-neutral-200 dark:border-neutral-700 pt-4">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
                Equal Employment Opportunity{" "}
                <span className="text-red-500">*</span>
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                This information is required for compliance reporting and will
                be kept confidential.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Gender <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={applicationForm.eeo_gender}
                    onChange={(e) =>
                      setApplicationForm({
                        ...applicationForm,
                        eeo_gender: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-transparent"
                  >
                    <option value="">Select...</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Non-binary">Non-binary</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Race/Ethnicity <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={applicationForm.eeo_race}
                    onChange={(e) =>
                      setApplicationForm({
                        ...applicationForm,
                        eeo_race: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-transparent"
                  >
                    <option value="">Select...</option>
                    <option value="American Indian or Alaska Native">
                      American Indian or Alaska Native
                    </option>
                    <option value="Asian">Asian</option>
                    <option value="Black or African American">
                      Black or African American
                    </option>
                    <option value="Hispanic or Latino">
                      Hispanic or Latino
                    </option>
                    <option value="Native Hawaiian or Other Pacific Islander">
                      Native Hawaiian or Other Pacific Islander
                    </option>
                    <option value="White">White</option>
                    <option value="Two or More Races">Two or More Races</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={applicationForm.eeo_veteran}
                    onChange={(e) =>
                      setApplicationForm({
                        ...applicationForm,
                        eeo_veteran: e.target.checked,
                      })
                    }
                    className="rounded border-neutral-300 text-[#f26722] focus:ring-[#f26722]"
                  />
                  <span className="text-sm text-neutral-700 dark:text-neutral-300">
                    I identify as a protected veteran
                  </span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={applicationForm.eeo_disability}
                    onChange={(e) =>
                      setApplicationForm({
                        ...applicationForm,
                        eeo_disability: e.target.checked,
                      })
                    }
                    className="rounded border-neutral-300 text-[#f26722] focus:ring-[#f26722]"
                  />
                  <span className="text-sm text-neutral-700 dark:text-neutral-300">
                    I have a disability
                  </span>
                </label>
              </div>

              {/* FR (Flame-Resistant) clothing sizes - optional; used for field roles */}
              <div className="space-y-3 pt-4 border-t border-neutral-200 dark:border-neutral-700 mt-4">
                <h4 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                  <Shirt className="h-4 w-4 text-[#f26722]" />
                  FR clothing sizes (Required)
                </h4>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  If this role may require flame-resistant (FR) clothing,
                  provide your sizes. You can update these in your profile after
                  hire if needed.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Shirt
                    </label>
                    <Input
                      value={applicationForm.fr_shirt_size}
                      onChange={(e) =>
                        setApplicationForm({
                          ...applicationForm,
                          fr_shirt_size: e.target.value,
                        })
                      }
                      placeholder="e.g. M, L, XL"
                      className="bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Pants
                    </label>
                    <Input
                      value={applicationForm.fr_pant_size}
                      onChange={(e) =>
                        setApplicationForm({
                          ...applicationForm,
                          fr_pant_size: e.target.value,
                        })
                      }
                      placeholder="e.g. 32x30"
                      className="bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Jacket
                    </label>
                    <Input
                      value={applicationForm.fr_jacket_size}
                      onChange={(e) =>
                        setApplicationForm({
                          ...applicationForm,
                          fr_jacket_size: e.target.value,
                        })
                      }
                      placeholder="e.g. L, XL"
                      className="bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Upload Progress */}
            {isSubmitting && uploadProgress > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-600 dark:text-neutral-400">
                    Uploading...
                  </span>
                  <span className="text-neutral-600 dark:text-neutral-400">
                    {uploadProgress}%
                  </span>
                </div>
                <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
                  <div
                    className="bg-[#f26722] h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsApplicationModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitApplication}
              disabled={isSubmitting}
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            >
              {isSubmitting ? "Submitting..." : "Submit Application"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
