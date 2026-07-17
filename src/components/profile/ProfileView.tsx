import React, { useState, useEffect, useCallback } from "react";
import {
  MapPin,
  Briefcase,
  Mail,
  Edit2,
  X,
  User,
  Building2,
  FileText,
  Award,
  History,
  ExternalLink,
  DollarSign,
  Phone,
  Target,
  ClipboardList,
  TrendingUp,
  Shirt,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useManagerReportIds } from "@/lib/hooks/useManagerReportIds";
import { User as SupabaseUser } from "@supabase/supabase-js";
import { EditProfilePopup } from "./EditProfilePopup";
import {
  fetchEmployeeDocuments,
  updateEmployeeDocument,
} from "@/services/hr/employeeDocumentsService";
import {
  fetchCertifications,
  updateCertification,
} from "@/services/hr/employeeCertificationsService";
import { formatDivisionDisplay } from "@/lib/utils/divisionDisplay";
import { OneOnOneList } from "@/components/hr/OneOnOneList";
import { formatDateOnly, toDateOnlyISO } from "@/services/hr/dateUtils";
import { toast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface ProfileViewProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string; // Optional: for viewing other users' profiles
  /** When true, hide personal/sensitive info (phone, email, birthday, emergency contact, compensation) - for non-Admin viewers */
  limitedView?: boolean;
}

// Define the structure of user data
interface UserData extends SupabaseUser {
  user_metadata: {
    name?: string;
    role?: string;
    bio?: string;
    division?: string;
    birthday?: string;
    job_title?: string;
    department?: string;
    current_compensation_amount?: number | null;
    current_pay_type?: string | null;
    current_pay_frequency?: string | null;
    profileImage?: string;
    coverImage?: string;
    work_phone?: string;
    personal_phone?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    emergency_contact_relationship?: string;
    goals?: string;
    [key: string]: any;
  };
  email?: string;
}

