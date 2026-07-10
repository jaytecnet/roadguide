import { create } from "zustand";

/**
 * UI store — app shell state (active tab, expanded clip, settings).
 * Persisted to localStorage so the app reopens on the same tab.
 */

export type Tab = "now-playing" | "trips" | "drive" | "clips" | "settings";

/**
 * Drive mode — determines the position source for trigger evaluation.
 *   - "test"  — SLK slider + town quick-jump buttons (no GPS needed)
 *   - "live"  — real device GPS through EKF (requires permission)
 */
export type DriveMode = "test" | "live";

interface UiStore {
  activeTab: Tab;
  /** Clip id currently expanded in the now-playing detail view, or null. */
  expandedClipId: string | null;
  /** Whether the SLK slider in test mode is "live" (auto-advancing). */
  testModeLive: boolean;
  /** Drive mode — Test (slider) or Live (GPS). */
  driveMode: DriveMode;
  /** Audio playback rate (0.5–2.0). */
  playbackRate: number;

  setActiveTab: (tab: Tab) => void;
  setExpandedClip: (clipId: string | null) => void;
  setTestModeLive: (live: boolean) => void;
  setDriveMode: (mode: DriveMode) => void;
  setPlaybackRate: (rate: number) => void;
}

const STORAGE_KEY = "wheatbelt-ui";

function loadPersisted(): Partial<UiStore> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function persist(state: Pick<UiStore, "activeTab" | "playbackRate" | "driveMode">) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        activeTab: state.activeTab,
        playbackRate: state.playbackRate,
        driveMode: state.driveMode,
      }),
    );
  } catch {
    // Storage full or disabled — ignore
  }
}

const persisted = loadPersisted();
// Migrate old "test-mode" tab value to "drive"
const migratedTab: Tab =
  (persisted.activeTab as string) === "test-mode" ? "drive" : (persisted.activeTab as Tab) ?? "now-playing";

export const useUiStore = create<UiStore>((set, get) => ({
  activeTab: migratedTab,
  expandedClipId: null,
  testModeLive: false,
  driveMode: (persisted.driveMode as DriveMode) ?? "test",
  playbackRate: persisted.playbackRate ?? 1.0,

  setActiveTab: (tab) => {
    set({ activeTab: tab });
    persist({ activeTab: tab, playbackRate: get().playbackRate, driveMode: get().driveMode });
  },
  setExpandedClip: (clipId) => set({ expandedClipId: clipId }),
  setTestModeLive: (live) => set({ testModeLive: live }),
  setDriveMode: (mode) => {
    set({ driveMode: mode });
    // Switching to live stops the test-mode simulation
    if (mode === "live") set({ testModeLive: false });
    persist({ activeTab: get().activeTab, playbackRate: get().playbackRate, driveMode: mode });
  },
  setPlaybackRate: (rate) => {
    set({ playbackRate: rate });
    persist({ activeTab: get().activeTab, playbackRate: rate, driveMode: get().driveMode });
  },
}));
