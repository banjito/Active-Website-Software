import React from "react";
import { Play, Volume2 } from "lucide-react";
import { usePreference } from "@/hooks/useUserPreferences";
import {
  UPDATE_SOUND_DEFAULT,
  UPDATE_SOUND_OPTIONS,
  UPDATE_SOUND_PREF,
  playUpdateSound,
  type UpdateSoundId,
} from "@/lib/updateSound";

export const UpdateSoundPreference: React.FC = () => {
  const [sound, setSound] = usePreference<UpdateSoundId>(
    UPDATE_SOUND_PREF,
    UPDATE_SOUND_DEFAULT,
  );

  return (
    <div className="px-3 py-3 border-t border-neutral-200 dark:border-neutral-700">
      <div className="flex items-center gap-2 mb-1">
        <Volume2 className="h-4 w-4 text-neutral-400 dark:text-brand shrink-0" />
        <label
          htmlFor="update-sound"
          className="text-sm font-semibold text-neutral-900 dark:text-white"
        >
          Update sound
        </label>
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
        Plays when a new version of ampOS is ready.
      </p>
      <div className="flex gap-2">
        <select
          id="update-sound"
          value={sound}
          onChange={(e) => {
            const next = e.target.value as UpdateSoundId;
            setSound(next, true);
            playUpdateSound(next);
          }}
          className="flex-1 min-w-0 rounded-none border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-100 px-2 py-1.5 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand"
        >
          {UPDATE_SOUND_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => playUpdateSound(sound)}
          disabled={sound === "none"}
          title="Play sound"
          aria-label="Play sound"
          className="shrink-0 rounded-none border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-100 px-2 text-neutral-700 dark:text-neutral-200 hover:border-brand hover:text-brand disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-neutral-700"
        >
          <Play className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
