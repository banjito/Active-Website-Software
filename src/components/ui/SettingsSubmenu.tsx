import React, { useState } from "react";
import { User as UserIcon, FileText, Edit3 } from "lucide-react";
import { EditProfilePopup } from "../profile/EditProfilePopup";
import { EmailDigestPreferences } from "../settings/EmailDigestPreferences";

export interface SettingsSubmenuUser {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  user_metadata?: {
    name?: string;
    role?: string;
    profileImage?: string;
  };
}

interface SettingsSubmenuProps {
  onClose: () => void;
  onAbout?: () => void;
  onEnterEditMode?: () => void;
  currentUser?: SettingsSubmenuUser;
}

export const SettingsSubmenu: React.FC<SettingsSubmenuProps> = ({
  onClose,
  onAbout,
  onEnterEditMode,
  currentUser,
}) => {
  const [showEditProfile, setShowEditProfile] = useState(false);

  return (
    <>
      <div
        className="w-80 max-w-[calc(100vw-2rem)] max-h-[min(32rem,calc(100vh-6rem))] overflow-y-auto rounded-none bg-white dark:bg-dark-150 shadow-lg ring-1 ring-black ring-opacity-5 z-50"
        role="menu"
        aria-label="Settings"
      >
        <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
          <p className="text-sm font-semibold text-neutral-900 dark:text-white">
            Settings
          </p>
        </div>

        <div className="py-1">
          <button
            type="button"
            onClick={() => setShowEditProfile(true)}
            className="flex items-center w-full px-4 py-2 text-sm text-neutral-700 dark:text-brand hover:bg-neutral-100 dark:hover:bg-dark-50"
          >
            <UserIcon className="mr-3 h-5 w-5 text-neutral-400 dark:text-brand" />
            Edit Profile
          </button>

          {onEnterEditMode && (
            <button
              type="button"
              onClick={() => {
                onEnterEditMode();
                onClose();
              }}
              className="flex items-center w-full px-4 py-2 text-sm text-neutral-700 dark:text-brand hover:bg-neutral-100 dark:hover:bg-dark-50"
            >
              <Edit3 className="mr-3 h-5 w-5 text-neutral-400 dark:text-brand" />
              Enter Edit Mode
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onAbout?.();
              onClose();
            }}
            className="flex items-center w-full px-4 py-2 text-sm text-neutral-700 dark:text-brand hover:bg-neutral-100 dark:hover:bg-dark-50"
          >
            <FileText className="mr-3 h-5 w-5 text-neutral-400 dark:text-brand" />
            About
          </button>
        </div>

        {currentUser?.id && (
          <EmailDigestPreferences
            userId={currentUser.id}
            userEmail={currentUser.email}
            compact
          />
        )}
      </div>

      {showEditProfile && currentUser && (
        <EditProfilePopup
          isOpen={showEditProfile}
          onClose={() => setShowEditProfile(false)}
          currentUser={{
            name: currentUser.user_metadata?.name ?? currentUser.name,
            email: currentUser.email,
            role: currentUser.user_metadata?.role ?? currentUser.role,
            profileImage: currentUser.user_metadata?.profileImage,
          }}
        />
      )}
    </>
  );
};
