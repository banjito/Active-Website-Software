import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Briefcase,
  LinkIcon,
  Mail,
  Edit2,
  X,
  Image
} from "lucide-react";
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { User } from '@supabase/supabase-js';

interface ProfileViewProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string; // Optional: for viewing other users' profiles
}

// Define the structure of user data
interface UserData extends User {
  user_metadata: {
    name?: string;
    role?: string;
    bio?: string;
    division?: string;
    birthday?: string;
    profileImage?: string;
    coverImage?: string;
    [key: string]: any;
  };
  email?: string;
}

// Simple component for the enlarged photo view
const EnlargedPhotoView: React.FC<{ src: string; onClose: () => void }> = ({ src, onClose }) => {
  return (
    <div 
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md"
      onClick={onClose} // Close on background click
    >
      <div className="relative max-w-3xl max-h-[80vh]">
        <img src={src} alt="Enlarged Profile" className="block max-w-full max-h-full object-contain rounded-lg shadow-xl" />
        <button 
          onClick={onClose}
          className="absolute top-2 right-2 text-white bg-black/30 hover:bg-black/50 rounded-full p-1.5"
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
  userId
}) => {
  const { user } = useAuth();
  const [profileUser, setProfileUser] = useState<UserData | null>(userId ? null : user as UserData);
  const [isPhotoEnlarged, setIsPhotoEnlarged] = useState(false);
  const [enlargedPhotoSrc, setEnlargedPhotoSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!!userId);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!userId || userId === user?.id) {
        setProfileUser(user as UserData);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        
        // Try to get profile from profiles table
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
          
        if (!profileError && profileData) {
          const userData: UserData = {
            id: userId,
            email: profileData.email,
            user_metadata: {
              name: profileData.full_name,
              role: profileData.role,
              bio: profileData.bio,
              division: profileData.division,
              birthday: profileData.birthday,
              profileImage: profileData.avatar_url,
              coverImage: profileData.cover_image
            }
          } as UserData;
          setProfileUser(userData);
          return;
        }
        
        // Try RPC method as fallback
        const { data, error } = await supabase.rpc('get_user_details', { user_id: userId });
        
        if (!error && data && data.length > 0) {
          const userData: UserData = {
            id: userId,
            email: data[0].email,
            user_metadata: {
              name: data[0].name,
              role: data[0].role,
              profileImage: data[0].profile_image,
              // Add other fields as needed
            }
          } as UserData;
          setProfileUser(userData);
        }
      } catch (err) {
        console.error('Error fetching user profile:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (userId) {
      fetchUserProfile();
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
        <div className="bg-white dark:bg-dark-100 rounded-xl p-8 flex items-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#f26722]"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading profile...</p>
        </div>
      </div>
    );
  }

  // Show error state if no profile found
  if (!profileUser) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-white dark:bg-dark-100 rounded-xl p-8 text-center">
          <p className="text-gray-600 dark:text-gray-300 mb-4">Profile not found</p>
          <Button onClick={onClose}>Close</Button>
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
    profileImage,
    coverImage,
  } = metadata;

  // Format birthday if available
  const formattedBirthday = birthday 
    ? new Date(birthday + 'T00:00:00Z').toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: 'UTC' // Force UTC to prevent date shifting
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

  return (
    <>
      <div 
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-10"
        onClick={handleBackdropClick} // Add onClick to the backdrop
      >
        <div 
          className="relative w-full max-w-3xl bg-white dark:bg-dark-100 rounded-xl shadow-2xl overflow-hidden mx-4"
          onClick={(e) => e.stopPropagation()} // Prevent clicks inside the modal from closing it
        >
          {/* Header with close button */}
          <div className="absolute top-4 right-4 z-10">
            <button 
              onClick={onClose}
              className="text-white bg-black/20 hover:bg-black/40 rounded-full p-1"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Cover Image */}
          <div 
            className="h-40 bg-gradient-to-r from-gray-300 to-gray-400 dark:from-dark-200 dark:to-dark-300 relative overflow-hidden cursor-pointer"
            onClick={(e) => coverImage && handlePhotoClick(e, coverImage)}
          >
            {coverImage ? (
              <img 
                src={coverImage} 
                alt="Cover" 
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500 dark:text-dark-400">
                <Image className="w-10 h-10 opacity-50" />
              </div>
            )}
          </div>

          {/* Profile Content */}
          <div className="px-6 pb-6">
            {/* Profile Image */}
            <div className="relative -mt-16 mb-4">
              <div 
                className={`w-32 h-32 rounded-full overflow-hidden border-4 border-white dark:border-dark-100 shadow-xl bg-gray-200 dark:bg-dark-200 ${profileImage ? 'cursor-pointer' : ''}`}
                onClick={(e) => profileImage && handlePhotoClick(e, profileImage)}
              >
                {profileImage ? (
                  <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-dark-200">
                    <span className="text-4xl text-gray-400 dark:text-gray-600">{name ? name.charAt(0).toUpperCase() : '?'}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Profile Info */}
            <div className="space-y-6">
              {/* Name and Role */}
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{name || 'Anonymous User'}</h1>
                {role && (
                  <div className="mt-1 inline-flex items-center rounded-full bg-[#f26722]/10 px-2.5 py-0.5 text-xs font-medium text-[#f26722]">
                    {role}
                  </div>
                )}
                <p className="text-gray-500 dark:text-gray-400 mt-1">{profileUser?.email}</p>
              </div>

              {/* Bio */}
              {bio && (
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Bio</h2>
                  <p className="text-gray-700 dark:text-gray-300">{bio}</p>
                </div>
              )}

              {/* Contact & Personal Info */}
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Personal Information</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {division && (
                    <div className="flex items-center text-gray-700 dark:text-gray-300">
                      <Briefcase className="mr-2 h-4 w-4 text-gray-500 dark:text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">NETA Division</p>
                        <p>{division}</p>
                      </div>
                    </div>
                  )}
                  
                  {formattedBirthday && (
                    <div className="flex items-center text-gray-700 dark:text-gray-300">
                      <MapPin className="mr-2 h-4 w-4 text-gray-500 dark:text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Birthday</p>
                        <p>{formattedBirthday}</p>
                      </div>
                    </div>
                  )}
                  
                  {profileUser?.email && (
                    <div className="flex items-center text-gray-700 dark:text-gray-300">
                      <Mail className="mr-2 h-4 w-4 text-gray-500 dark:text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Email</p>
                        <a href={`mailto:${profileUser.email}`} className="text-[#f26722] hover:underline">
                          {profileUser.email}
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enlarged Photo Modal */}
      {isPhotoEnlarged && enlargedPhotoSrc && (
        <EnlargedPhotoView src={enlargedPhotoSrc} onClose={handleCloseEnlargedPhoto} />
      )}
    </>
  );
}; 