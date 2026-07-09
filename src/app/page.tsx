"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { useUiStore, type Tab } from "@/store/ui-store";

const VALID_TABS: Tab[] = ["now-playing", "trips", "test-mode", "settings"];

export default function Home() {
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  // Read ?tab= from URL on mount (for PWA shortcut deep-links)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as Tab | null;
    if (tab && VALID_TABS.includes(tab)) {
      setActiveTab(tab);
      // Clean the URL
      window.history.replaceState({}, "", "/");
    }
  }, [setActiveTab]);

  return <AppShell />;
}
