import React from "react";
import type { AuthorProfile } from "@/services/interactionsService";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface AuthorAvatarProps {
  email: string;
  profile?: AuthorProfile;
  size?: number;
  className?: string;
}

/**
 * Clickable avatar for the person who logged an interaction. Shows their profile
 * picture (or initials fallback) and links to a mailto for that author.
 */
export const AuthorAvatar: React.FC<AuthorAvatarProps> = ({
  email,
  profile,
  size = 28,
  className = "",
}) => {
  const displayName =
    profile?.displayName || (email ? email.split("@")[0] : "Unknown");
  const avatarUrl = profile?.avatarUrl || null;
  const dim = { width: size, height: size };

  return (
    <a
      href={email ? `mailto:${email}` : undefined}
      title={`${displayName}${email ? ` · ${email}` : ""}`}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex shrink-0 rounded-full overflow-hidden ring-1 ring-neutral-200 dark:ring-neutral-600 hover:ring-[#f26722] transition-shadow ${className}`}
      style={dim}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          className="h-full w-full object-cover"
          style={dim}
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center bg-[#f26722]/10 text-[#f26722] font-semibold"
          style={{ fontSize: Math.round(size * 0.4) }}
        >
          {initials(displayName)}
        </span>
      )}
    </a>
  );
};

export default AuthorAvatar;
