import { create } from "zustand";

/**
 * UI store — app shell state (active tab, expanded clip, settings).
 * Persisted to localStorage so the app reopens on the same tab.
 */

export type Tab = "now-playing" | "trips" | "test-mode" | "settings";

interface UiStore {
  activeTab: Tab;
  /** Clip id currently expanded in the now-playing detail view, or null. */
  expandedClipId: string | null;
  /** Whether the SLK slider in test mode is "live" (auto-firing triggers). */
  testModeLive: boolean;
  /** Audio playback rate (0.5–2.0). */
  playbackRate: number;

  setActiveTab: (tab: Tab) => void;
  setExpandedClip: (clipId: string | null) => void;
  setTestModeLive: (live: boolean) => void;
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

function persist(state: Pick<UiStore, "activeTab" | "playbackRate">) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeTab: state.activeTab, playbackRate: state.playbackRate }),
    );
  } catch {
    // Storage full or disabled — ignore
  }
}

const persisted = loadPersisted();

export const useUiStore = create<UiStore>((set, get) => ({
  activeTab: (persisted.activeTab as Tab) ?? "now-playing",
  expandedClipId: null,
  testModeLive: false,
  playbackRate: persisted.playbackRate ?? 1.0,

  setActiveTab: (tab) => {
    set({ activeTab: tab });
    persist({ activeTab: tab, playbackRate: get().playbackRate });
  },
  setExpandedClip: (clipId) => set({ expandedClipId: clipId }),
  setTestModeLive: (live) => set({ testModeLive: live }),
  setPlaybackRate: (rate) => {
    set({ playbackRate: rate });
    persist({ activeTab: get().activeTab, playbackRate: rate });
  },
}));