// Simple component for the enlarged photo view
const EnlargedPhotoView: React.FC<{ src: string; onClose: () => void }> = ({
  src,
  onClose,
}) => {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md"
      onClick={onClose} // Close on background click
    >
      <div className="relative max-w-3xl max-h-[80vh]">
        <img
          src={src}
          alt="Enlarged Profile"
          className="block max-w-full max-h-full object-contain rounded-none shadow-xl"
        />
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-white bg-black/30 hover:bg-black/50 rounded-none p-1.5"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};

export const ProfileView: React.FC<ProfileViewProps> = ({
  isOpen,
  onClose,
  userId,
  limitedView = false,
}) => {
  const { user } = useAuth();
  const {
    reportIds,
    loading: reportIdsLoading,
    refetch: refetchReportIds,
  } = useManagerReportIds(user?.id);

  // Refetch org chart when opening a report's profile so we have latest before checking access
  useEffect(() => {
    if (isOpen && userId && userId !== user?.id) refetchReportIds();
  }, [isOpen, userId, user?.id, refetchReportIds]);

  const [profileUser, setProfileUser] = useState<UserData | null>(
    userId ? null : (user as UserData),
  );
  const [accessDenied, setAccessDenied] = useState(false);
  const [isPhotoEnlarged, setIsPhotoEnlarged] = useState(false);
  const [enlargedPhotoSrc, setEnlargedPhotoSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!!userId);
  const [attemptedMethods, setAttemptedMethods] = useState<string[]>([]);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [myDocuments, setMyDocuments] = useState<
    Array<{
      id: string;
      name: string;
      description?: string | null;
      category: string;
      file_url: string;
      created_at: string;
      expiration_date?: string | null;
    }>
  >([]);
  const [myCertifications, setMyCertifications] = useState<
    Array<{
      id: string;
      cert_name: string;
      cert_type: string;
      status: string;
      cert_date?: string;
      expiration_date?: string | null;
      renewal_date?: string | null;
      notes?: string | null;
    }>
  >([]);
  const [myTitleHistory, setMyTitleHistory] = useState<
    Array<{ id: string; title: string; effective_from: string }>
  >([]);
  const [myCompensationHistory, setMyCompensationHistory] = useState<
    Array<{
      id: string;
      amount: number;
      pay_type: string;
      pay_frequency: string | null;
      effective_from: string;
    }>
  >([]);
  const [loadingMyData, setLoadingMyData] = useState(false);
  const [editingDocument, setEditingDocument] = useState<{
    id: string;
    name: string;
    description: string;
    expiration_date: string;
  } | null>(null);
  const [editingCertification, setEditingCertification] = useState<{
    id: string;
    cert_name: string;
    cert_date: string;
    expiration_date: string;
    renewal_date: string;
    status: string;
    notes: string;
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [frSizes, setFrSizes] = useState<{
    shirt: string;
    pant: string;
    jacket: string;
    updated_at: string | null;
  }>({ shirt: "", pant: "", jacket: "", updated_at: null });
  const [editingFrSizes, setEditingFrSizes] = useState(false);
  const [frSizesDraft, setFrSizesDraft] = useState({
    shirt: "",
    pant: "",
    jacket: "",
  });
  const [savingFrSizes, setSavingFrSizes] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("overview");

  // Reset to the overview tab whenever the modal opens or the profile changes
  useEffect(() => {
    if (isOpen) setActiveTab("overview");
  }, [isOpen, userId]);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!userId || userId === user?.id) {
        setAccessDenied(false);
        setProfileUser(user as UserData);
        setIsLoading(false);
        return;
      }

      // Anyone can view anyone's basic profile; fetch it
      setAccessDenied(false);

      const methods: string[] = [];
      try {
        setIsLoading(true);
        console.log(`Attempting to fetch profile for user ${userId}`);

        // Try all possible profile sources
        let profileFound = false;

        // Try to get profile from profiles table
        try {
          methods.push("profiles table (supabase client)");
          const { data: profileData, error: profileError } = await supabase
            .schema("common")
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .single();

          if (!profileError && profileData) {
            console.log(`Found user ${userId} in profiles table:`, profileData);

            // Try to get the target user's full raw_user_meta_data.
            // Prefer the dedicated reader RPC (allows self + Admin/HR),
            // fall back to admin_get_users (Admin-only), then the limited
            // common.get_user_metadata.
            let userMetadata: any = {};
            try {
              const { data: metaJson, error: metaErr1 } = await supabase
                .schema("common")
                .rpc("admin_get_user_metadata", { target_user_id: userId });

              if (!metaErr1 && metaJson && typeof metaJson === "object") {
                userMetadata = {
                  profileImage:
                    (metaJson as any).profileImage ||
                    (metaJson as any).avatar_url,
                  coverImage: (metaJson as any).coverImage,
                  name: (metaJson as any).name,
                  email: (metaJson as any).email,
                  ...(metaJson as any),
                };
              }

              if (!userMetadata || Object.keys(userMetadata).length === 0) {
                const { data: adminData, error: adminError } = await supabase
                  .schema("common")
                  .rpc("admin_get_users");

                if (!adminError && adminData) {
                  const userFromAdmin = adminData.find(
                    (u: any) => u.id === userId,
                  );
                  if (userFromAdmin) {
                    userMetadata = {
                      profileImage:
                        userFromAdmin.raw_user_meta_data?.profileImage ||
                        userFromAdmin.user_metadata?.profileImage ||
                        userFromAdmin.raw_user_meta_data?.avatar_url ||
                        userFromAdmin.user_metadata?.avatar_url,
                      coverImage:
                        userFromAdmin.raw_user_meta_data?.coverImage ||
                        userFromAdmin.user_metadata?.coverImage,
                      name:
                        userFromAdmin.raw_user_meta_data?.name ||
                        userFromAdmin.user_metadata?.name,
                      email: userFromAdmin.email,
                      ...(userFromAdmin.raw_user_meta_data ||
                        userFromAdmin.user_metadata ||
                        {}),
                    };
                  }
                }
              }

              if (!userMetadata.coverImage && !userMetadata.profileImage) {
                const { data: metaData, error: metaError } = await supabase
                  .schema("common")
                  .rpc("get_user_metadata", { p_user_id: userId });

                if (!metaError && metaData) {
                  userMetadata = {
                    profileImage:
                      metaData.profile_image ||
                      metaData.avatar_url ||
                      metaData.profileImage,
                    coverImage: metaData.cover_image || metaData.coverImage,
                    name: metaData.name || metaData.full_name,
                    email: metaData.email,
                    ...metaData,
                    ...userMetadata,
                  };
                }
              }
            } catch (metaErr) {
              console.error(
                "Error fetching user metadata for images:",
                metaErr,
              );
            }

            const userData: UserData = {
              id: userId,
              email: profileData.email || userMetadata.email,
              user_metadata: {
                name: profileData.full_name || userMetadata.name,
                role: profileData.role || userMetadata.role,
                bio: profileData.bio || userMetadata.bio,
                division: profileData.division || userMetadata.division,
                birthday: profileData.birthday || userMetadata.birthday,
                job_title: profileData.job_title || userMetadata.job_title,
                department: profileData.department || userMetadata.department,
                current_compensation_amount:
                  profileData.current_compensation_amount ??
                  userMetadata.current_compensation_amount,
                current_pay_type:
                  profileData.current_pay_type || userMetadata.current_pay_type,
                current_pay_frequency:
                  profileData.current_pay_frequency ||
                  userMetadata.current_pay_frequency,
                profileImage:
                  profileData.avatar_url ||
                  profileData.profile_image ||
                  userMetadata.profileImage,
                coverImage:
                  profileData.cover_image ||
                  profileData.coverImage ||
                  userMetadata.coverImage,
                work_phone:
                  (profileData as any).work_phone ?? userMetadata.work_phone,
                personal_phone:
                  (profileData as any).personal_phone ??
                  userMetadata.personal_phone,
                emergency_contact_name:
                  (profileData as any).emergency_contact_name ??
                  userMetadata.emergency_contact_name,
                emergency_contact_phone:
                  (profileData as any).emergency_contact_phone ??
                  userMetadata.emergency_contact_phone,
                emergency_contact_relationship:
                  (profileData as any).emergency_contact_relationship ??
                  userMetadata.emergency_contact_relationship,
                goals: (profileData as any).goals ?? userMetadata.goals,
                ...userMetadata,
              },
            } as UserData;
            setProfileUser(userData);
            profileFound = true;
          } else {
            console.log(
              `Profile not found in profiles table: ${profileError?.message}`,
            );

            // If the standard query fails, try a direct fetch
            console.log("Trying direct fetch to profiles endpoint...");
            try {
              methods.push("profiles table (direct fetch)");
              const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?select=*&eq.id=${userId}`,
                {
                  method: "GET",
                  headers: {
                    "Content-Type": "application/json",
                    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
                    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || ""}`,
                  },
                },
              );

              if (response.ok) {
                const directData = await response.json();
                console.log("Direct fetch profiles response:", directData);

                if (directData && directData.length > 0) {
                  const profileData = directData[0];

                  // Try to get user metadata to get coverImage and profileImage
                  // Use admin_get_users to get all users, then filter for this user
                  let userMetadata: any = {};
                  try {
                    // First try admin_get_users which has user_metadata
                    const { data: adminData, error: adminError } =
                      await supabase.schema("common").rpc("admin_get_users");

                    if (!adminError && adminData) {
                      const userFromAdmin = adminData.find(
                        (u: any) => u.id === userId,
                      );
                      if (userFromAdmin) {
                        userMetadata = {
                          profileImage:
                            userFromAdmin.raw_user_meta_data?.profileImage ||
                            userFromAdmin.user_metadata?.profileImage ||
                            userFromAdmin.raw_user_meta_data?.avatar_url ||
                            userFromAdmin.user_metadata?.avatar_url,
                          coverImage:
                            userFromAdmin.raw_user_meta_data?.coverImage ||
                            userFromAdmin.user_metadata?.coverImage,
                          ...(userFromAdmin.raw_user_meta_data ||
                            userFromAdmin.user_metadata ||
                            {}),
                        };
                      }
                    }

                    // Fallback to get_user_metadata if admin_get_users didn't work
                    if (
                      !userMetadata.coverImage &&
                      !userMetadata.profileImage
                    ) {
                      const { data: metaData, error: metaError } =
                        await supabase
                          .schema("common")
                          .rpc("get_user_metadata", { p_user_id: userId });

                      if (!metaError && metaData) {
                        userMetadata = {
                          profileImage:
                            metaData.profile_image ||
                            metaData.avatar_url ||
                            metaData.profileImage,
                          coverImage:
                            metaData.cover_image || metaData.coverImage,
                          ...metaData,
                        };
                      }
                    }
                  } catch (metaErr) {
                    console.error(
                      "Error fetching user metadata for images:",
                      metaErr,
                    );
                  }

                  const userData: UserData = {
                    id: userId,
                    email: profileData.email,
                    user_metadata: {
                      name: profileData.full_name,
                      role: profileData.role,
                      bio: profileData.bio,
                      division: profileData.division,
                      birthday: profileData.birthday,
                      job_title: profileData.job_title,
                      department: profileData.department,
                      current_compensation_amount:
                        profileData.current_compensation_amount,
                      current_pay_type: profileData.current_pay_type,
                      current_pay_frequency: profileData.current_pay_frequency,
                      profileImage:
                        profileData.avatar_url ||
                        profileData.profile_image ||
                        userMetadata.profileImage,
                      coverImage:
                        profileData.cover_image ||
                        profileData.coverImage ||
                        userMetadata.coverImage,
                      work_phone:
                        (profileData as any).work_phone ??
                        userMetadata.work_phone,
                      personal_phone:
                        (profileData as any).personal_phone ??
                        userMetadata.personal_phone,
                      emergency_contact_name:
                        (profileData as any).emergency_contact_name ??
                        userMetadata.emergency_contact_name,
                      emergency_contact_phone:
                        (profileData as any).emergency_contact_phone ??
                        userMetadata.emergency_contact_phone,
                      emergency_contact_relationship:
                        (profileData as any).emergency_contact_relationship ??
                        userMetadata.emergency_contact_relationship,
                      goals: (profileData as any).goals ?? userMetadata.goals,
                      ...userMetadata,
                    },
                  } as UserData;
                  setProfileUser(userData);
                  profileFound = true;
                }
              } else {
                console.log(
                  "Direct fetch profiles failed:",
                  await response.text(),
                );
              }
            } catch (fetchErr) {
              console.error("Error with direct fetch profiles:", fetchErr);
            }
          }
        } catch (profileErr) {
          console.error("Error in profiles query:", profileErr);
        }

        // Try RPC method as fallback if profile not found
        if (!profileFound) {
          console.log(`Trying RPC method for user ${userId}`);
          // First try with the Supabase client
          try {
            methods.push("RPC method (Supabase client)");
            const { data, error } = await supabase
              .schema("common")
              .rpc("get_user_details", {
                user_id: userId,
              });

            console.log("RPC response:", { data, error });

            if (!error && data) {
              // Handle either array or single object response
              const userData_rpc = Array.isArray(data) ? data[0] : data;
              console.log(`Found user ${userId} via RPC:`, userData_rpc);

              const userData: UserData = {
                id: userId,
                email: userData_rpc.email,
                user_metadata: {
                  name: userData_rpc.name || userData_rpc.full_name,
                  role: userData_rpc.role,
                  bio: userData_rpc.bio,
                  division: userData_rpc.division,
                  birthday: userData_rpc.birthday,
                  profileImage:
                    userData_rpc.profile_image || userData_rpc.avatar_url,
                  coverImage: userData_rpc.cover_image,
                  work_phone: (userData_rpc as any).work_phone,
                  personal_phone: (userData_rpc as any).personal_phone,
                  emergency_contact_name: (userData_rpc as any)
                    .emergency_contact_name,
                  emergency_contact_phone: (userData_rpc as any)
                    .emergency_contact_phone,
                  emergency_contact_relationship: (userData_rpc as any)
                    .emergency_contact_relationship,
                  goals: (userData_rpc as any).goals,
                },
              } as UserData;
              setProfileUser(userData);
              profileFound = true;
            } else {
              console.log(
                `Profile not found via standard RPC: ${error?.message || "No data returned"}`,
              );

              // If the standard RPC fails, try a direct fetch call
              console.log("Trying direct fetch to RPC endpoint...");
              try {
                methods.push("RPC method (direct fetch)");
                const response = await fetch(
                  `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/get_user_details`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
                      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || ""}`,
                    },
                    body: JSON.stringify({ user_id: userId }),
                  },
                );

                if (response.ok) {
                  const directData = await response.json();
                  console.log("Direct fetch RPC response:", directData);

                  if (directData) {
                    const directUserData = Array.isArray(directData)
                      ? directData[0]
                      : directData;

                    const userData: UserData = {
                      id: userId,
                      email: directUserData.email,
                      user_metadata: {
                        name: directUserData.name || directUserData.full_name,
                        role: directUserData.role,
                        bio: directUserData.bio,
                        division: directUserData.division,
                        birthday: directUserData.birthday,
                        profileImage:
                          directUserData.profile_image ||
                          directUserData.avatar_url,
                        coverImage: directUserData.cover_image,
                        work_phone: (directUserData as any).work_phone,
                        personal_phone: (directUserData as any).personal_phone,
                        emergency_contact_name: (directUserData as any)
                          .emergency_contact_name,
                        emergency_contact_phone: (directUserData as any)
                          .emergency_contact_phone,
                        emergency_contact_relationship: (directUserData as any)
                          .emergency_contact_relationship,
                        goals: (directUserData as any).goals,
                      },
                    } as UserData;
                    setProfileUser(userData);
                    profileFound = true;
                  }
                } else {
                  console.log(
                    "Direct fetch RPC failed:",
                    await response.text(),
                  );
                }
              } catch (fetchErr) {
                console.error("Error with direct fetch RPC:", fetchErr);
              }
            }
          } catch (rpcErr) {
            console.error("Error in RPC call:", rpcErr);
          }
        }

        // Last resort: Try to get basic user info from auth.users via admin_get_user_basic function
        if (!profileFound) {
          console.log(`Trying to get basic user info for ${userId}`);

          // Try using get_user_metadata RPC function
          try {
            methods.push("RPC method (get_user_metadata)");
            const { data: metaData, error: metaError } = await supabase
              .schema("common")
              .rpc("get_user_metadata", {
                p_user_id: userId,
              });

            if (!metaError && metaData) {
              console.log(`Found user ${userId} metadata via RPC:`, metaData);

              const userData: UserData = {
                id: userId,
                email: metaData.email,
                user_metadata: {
                  name:
                    metaData.name ||
                    metaData.full_name ||
                    `User ${userId.substring(0, 6)}`,
                  role: metaData.role,
                  bio: metaData.bio,
                  division: metaData.division,
                  birthday: metaData.birthday,
                  job_title: metaData.job_title,
                  department: metaData.department,
                  profileImage:
                    metaData.profile_image ||
                    metaData.avatar_url ||
                    metaData.profileImage,
                  coverImage: metaData.cover_image || metaData.coverImage,
                  work_phone: (metaData as any).work_phone,
                  personal_phone: (metaData as any).personal_phone,
                  emergency_contact_name: (metaData as any)
                    .emergency_contact_name,
                  emergency_contact_phone: (metaData as any)
                    .emergency_contact_phone,
                  emergency_contact_relationship: (metaData as any)
                    .emergency_contact_relationship,
                  goals: (metaData as any).goals,
                },
              } as UserData;
              setProfileUser(userData);
              profileFound = true;
            } else {
              console.log(`Failed to get user metadata: ${metaError?.message}`);

              // If RPC fails, try the direct API call
              try {
                methods.push("RPC method (direct fetch to metadata endpoint)");
                console.log("Trying direct fetch to metadata endpoint...");
                const response = await fetch(
                  `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/get_user_metadata`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
                      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || ""}`,
                    },
                    body: JSON.stringify({ p_user_id: userId }),
                  },
                );

                if (response.ok) {
                  const directData = await response.json();
                  console.log("Direct fetch metadata response:", directData);

                  if (directData) {
                    const userData: UserData = {
                      id: userId,
                      email: directData.email,
                      user_metadata: {
                        name:
                          directData.name ||
                          directData.full_name ||
                          `User ${userId.substring(0, 6)}`,
                        role: directData.role,
                        bio: directData.bio,
                        division: directData.division,
                        birthday: directData.birthday,
                        job_title: directData.job_title,
                        department: directData.department,
                        profileImage:
                          directData.profile_image || directData.avatar_url,
                        coverImage: directData.cover_image,
                        work_phone: (directData as any).work_phone,
                        personal_phone: (directData as any).personal_phone,
                        emergency_contact_name: (directData as any)
                          .emergency_contact_name,
                        emergency_contact_phone: (directData as any)
                          .emergency_contact_phone,
                        emergency_contact_relationship: (directData as any)
                          .emergency_contact_relationship,
                        goals: (directData as any).goals,
                      },
                    } as UserData;
                    setProfileUser(userData);
                    profileFound = true;
                  }
                } else {
                  console.log(
                    "Direct fetch metadata failed:",
                    await response.text(),
                  );

                  // Last resort - try to get at least email from auth
                  // Try to get basic user info from admin_get_users
                  try {
                    const { data: adminData } = await supabase
                      .schema("common")
                      .rpc("admin_get_users");

                    const userFromAdmin = adminData?.find(
                      (u: any) => u.id === userId,
                    );
                    if (userFromAdmin) {
                      const userData = {
                        id: userId,
                        email: userFromAdmin.email || null,
                        user_metadata: {
                          name:
                            userFromAdmin.raw_user_meta_data?.name ||
                            userFromAdmin.user_metadata?.name ||
                            userFromAdmin.email?.split("@")[0] ||
                            `User ${userId.substring(0, 6)}`,
                          role: null,
                          profileImage: null,
                          bio: null,
                          division: null,
                          birthday: null,
                          coverImage: null,
                        },
                      } as unknown as UserData;
                      setProfileUser(userData);
                    } else {
                      // Create minimal profile with just ID
                      const userData = {
                        id: userId,
                        email: null,
                        user_metadata: {
                          name: `User ${userId.substring(0, 6)}`,
                          role: null,
                          profileImage: null,
                          bio: null,
                          division: null,
                          birthday: null,
                          coverImage: null,
                        },
                      } as unknown as UserData;
                      setProfileUser(userData);
                    }
                  } catch (finalErr) {
                    // Create minimal profile with just ID
                    const userData = {
                      id: userId,
                      email: null,
                      user_metadata: {
                        name: `User ${userId.substring(0, 6)}`,
                        role: null,
                        profileImage: null,
                        bio: null,
                        division: null,
                        birthday: null,
                        coverImage: null,
                      },
                    } as unknown as UserData;
                    setProfileUser(userData);
                  }
                }
              } catch (fetchErr) {
                console.error("Error with direct fetch metadata:", fetchErr);

                // Last resort - create minimal profile
                const userData = {
                  id: userId,
                  email: null,
                  user_metadata: {
                    name: `User ${userId.substring(0, 6)}`,
                    role: null,
                    profileImage: null,
                    bio: null,
                    division: null,
                    birthday: null,
                    coverImage: null,
                  },
                } as unknown as UserData;
                setProfileUser(userData);
              }
            }
          } catch (metaErr) {
            console.error("Error getting user metadata:", metaErr);

            // Create a minimal user profile as last resort
            const userData = {
              id: userId,
              email: null,
              user_metadata: {
                name: `User ${userId.substring(0, 6)}`,
                role: null,
                profileImage: null,
                bio: null,
                division: null,
                birthday: null,
                coverImage: null,
              },
            } as unknown as UserData;
            setProfileUser(userData);
          }
        }
      } catch (err) {
        console.error("Error fetching user profile:", err);
        // Create a minimal backup profile to display something
        const userData = {
          id: userId,
          email: null,
          user_metadata: {
            name: `User ${userId.substring(0, 6)}`,
            role: null,
            bio: null,
            division: null,
            birthday: null,
            profileImage: null,
            coverImage: null,
          },
        } as unknown as UserData;
        setProfileUser(userData);
      } finally {
        setIsLoading(false);

        // Store methods attempted for debugging
        setAttemptedMethods(methods);
      }
    };

    if (userId) {
      fetchUserProfile();
    } else if (!userId) {
      setProfileUser(user as UserData);
      setIsLoading(false);
    }
  }, [userId, user]);

  // Sensitive section (docs, certs, comp, job history): visible to profile owner, their manager, or Admin/Super Admin
  const viewingOwnProfile = !userId || userId === user?.id;
  const isManagerViewingReport =
    !!userId && userId !== user?.id && reportIds.includes(userId);
  const viewerRole = user?.user_metadata?.role;
  const isAdminViewer = viewerRole === "Admin" || viewerRole === "Super Admin";
  const isHrViewer = viewerRole === "HR" || viewerRole === "HR Rep";
  const canEditAnyProfile = isAdminViewer || isHrViewer;
  const canEditThisProfile = viewingOwnProfile || canEditAnyProfile;
  const canEditEeData = viewingOwnProfile || isAdminViewer || isHrViewer;
  const canViewSensitiveSection =
    viewingOwnProfile || isManagerViewingReport || isAdminViewer || isHrViewer;
  const profileIdToFetch =
    isOpen && canViewSensitiveSection
      ? userId || (profileUser?.id ?? user?.id)
      : null;
  useEffect(() => {
    if (!isOpen || !profileIdToFetch) {
      setMyDocuments([]);
      setMyCertifications([]);
      setMyTitleHistory([]);
      setMyCompensationHistory([]);
      setFrSizes({ shirt: "", pant: "", jacket: "", updated_at: null });
      setEditingFrSizes(false);
      return;
    }
    setLoadingMyData(true);
    Promise.all([
      fetchEmployeeDocuments({ employeeId: profileIdToFetch }).catch(() => []),
      fetchCertifications({ employeeId: profileIdToFetch }).catch(() => []),
      supabase
        .schema("common")
        .from("job_title_history")
        .select("id, title, effective_from")
        .eq("profile_id", profileIdToFetch)
        .order("effective_from", { ascending: false })
        .then(({ data }) => data || []),
      supabase
        .schema("common")
        .from("compensation_history")
        .select("id, amount, pay_type, pay_frequency, effective_from")
        .eq("profile_id", profileIdToFetch)
        .order("effective_from", { ascending: false })
        .then(({ data }) => data || [])
        .catch(() => []),
      supabase
        .schema("common")
        .from("profiles")
        .select(
          "job_title, department, current_compensation_amount, current_pay_type, current_pay_frequency, fr_shirt_size, fr_pant_size, fr_jacket_size, fr_sizes_updated_at",
        )
        .eq("id", profileIdToFetch)
        .single()
        .then(({ data }) => data),
    ])
      .then(([docs, certs, titleRows, compRows, profileRow]) => {
        setMyDocuments(
          (docs as any[])
            .filter((d: any) => !d.archived)
            .map((d: any) => ({
              id: d.id,
              name: d.name,
              description: d.description ?? undefined,
              category: d.category || "general",
              file_url: d.file_url,
              created_at: d.created_at,
              expiration_date: d.expiration_date ?? undefined,
            })),
        );
        setMyCertifications(
          (certs as any[]).map((c: any) => ({
            id: c.id,
            cert_name: c.cert_name,
            cert_type: c.cert_type,
            status: c.status,
            cert_date: c.cert_date,
            expiration_date: c.expiration_date ?? undefined,
            renewal_date: c.renewal_date ?? undefined,
            notes: c.notes ?? undefined,
          })),
        );
        setMyTitleHistory((titleRows as any[]) || []);
        setMyCompensationHistory((compRows as any[]) || []);
        if (profileRow) {
          const row = profileRow as any;
          setFrSizes({
            shirt: row.fr_shirt_size ?? "",
            pant: row.fr_pant_size ?? "",
            jacket: row.fr_jacket_size ?? "",
            updated_at: row.fr_sizes_updated_at ?? null,
          });
          if (profileUser) {
            setProfileUser((prev) =>
              prev
                ? {
                    ...prev,
                    user_metadata: {
                      ...prev.user_metadata,
                      job_title: row.job_title,
                      department: row.department,
                      current_compensation_amount:
                        row.current_compensation_amount,
                      current_pay_type: row.current_pay_type,
                      current_pay_frequency: row.current_pay_frequency,
                    },
                  }
                : null,
            );
          }
        }
      })
      .finally(() => setLoadingMyData(false));
  }, [isOpen, profileIdToFetch]);

  const refetchMyData = useCallback(() => {
    if (!profileIdToFetch) return;
    Promise.all([
      fetchEmployeeDocuments({ employeeId: profileIdToFetch }).catch(() => []),
      fetchCertifications({ employeeId: profileIdToFetch }).catch(() => []),
      supabase
        .schema("common")
        .from("job_title_history")
        .select("id, title, effective_from")
        .eq("profile_id", profileIdToFetch)
        .order("effective_from", { ascending: false })
        .then(({ data }) => data || []),
      supabase
        .schema("common")
        .from("compensation_history")
        .select("id, amount, pay_type, pay_frequency, effective_from")
        .eq("profile_id", profileIdToFetch)
        .order("effective_from", { ascending: false })
        .then(({ data }) => data || [])
        .catch(() => []),
      supabase
        .schema("common")
        .from("profiles")
        .select(
          "job_title, department, current_compensation_amount, current_pay_type, current_pay_frequency, fr_shirt_size, fr_pant_size, fr_jacket_size, fr_sizes_updated_at",
        )
        .eq("id", profileIdToFetch)
        .single()
        .then(({ data }) => data),
    ]).then(([docs, certs, titleRows, compRows, profileRow]) => {
      setMyDocuments(
        (docs as any[])
          .filter((d: any) => !d.archived)
          .map((d: any) => ({
            id: d.id,
            name: d.name,
            description: d.description ?? undefined,
            category: d.category || "general",
            file_url: d.file_url,
            created_at: d.created_at,
            expiration_date: d.expiration_date ?? undefined,
          })),
      );
      setMyCertifications(
        (certs as any[]).map((c: any) => ({
          id: c.id,
          cert_name: c.cert_name,
          cert_type: c.cert_type,
          status: c.status,
          cert_date: c.cert_date,
          expiration_date: c.expiration_date ?? undefined,
          renewal_date: c.renewal_date ?? undefined,
          notes: c.notes ?? undefined,
        })),
      );
      setMyTitleHistory((titleRows as any[]) || []);
      setMyCompensationHistory((compRows as any[]) || []);
      if (profileRow) {
        const row = profileRow as any;
        setFrSizes({
          shirt: row.fr_shirt_size ?? "",
          pant: row.fr_pant_size ?? "",
          jacket: row.fr_jacket_size ?? "",
          updated_at: row.fr_sizes_updated_at ?? null,
        });
        setProfileUser((prev) =>
          prev
            ? {
                ...prev,
                user_metadata: {
                  ...prev.user_metadata,
                  job_title: row.job_title,
                  department: row.department,
                  current_compensation_amount: row.current_compensation_amount,
                  current_pay_type: row.current_pay_type,
                  current_pay_frequency: row.current_pay_frequency,
                },
              }
            : null,
        );
      }
    });
  }, [profileIdToFetch]);

  const handleSaveDocumentEdit = async () => {
    if (!editingDocument) return;
    setSavingEdit(true);
    try {
      await updateEmployeeDocument(editingDocument.id, {
        name: editingDocument.name,
        description: editingDocument.description || null,
        expiration_date: toDateOnlyISO(editingDocument.expiration_date) || null,
      });
      toast({
        title: "Saved",
        description: "Document updated.",
        variant: "success",
      });
      setEditingDocument(null);
      refetchMyData();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to update document",
        variant: "destructive",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSaveCertificationEdit = async () => {
    if (!editingCertification) return;
    setSavingEdit(true);
    try {
      await updateCertification(editingCertification.id, {
        cert_name: editingCertification.cert_name,
        cert_date: toDateOnlyISO(editingCertification.cert_date) || undefined,
        expiration_date:
          toDateOnlyISO(editingCertification.expiration_date) || null,
        renewal_date: toDateOnlyISO(editingCertification.renewal_date) || null,
        status: editingCertification.status as any,
        notes: editingCertification.notes || null,
      });
      toast({
        title: "Saved",
        description: "Certification updated.",
        variant: "success",
      });
      setEditingCertification(null);
      refetchMyData();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to update certification",
        variant: "destructive",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSaveFrSizes = async () => {
    if (!profileIdToFetch || !canEditEeData) return;
    setSavingFrSizes(true);
    try {
      const { error } = await supabase
        .schema("common")
        .from("profiles")
        .update({
          fr_shirt_size: frSizesDraft.shirt.trim() || null,
          fr_pant_size: frSizesDraft.pant.trim() || null,
          fr_jacket_size: frSizesDraft.jacket.trim() || null,
          fr_sizes_updated_at: new Date().toISOString(),
        })
        .eq("id", profileIdToFetch);
      if (error) throw error;
      toast({
        title: "Saved",
        description: "FR clothing sizes updated.",
        variant: "success",
      });
      setFrSizes({
        shirt: frSizesDraft.shirt,
        pant: frSizesDraft.pant,
        jacket: frSizesDraft.jacket,
        updated_at: new Date().toISOString(),
      });
      setEditingFrSizes(false);
      refetchMyData();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to update FR sizes",
        variant: "destructive",
      });
    } finally {
      setSavingFrSizes(false);
    }
  };

  const handleStartEditFrSizes = () => {
    setFrSizesDraft({
      shirt: frSizes.shirt,
      pant: frSizes.pant,
      jacket: frSizes.jacket,
    });
    setEditingFrSizes(true);
  };

  // Expose fetchUserProfile for refresh - use the same logic as in useEffect
  const fetchUserProfile = useCallback(async () => {
    if (!userId || userId === user?.id) {
      const {
        data: { user: updatedUser },
      } = await supabase.auth.getUser();
      if (updatedUser) {
        setProfileUser(updatedUser as UserData);
      }
      setIsLoading(false);
      return;
    }

    // Re-run the same fetch logic
    const methods: string[] = [];
    try {
      setIsLoading(true);

      const { data: profileData, error: profileError } = await supabase
        .schema("common")
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (!profileError && profileData) {
        // Try to get user metadata to get coverImage and profileImage
        // Use admin_get_users to get all users, then filter for this user
        let userMetadata: any = {};
        try {
          // First try admin_get_users which has user_metadata
          const { data: adminData, error: adminError } = await supabase
            .schema("common")
            .rpc("admin_get_users");

          if (!adminError && adminData) {
            const userFromAdmin = adminData.find((u: any) => u.id === userId);
            if (userFromAdmin) {
              userMetadata = {
                profileImage:
                  userFromAdmin.raw_user_meta_data?.profileImage ||
                  userFromAdmin.user_metadata?.profileImage ||
                  userFromAdmin.raw_user_meta_data?.avatar_url ||
                  userFromAdmin.user_metadata?.avatar_url,
                coverImage:
                  userFromAdmin.raw_user_meta_data?.coverImage ||
                  userFromAdmin.user_metadata?.coverImage,
                ...(userFromAdmin.raw_user_meta_data ||
                  userFromAdmin.user_metadata ||
                  {}),
              };
            }
          }

          // Fallback to get_user_metadata if admin_get_users didn't work
          if (!userMetadata.coverImage && !userMetadata.profileImage) {
            const { data: metaData, error: metaError } = await supabase
              .schema("common")
              .rpc("get_user_metadata", { p_user_id: userId });

            if (!metaError && metaData) {
              userMetadata = {
                profileImage:
                  metaData.profile_image ||
                  metaData.avatar_url ||
                  metaData.profileImage,
                coverImage: metaData.cover_image || metaData.coverImage,
                ...metaData,
              };
            }
          }
        } catch (metaErr) {
          console.error("Error fetching user metadata for images:", metaErr);
        }

        const userData: UserData = {
          id: userId,
          email: profileData.email,
          user_metadata: {
            name: profileData.full_name,
            role: profileData.role,
            bio: profileData.bio,
            division: profileData.division,
            birthday: profileData.birthday,
            job_title: profileData.job_title,
            department: profileData.department,
            current_compensation_amount:
              profileData.current_compensation_amount,
            current_pay_type: profileData.current_pay_type,
            current_pay_frequency: profileData.current_pay_frequency,
            profileImage:
              profileData.avatar_url ||
              profileData.profile_image ||
              userMetadata.profileImage,
            coverImage:
              profileData.cover_image ||
              profileData.coverImage ||
              userMetadata.coverImage,
            ...userMetadata,
          },
        } as UserData;
        setProfileUser(userData);
      }
    } catch (err) {
      console.error("Error refreshing profile:", err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, user]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only close if the click is directly on the backdrop itself
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Early return if not open
  if (!isOpen) return null;

  // Show loading state
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-white dark:bg-dark-150 rounded-none p-8 flex items-center gap-3">
          <LoadingSpinner size="sm" />
        </div>
      </div>
    );
  }

  // Show error state if no profile found
  if (!profileUser) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-white dark:bg-dark-150 rounded-none p-8 text-center max-w-md">
          <div className="flex flex-col items-center">
            <div className="rounded-none bg-red-100 p-3 mb-4">
              <User className="h-6 w-6 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
              Profile Not Found
            </h3>
            <p className="text-neutral-600 dark:text-white mb-4">
              We couldn't find the user profile for ID:{" "}
              {userId ? userId.substring(0, 8) + "..." : "Unknown"}. The user
              may have been deleted or you may not have permission to view this
              profile.
            </p>

            {/* Debug information */}
            <div className="text-left text-xs text-neutral-500 border-t border-neutral-200 pt-3 mt-2 mb-4 w-full">
              <p className="font-medium mb-1">
                Debug Info (Attempted methods):
              </p>
              {attemptedMethods.length > 0 ? (
                <ul className="list-disc pl-5 space-y-1">
                  {attemptedMethods.map((method, index) => (
                    <li key={index}>{method}</li>
                  ))}
                </ul>
              ) : (
                <p>No fetch methods were attempted</p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
              >
                Refresh
              </Button>
              <Button onClick={onClose}>Close</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Get user metadata
  const metadata = profileUser?.user_metadata || {};
  const {
    name,
    role,
    bio,
    division,
    birthday,
    job_title: jobTitle,
    department,
    current_compensation_amount: compensationAmount,
    current_pay_type: payType,
    current_pay_frequency: payFrequency,
    profileImage,
    coverImage,
    work_phone: workPhone,
    personal_phone: personalPhone,
    emergency_contact_name: emergencyContactName,
    emergency_contact_phone: emergencyContactPhone,
    emergency_contact_relationship: emergencyContactRelationship,
    goals: goalsText,
  } = metadata;

  const formatCompensation = (
    amount: number | null | undefined,
    type: string | null | undefined,
    freq: string | null | undefined,
  ) => {
    if (amount == null) return "—";
    if (type === "hourly")
      return `$${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}/hr`;
    const freqLabel =
      freq === "annual"
        ? "Annual"
        : freq === "monthly"
          ? "Monthly"
          : freq === "biweekly"
            ? "Biweekly"
            : freq === "weekly"
              ? "Weekly"
              : freq || "Annual";
    return `$${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${freqLabel}`;
  };

  // Check if profile is set up (has meaningful data beyond just email)
  const isProfileSetUp = !!(
    bio ||
    division ||
    role ||
    jobTitle ||
    department ||
    compensationAmount != null ||
    profileImage ||
    coverImage ||
    birthday
  );

  // Get display name - prefer name from metadata, fallback to email username, then email
  const displayName =
    name ||
    profileUser?.email?.split("@")[0] ||
    profileUser?.email ||
    "Unknown User";

  // Log metadata for debugging
  console.log("Profile metadata:", metadata);
  console.log("Division value:", division);
  console.log("Is profile set up:", isProfileSetUp);

  // Format birthday if available (month and day only, no year)
  const formattedBirthday = birthday
    ? new Date(birthday + "T00:00:00Z").toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        timeZone: "UTC", // Force UTC to prevent date shifting
      })
    : null;

  const handlePhotoClick = (e: React.MouseEvent, photoSrc: string) => {
    e.stopPropagation(); // Prevent closing ProfileView if clicking on image inside
    setEnlargedPhotoSrc(photoSrc);
    setIsPhotoEnlarged(true);
  };

  const handleCloseEnlargedPhoto = () => {
    setIsPhotoEnlarged(false);
    setEnlargedPhotoSrc(null);
  };

  // Refresh profile when edit is closed
  const handleEditClose = () => {
    setIsEditProfileOpen(false);
    // Refresh the profile data
    if (userId) {
      fetchUserProfile();
    } else {
      // If viewing own profile, refresh user data
      const refreshUser = async () => {
        const {
          data: { user: updatedUser },
        } = await supabase.auth.getUser();
        if (updatedUser) {
          setProfileUser(updatedUser as UserData);
        }
      };
      refreshUser();
    }
  };

  return (
    <>
      {/* Edit Profile Modal */}
      {isEditProfileOpen && (
        <EditProfilePopup
          isOpen={isEditProfileOpen}
          onClose={handleEditClose}
          targetUserId={profileUser?.id || userId || user?.id}
          currentUser={{
            name: name,
            email: profileUser?.email,
            role: role,
            bio: bio,
            division: division,
            birthday: birthday,
            job_title: jobTitle,
            department: department,
            work_phone: workPhone,
            personal_phone: personalPhone,
            emergency_contact_name: emergencyContactName,
            emergency_contact_phone: emergencyContactPhone,
            emergency_contact_relationship: emergencyContactRelationship,
            goals: goalsText,
            profileImage: profileImage,
            coverImage: coverImage,
          }}
        />
      )}

      {(() => {
        const showSensitiveTabs =
          !limitedView && canViewSensitiveSection && !!profileIdToFetch;
        const tabs: { key: string; label: string; icon: React.ReactNode }[] = [
          {
            key: "overview",
            label: "Overview",
            icon: <User className="h-4 w-4" />,
          },
        ];
        if (showSensitiveTabs) {
          tabs.push(
            {
              key: "documents",
              label: "Documents",
              icon: <FileText className="h-4 w-4" />,
            },
            {
              key: "certifications",
              label: "Certifications",
              icon: <Award className="h-4 w-4" />,
            },
            {
              key: "employment",
              label: "Employment",
              icon: <Briefcase className="h-4 w-4" />,
            },
            {
              key: "oneonone",
              label: "1:1 Check-Ins",
              icon: <ClipboardList className="h-4 w-4" />,
            },
            {
              key: "career",
              label: "Career",
              icon: <TrendingUp className="h-4 w-4" />,
            },
          );
        }
        const currentTab = tabs.some((t) => t.key === activeTab)
          ? activeTab
          : "overview";

        return (
          <div
            className={`fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 ${
              isEditProfileOpen ? "pointer-events-none" : ""
            }`}
            onClick={handleBackdropClick}
            aria-hidden={isEditProfileOpen}
          >
            <div
              className="w-full max-w-4xl h-[600px] max-h-[calc(100vh-2rem)] flex bg-white dark:bg-dark-150 rounded-none shadow-2xl overflow-hidden relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-3 right-3 z-20 text-neutral-500 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 rounded-none p-1.5"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Sidebar */}
              <div className="w-64 flex-shrink-0 flex flex-col border-r border-neutral-200 dark:border-dark-200 bg-neutral-50 dark:bg-dark-100">
                {/* Cover + avatar */}
                <div className="relative flex-shrink-0">
                  <div
                    className="h-20 bg-gradient-to-r from-neutral-300 to-neutral-400 dark:from-dark-200 dark:to-dark-300 overflow-hidden cursor-pointer"
                    onClick={(e) =>
                      coverImage && handlePhotoClick(e, coverImage)
                    }
                  >
                    {coverImage && (
                      <img
                        src={coverImage}
                        alt="Cover"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="px-4 -mt-10">
                    <div
                      className={`w-20 h-20 rounded-none overflow-hidden border-4 border-white dark:border-dark-100 shadow-lg bg-neutral-200 dark:bg-dark-150 ${profileImage ? "cursor-pointer" : ""}`}
                      onClick={(e) =>
                        profileImage && handlePhotoClick(e, profileImage)
                      }
                    >
                      {profileImage ? (
                        <img
                          src={profileImage}
                          alt="Profile"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-neutral-200 dark:bg-dark-150">
                          <span className="text-2xl text-neutral-400 dark:text-white">
                            {name ? name.charAt(0).toUpperCase() : "?"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Name / role / email */}
                <div className="px-4 pt-2 pb-3 border-b border-neutral-200 dark:border-dark-200 flex-shrink-0">
                  <h1 className="text-lg font-bold text-neutral-900 dark:text-white leading-tight truncate">
                    {displayName}
                  </h1>
                  {role && (
                    <div className="mt-1 inline-flex items-center rounded-none bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                      {role}
                    </div>
                  )}
                  {!limitedView && profileUser?.email && (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 truncate">
                      {profileUser.email}
                    </p>
                  )}
                </div>

                {/* Nav */}
                <div className="flex-1 overflow-y-auto py-2">
                  {tabs.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left transition-colors ${
                        currentTab === tab.key
                          ? "bg-brand/10 text-brand font-medium border-r-2 border-brand"
                          : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-dark-200"
                      }`}
                    >
                      {tab.icon}
                      <span className="truncate">{tab.label}</span>
                    </button>
                  ))}
                </div>

                {/* Edit button */}
                {canEditThisProfile && (
                  <div className="p-3 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsEditProfileOpen(true);
                      }}
                      className="border-none w-full flex items-center justify-center gap-2"
                      aria-label="Edit profile"
                      leftIcon={<Edit2 className="h-4 w-4" />}
                    >
                      Edit Profile
                    </Button>
                  </div>
                )}
              </div>

              {/* Content pane */}
              <div className="flex-1 min-w-0 overflow-y-auto overscroll-contain px-6 py-5">
                {/* Overview */}
                {currentTab === "overview" && (
                  <div className="space-y-6">
                    {/* Profile Not Set Up Message */}
                    {!isProfileSetUp && (
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-none p-4">
                        <div className="flex items-start gap-3">
                          <User className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">
                              User profile not set up
                            </h3>
                            <p className="text-sm text-amber-700 dark:text-amber-300">
                              This user hasn't completed their profile setup
                              yet. Basic information is shown below.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Bio */}
                    {bio && (
                      <div>
                        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
                          Bio
                        </h2>
                        <p className="text-neutral-700 dark:text-white">
                          {bio}
                        </p>
                      </div>
                    )}

                    {/* Contact & Personal Info */}
                    <div className="space-y-3">
                      <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                        Personal Information
                      </h2>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {jobTitle && (
                          <div className="flex items-center text-neutral-700 dark:text-white">
                            <Briefcase className="mr-2 h-4 w-4 text-neutral-500 dark:text-white flex-shrink-0" />
                            <div>
                              <p className="text-sm text-neutral-500 dark:text-white">
                                Job title
                              </p>
                              <p>{jobTitle}</p>
                            </div>
                          </div>
                        )}
                        {department && (
                          <div className="flex items-center text-neutral-700 dark:text-white">
                            <Building2 className="mr-2 h-4 w-4 text-neutral-500 dark:text-white flex-shrink-0" />
                            <div>
                              <p className="text-sm text-neutral-500 dark:text-white">
                                Department
                              </p>
                              <p>{department}</p>
                            </div>
                          </div>
                        )}
                        <div className="flex items-center text-neutral-700 dark:text-white">
                          <Briefcase className="mr-2 h-4 w-4 text-neutral-500 dark:text-white flex-shrink-0" />
                          <div>
                            <p className="text-sm text-neutral-500 dark:text-white">
                              NETA Division
                            </p>
                            <p>
                              {formatDivisionDisplay(division) ||
                                "Not specified"}
                            </p>
                          </div>
                        </div>
                        {!limitedView && formattedBirthday && (
                          <div className="flex items-center text-neutral-700 dark:text-white">
                            <MapPin className="mr-2 h-4 w-4 text-neutral-500 dark:text-white" />
                            <div>
                              <p className="text-sm text-neutral-500 dark:text-white">
                                Birthday
                              </p>
                              <p>{formattedBirthday}</p>
                            </div>
                          </div>
                        )}
                        {!limitedView && profileUser?.email && (
                          <div className="flex items-center text-neutral-700 dark:text-white">
                            <Mail className="mr-2 h-4 w-4 text-neutral-500 dark:text-white" />
                            <div>
                              <p className="text-sm text-neutral-500 dark:text-white">
                                Email
                              </p>
                              <a
                                href={`mailto:${profileUser.email}`}
                                className="text-brand hover:underline"
                              >
                                {profileUser.email}
                              </a>
                            </div>
                          </div>
                        )}
                        {workPhone && (
                          <div className="flex items-center text-neutral-700 dark:text-white">
                            <Phone className="mr-2 h-4 w-4 text-neutral-500 dark:text-white flex-shrink-0" />
                            <div>
                              <p className="text-sm text-neutral-500 dark:text-white">
                                Work Phone
                              </p>
                              <a
                                href={`tel:${workPhone}`}
                                className="text-brand hover:underline"
                              >
                                {workPhone}
                              </a>
                            </div>
                          </div>
                        )}
                        {personalPhone && (
                          <div className="flex items-center text-neutral-700 dark:text-white">
                            <Phone className="mr-2 h-4 w-4 text-neutral-500 dark:text-white flex-shrink-0" />
                            <div>
                              <p className="text-sm text-neutral-500 dark:text-white">
                                Personal Phone
                              </p>
                              <a
                                href={`tel:${personalPhone}`}
                                className="text-brand hover:underline"
                              >
                                {personalPhone}
                              </a>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Emergency Contact - hidden in limited view */}
                      {!limitedView &&
                        (emergencyContactName || emergencyContactPhone) && (
                          <div className="pt-4 border-t border-neutral-200 dark:border-dark-200">
                            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2 flex items-center gap-2">
                              <Phone className="h-4 w-4 text-brand" />
                              Emergency Contact
                            </h2>
                            <div className="text-sm text-neutral-700 dark:text-neutral-200 space-y-1">
                              <p className="font-medium">
                                {emergencyContactName}
                              </p>
                              {emergencyContactRelationship && (
                                <p className="text-muted-foreground">
                                  {emergencyContactRelationship}
                                </p>
                              )}
                              {emergencyContactPhone && (
                                <a
                                  href={`tel:${emergencyContactPhone}`}
                                  className="text-brand hover:underline"
                                >
                                  {emergencyContactPhone}
                                </a>
                              )}
                            </div>
                          </div>
                        )}

                      {/* Goals */}
                      {goalsText && (
                        <div className="pt-4 border-t border-neutral-200 dark:border-dark-200">
                          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2 flex items-center gap-2">
                            <Target className="h-4 w-4 text-brand" />
                            Goals
                          </h2>
                          <p className="text-sm text-neutral-700 dark:text-neutral-200 whitespace-pre-wrap">
                            {goalsText}
                          </p>
                        </div>
                      )}

                      {/* Note when sensitive sections are restricted */}
                      {!limitedView && !canViewSensitiveSection && (
                        <div className="pt-4 border-t border-neutral-200 dark:border-dark-200">
                          <p className="text-sm text-muted-foreground">
                            Documents, certifications, employment history, and
                            compensation are only visible to the profile owner,
                            their manager, or admins.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Documents */}
                {currentTab === "documents" &&
                  (loadingMyData ? (
                    <div className="flex justify-center py-6">
                      <LoadingSpinner size="md" />
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2 mb-3">
                        <FileText className="h-4 w-4 text-brand" />
                        {viewingOwnProfile ? "My documents" : "Documents"}
                      </h3>
                      {myDocuments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No documents on file.
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {myDocuments.map((doc) => (
                            <li
                              key={doc.id}
                              className="flex items-center justify-between gap-2 text-sm group"
                            >
                              <span className="text-neutral-700 dark:text-neutral-200 truncate flex-1 min-w-0">
                                {doc.name}
                              </span>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {viewingOwnProfile && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditingDocument({
                                        id: doc.id,
                                        name: doc.name,
                                        description: doc.description ?? "",
                                        expiration_date: doc.expiration_date
                                          ? doc.expiration_date.slice(0, 10)
                                          : "",
                                      })
                                    }
                                    className="p-1 rounded text-neutral-500 hover:text-brand hover:bg-neutral-100 dark:hover:bg-dark-200"
                                    title="Edit document"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <a
                                  href={doc.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-brand hover:underline inline-flex items-center gap-1"
                                >
                                  Open <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}

                {/* Certifications */}
                {currentTab === "certifications" &&
                  (loadingMyData ? (
                    <div className="flex justify-center py-6">
                      <LoadingSpinner size="md" />
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2 mb-3">
                        <Award className="h-4 w-4 text-brand" />
                        {viewingOwnProfile
                          ? "My certifications"
                          : "Certifications"}
                      </h3>
                      {myCertifications.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No certifications on file.
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {myCertifications.map((cert) => (
                            <li
                              key={cert.id}
                              className="text-sm text-neutral-700 dark:text-neutral-200 flex items-center justify-between gap-2 group"
                            >
                              <span className="flex-1 min-w-0">
                                {cert.cert_name}
                              </span>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span
                                  className={`text-xs px-1.5 py-0.5 rounded ${cert.status === "active" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"}`}
                                >
                                  {cert.status}
                                </span>
                                {viewingOwnProfile && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditingCertification({
                                        id: cert.id,
                                        cert_name: cert.cert_name,
                                        cert_date: cert.cert_date
                                          ? cert.cert_date.slice(0, 10)
                                          : "",
                                        expiration_date: cert.expiration_date
                                          ? cert.expiration_date.slice(0, 10)
                                          : "",
                                        renewal_date: cert.renewal_date
                                          ? cert.renewal_date.slice(0, 10)
                                          : "",
                                        status: cert.status,
                                        notes: cert.notes ?? "",
                                      })
                                    }
                                    className="p-1 rounded text-neutral-500 hover:text-brand hover:bg-neutral-100 dark:hover:bg-dark-200"
                                    title="Edit certification"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}

                {/* Employment: title history + compensation + FR sizes */}
                {currentTab === "employment" &&
                  (loadingMyData ? (
                    <div className="flex justify-center py-6">
                      <LoadingSpinner size="md" />
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2 mb-2">
                          <History className="h-4 w-4 text-brand" />
                          Title history
                        </h3>
                        {myTitleHistory.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No title history yet.
                          </p>
                        ) : (
                          <ul className="space-y-1.5">
                            {myTitleHistory.map((entry) => (
                              <li
                                key={entry.id}
                                className="text-sm text-neutral-700 dark:text-neutral-200 flex justify-between gap-2"
                              >
                                <span>{entry.title}</span>
                                <span className="text-muted-foreground text-xs flex-shrink-0">
                                  {formatDateOnly(entry.effective_from)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2 mb-2">
                          <DollarSign className="h-4 w-4 text-brand" />
                          Compensation
                        </h3>
                        {compensationAmount != null ? (
                          <p className="text-sm text-neutral-700 dark:text-neutral-200">
                            {formatCompensation(
                              compensationAmount,
                              payType,
                              payFrequency,
                            )}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No compensation on file.
                          </p>
                        )}
                        {myCompensationHistory.length > 0 && (
                          <ul className="space-y-1.5 mt-3 text-sm text-muted-foreground">
                            {myCompensationHistory.slice(0, 5).map((entry) => (
                              <li
                                key={entry.id}
                                className="flex justify-between gap-2"
                              >
                                <span>
                                  {formatCompensation(
                                    entry.amount,
                                    entry.pay_type,
                                    entry.pay_frequency,
                                  )}
                                </span>
                                <span className="text-xs">
                                  {formatDateOnly(entry.effective_from)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* FR (Flame-Resistant) clothing sizes */}
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                            <Shirt className="h-4 w-4 text-brand" />
                            FR clothing sizes
                          </h3>
                          {canEditEeData && !editingFrSizes && (
                            <button
                              type="button"
                              onClick={handleStartEditFrSizes}
                              className="text-xs text-brand hover:text-brand-dark hover:underline flex items-center gap-1 shrink-0"
                            >
                              <Edit2 className="h-3 w-3" />
                              {frSizes.shirt || frSizes.pant || frSizes.jacket
                                ? "Edit sizes"
                                : "Add sizes"}
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">
                          Update annually or bi-annually if your sizes change.
                        </p>
                        {editingFrSizes ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <Label htmlFor="fr-shirt" className="text-xs">
                                  Shirt
                                </Label>
                                <Input
                                  id="fr-shirt"
                                  value={frSizesDraft.shirt}
                                  onChange={(e) =>
                                    setFrSizesDraft((d) => ({
                                      ...d,
                                      shirt: e.target.value,
                                    }))
                                  }
                                  placeholder="e.g. M, L, XL"
                                  className="mt-1 h-9"
                                />
                              </div>
                              <div>
                                <Label htmlFor="fr-pant" className="text-xs">
                                  Pants
                                </Label>
                                <Input
                                  id="fr-pant"
                                  value={frSizesDraft.pant}
                                  onChange={(e) =>
                                    setFrSizesDraft((d) => ({
                                      ...d,
                                      pant: e.target.value,
                                    }))
                                  }
                                  placeholder="e.g. 32x30"
                                  className="mt-1 h-9"
                                />
                              </div>
                              <div>
                                <Label htmlFor="fr-jacket" className="text-xs">
                                  Jacket
                                </Label>
                                <Input
                                  id="fr-jacket"
                                  value={frSizesDraft.jacket}
                                  onChange={(e) =>
                                    setFrSizesDraft((d) => ({
                                      ...d,
                                      jacket: e.target.value,
                                    }))
                                  }
                                  placeholder="e.g. L, XL"
                                  className="mt-1 h-9"
                                />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={handleSaveFrSizes}
                                disabled={savingFrSizes}
                              >
                                {savingFrSizes ? "Saving…" : "Save"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingFrSizes(false)}
                                disabled={savingFrSizes}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {frSizes.shirt || frSizes.pant || frSizes.jacket ? (
                              <div className="text-sm text-neutral-700 dark:text-neutral-200 space-y-1">
                                {frSizes.shirt && (
                                  <p>
                                    <span className="text-muted-foreground">
                                      Shirt:
                                    </span>{" "}
                                    {frSizes.shirt}
                                  </p>
                                )}
                                {frSizes.pant && (
                                  <p>
                                    <span className="text-muted-foreground">
                                      Pants:
                                    </span>{" "}
                                    {frSizes.pant}
                                  </p>
                                )}
                                {frSizes.jacket && (
                                  <p>
                                    <span className="text-muted-foreground">
                                      Jacket:
                                    </span>{" "}
                                    {frSizes.jacket}
                                  </p>
                                )}
                                {frSizes.updated_at && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Last updated{" "}
                                    {formatDateOnly(frSizes.updated_at)}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                No FR sizes on file.
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}

                {/* One-on-One Check-Ins */}
                {currentTab === "oneonone" && profileIdToFetch && (
                  <OneOnOneList
                    employeeId={profileIdToFetch}
                    employeeName={displayName}
                    currentUserId={user?.id || ""}
                    currentUserName={
                      user?.user_metadata?.name ||
                      user?.email?.split("@")[0] ||
                      ""
                    }
                    canStartNew={
                      isManagerViewingReport || isHrViewer || isAdminViewer
                    }
                    canEdit={
                      isManagerViewingReport || isHrViewer || isAdminViewer
                    }
                  />
                )}

                {/* Career Development */}
                {currentTab === "career" && (
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-brand" />
                      Career Development
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Career development notes and plans will appear here when
                      configured.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit document modal */}
      <Dialog
        open={!!editingDocument}
        onOpenChange={(open) => !open && setEditingDocument(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit document</DialogTitle>
          </DialogHeader>
          {editingDocument && (
            <div className="grid gap-4 py-2">
              <div>
                <Label htmlFor="edit-doc-name">Name</Label>
                <Input
                  id="edit-doc-name"
                  value={editingDocument.name}
                  onChange={(e) =>
                    setEditingDocument((d) =>
                      d ? { ...d, name: e.target.value } : null,
                    )
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="edit-doc-desc">Description (optional)</Label>
                <Input
                  id="edit-doc-desc"
                  value={editingDocument.description}
                  onChange={(e) =>
                    setEditingDocument((d) =>
                      d ? { ...d, description: e.target.value } : null,
                    )
                  }
                  className="mt-1"
                  placeholder="Brief description"
                />
              </div>
              <div>
                <Label htmlFor="edit-doc-exp">Expiration date (optional)</Label>
                <Input
                  id="edit-doc-exp"
                  type="date"
                  value={editingDocument.expiration_date}
                  onChange={(e) =>
                    setEditingDocument((d) =>
                      d ? { ...d, expiration_date: e.target.value } : null,
                    )
                  }
                  className="mt-1"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDocument(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveDocumentEdit} disabled={savingEdit}>
              {savingEdit ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit certification modal */}
      <Dialog
        open={!!editingCertification}
        onOpenChange={(open) => !open && setEditingCertification(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit certification</DialogTitle>
          </DialogHeader>
          {editingCertification && (
            <div className="grid gap-4 py-2">
              <div>
                <Label htmlFor="edit-cert-name">Certification name</Label>
                <Input
                  id="edit-cert-name"
                  value={editingCertification.cert_name}
                  onChange={(e) =>
                    setEditingCertification((c) =>
                      c ? { ...c, cert_name: e.target.value } : null,
                    )
                  }
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-cert-date">Cert date</Label>
                  <Input
                    id="edit-cert-date"
                    type="date"
                    value={editingCertification.cert_date}
                    onChange={(e) =>
                      setEditingCertification((c) =>
                        c ? { ...c, cert_date: e.target.value } : null,
                      )
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-cert-exp">Expiration date</Label>
                  <Input
                    id="edit-cert-exp"
                    type="date"
                    value={editingCertification.expiration_date}
                    onChange={(e) =>
                      setEditingCertification((c) =>
                        c ? { ...c, expiration_date: e.target.value } : null,
                      )
                    }
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-cert-renewal">
                  Renewal date (optional)
                </Label>
                <Input
                  id="edit-cert-renewal"
                  type="date"
                  value={editingCertification.renewal_date}
                  onChange={(e) =>
                    setEditingCertification((c) =>
                      c ? { ...c, renewal_date: e.target.value } : null,
                    )
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="edit-cert-status">Status</Label>
                <select
                  id="edit-cert-status"
                  value={editingCertification.status}
                  onChange={(e) =>
                    setEditingCertification((c) =>
                      c ? { ...c, status: e.target.value } : null,
                    )
                  }
                  className="mt-1 flex h-10 w-full rounded-none border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:border-dark-300"
                >
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="pending_renewal">Pending renewal</option>
                  <option value="revoked">Revoked</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <Label htmlFor="edit-cert-notes">Notes (optional)</Label>
                <Input
                  id="edit-cert-notes"
                  value={editingCertification.notes}
                  onChange={(e) =>
                    setEditingCertification((c) =>
                      c ? { ...c, notes: e.target.value } : null,
                    )
                  }
                  className="mt-1"
                  placeholder="Notes"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingCertification(null)}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveCertificationEdit} disabled={savingEdit}>
              {savingEdit ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enlarged Photo Modal */}
      {isPhotoEnlarged && enlargedPhotoSrc && (
        <EnlargedPhotoView
          src={enlargedPhotoSrc}
          onClose={handleCloseEnlargedPhoto}
        />
      )}
    </>
  );
};
