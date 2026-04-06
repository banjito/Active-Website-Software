import React, { useState } from 'react';
import { User as UserIcon, FileText, X, Edit3 } from "lucide-react";
import { ThemeToggle } from '../theme/theme-toggle';
import { EditProfilePopup } from '../profile/EditProfilePopup';
import { Switch } from '../ui/Switch';
import { useAuth } from '@/lib/AuthContext';
import { useMyMenuEnabled } from '@/lib/userPrefs';

interface SettingsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onAbout?: () => void;
  onEnterEditMode?: () => void;
  currentUser?: {
    name?: string;
    email?: string;
    role?: string;
    user_metadata?: {
      name?: string;
      role?: string;
      profileImage?: string;
    };
  };
}

export const SettingsPopup: React.FC<SettingsPopupProps> = ({
  isOpen,
  onClose,
  onAbout,
  onEnterEditMode,
  currentUser
}) => {
  const [showEditProfile, setShowEditProfile] = useState(false);
  const { user } = useAuth();
  const [myMenuEnabled, setMyMenuEnabled] = useMyMenuEnabled(user?.id);

  if (!isOpen) return null;

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only close if the click is directly on the backdrop itself
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <>
      <div 
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-10"
        onClick={handleBackdropClick}
      >
        <div className="relative w-full max-w-3xl bg-white dark:bg-dark-150 rounded-xl shadow-2xl overflow-hidden mx-4">
          {/* Header with close button */}
          <div className="absolute top-4 right-4 z-10">
            <button 
              onClick={onClose}
              className="text-white bg-black/20 hover:bg-black/40 rounded-full p-1"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Edit Profile */}
            <button
              type="button"
              onClick={() => setShowEditProfile(true)}
              className="flex items-center w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-dark-50 rounded-md"
            >
              <UserIcon className="mr-3 h-5 w-5 text-gray-400 dark:text-[#f26722]" />
              Edit Profile
            </button>
            
            {/* Theme Toggle - Hidden until fully flushed out */}
            {/* <div className="flex items-center w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-dark-50 rounded-md">
              <ThemeToggle />
            </div> */}

          {/* Enable My Menu */}
          <div className="flex items-center justify-between w-full px-4 py-3 text-sm text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-dark-50 rounded-md">
            <div className="flex flex-col">
              <span className="font-medium">Enable My Menu</span>
              <span className="text-xs text-gray-500 dark:text-dark-400">Use your custom sidebar shortcuts</span>
            </div>
            <Switch checked={!!myMenuEnabled} onCheckedChange={setMyMenuEnabled} />
          </div>

            {/* Enter Edit Mode - Only show if callback is provided (portal page) */}
            {onEnterEditMode && (
              <button
                onClick={() => {
                  onEnterEditMode();
                  onClose();
                }}
                className="flex items-center w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-dark-50 rounded-md"
              >
                <Edit3 className="mr-3 h-5 w-5 text-gray-400 dark:text-[#f26722]" />
                Enter Edit Mode
              </button>
            )}
            
            {/* About */}
            <button
              onClick={() => {
                onAbout?.();
                onClose();
              }}
              className="flex items-center w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-dark-50 rounded-md"
            >
              <FileText className="mr-3 h-5 w-5 text-gray-400 dark:text-[#f26722]" />
              About
            </button>
          </div>
        </div>
      </div>

      {/* Edit Profile Popup (if shown) */}
      {showEditProfile && currentUser && (
        <EditProfilePopup 
          isOpen={showEditProfile} 
          onClose={() => setShowEditProfile(false)} 
          currentUser={{
            name: currentUser.user_metadata?.name,
            email: currentUser.email,
            role: currentUser.user_metadata?.role,
            profileImage: currentUser.user_metadata?.profileImage
          }}
        />
      )}
    </>
  );
}; 