// The sound played when a new ampOS version is ready ("Refresh the page to update").
// Each user picks one in the Settings menu. Only "classic" uses a file; the rest are
// made in the browser, so adding one needs no new audio file.

export const UPDATE_SOUND_PREF = "ui.updateSound";

export type UpdateSoundId = "classic" | "chime" | "ding" | "pop" | "arcade" | "none";

export const UPDATE_SOUND_DEFAULT: UpdateSoundId = "classic";

export const UPDATE_SOUND_OPTIONS: { id: UpdateSoundId; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "chime", label: "Chime" },
  { id: "ding", label: "Ding" },
  { id: "pop", label: "Pop" },
  { id: "arcade", label: "Arcade" },
  { id: "none", label: "None (silent)" },
];

type Note = { freq: number; start: number; length: number; wave?: OscillatorType };

const SYNTH_SOUNDS: Record<Exclude<UpdateSoundId, "classic" | "none">, Note[]> = {
  chime: [
    { freq: 659, start: 0, length: 0.5 },
    { freq: 988, start: 0.14, length: 0.7 },
  ],
  ding: [{ freq: 1319, start: 0, length: 1.1 }],
  pop: [{ freq: 520, start: 0, length: 0.12 }],
  arcade: [
    { freq: 988, start: 0, length: 0.09, wave: "square" },
    { freq: 1319, start: 0.09, length: 0.35, wave: "square" },
  ],
};

let ctx: AudioContext | null = null;

function playNotes(notes: Note[], volume: number) {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  const ac = (ctx ??= new Ctor());
  void ac.resume().catch(() => {});
  const now = ac.currentTime;
  for (const n of notes) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = n.wave ?? "sine";
    osc.frequency.value = n.freq;
    // Square waves are much louder than sine at the same level.
    const peak = volume * (n.wave === "square" ? 0.12 : 0.35);
    gain.gain.setValueAtTime(0.0001, now + n.start);
    gain.gain.exponentialRampToValueAtTime(peak, now + n.start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.length);
    osc.connect(gain).connect(ac.destination);
    osc.start(now + n.start);
    osc.stop(now + n.start + n.length + 0.05);
  }
}

/** Never throws. Browsers block sound before the user has clicked the page; that's fine. */
export function playUpdateSound(id: UpdateSoundId, volume = 0.5) {
  try {
    if (id === "none") return;
    if (id === "classic" || !(id in SYNTH_SOUNDS)) {
      const audio = new Audio("/update.mp3");
      audio.volume = volume;
      void audio.play().catch(() => {});
      return;
    }
    playNotes(SYNTH_SOUNDS[id], volume);
  } catch {
    // Sound is a nicety; the toast is the real notification.
  }
}
