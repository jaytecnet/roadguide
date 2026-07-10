"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { useUiStore, type Tab } from "@/store/ui-store";

const VALID_TABS: Tab[] = ["now-playing", "trips", "drive", "settings"];

export default function Home() {
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  // Read ?tab= from URL on mount (for PWA shortcut deep-links)
  // Also handle legacy "test-mode" → "drive" migration
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    let tab = params.get("tab") as Tab | null;
    if (tab === "test-mode") tab = "drive";
    if (tab && VALID_TABS.includes(tab)) {
      setActiveTab(tab);
      window.history.replaceState({}, "", "/");
    }
  }, [setActiveTab]);

  return <AppShell />;
}
