"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Edit3,
  Trash2,
  MapPin,
  Mic,
  Upload,
  Sparkles,
  Save,
  X,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useTripStore } from "@/store/trip-store";
import { useToast } from "@/hooks/use-toast";
import type { Clip, GeofenceTrigger, SlkRangeTrigger, TriggerSpec } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AudioRecorder } from "./audio-recorder";
import { putAudio, hasAudio, createAudioUrl } from "@/lib/offline-db";
import { cn } from "@/lib/utils";

type EditorMode = "list" | "edit" | "create";

export function ClipsEditor() {
  const {
    clips,
    activeTripId,
    createClip,
    saveClip,
    deleteClip,
    deleteClipAudio,
    reloadClips,
  } = useTripStore();
  const { toast } = useToast();
  const [mode, setMode] = useState<EditorMode>("list");
  const [editingClip, setEditingClip] = useState<Clip | null>(null);

  useEffect(() => {
    void reloadClips();
  }, [reloadClips, activeTripId]);

  if (mode === "edit" || mode === "create") {
    return (
      <ClipEditorForm
        clip={editingClip}
        isNew={mode === "create"}
        onSave={async (clip) => {
          if (mode === "create") {
            await createClip(clip);
            toast({ title: "Clip created", description: clip.title });
          } else {
            await saveClip(clip);
            toast({ title: "Clip saved", description: clip.title });
          }
          setMode("list");
          setEditingClip(null);
        }}
        onCancel={() => {
          setMode("list");
          setEditingClip(null);
        }}
        onDelete={async (clipId) => {
          await deleteClip(clipId);
          toast({ title: "Clip deleted" });
          setMode("list");
          setEditingClip(null);
        }}
        onAudioSaved={async (clipId) => {
          // Refresh clips so audio status updates
          await reloadClips();
        }}
        onAudioDeleted={async (clipId) => {
          await deleteClipAudio(clipId);
          toast({ title: "Audio deleted" });
        }}
      />
    );
  }

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="px-1 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Clips</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add, edit, or delete POIs. Record audio in-browser or upload MP3s.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditingClip(null);
            setMode("create");
          }}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add
        </Button>
      </div>

      {clips.length === 0 ? (
        <Card className="p-8 text-center">
          <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No clips yet. Tap &quot;Add&quot; to create your first POI.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {clips.map((clip, idx) => (
            <ClipListRow
              key={clip.id}
              clip={clip}
              index={idx}
              onEdit={() => {
                setEditingClip(clip);
                setMode("edit");
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ClipListRow({
  clip,
  index,
  onEdit,
}: {
  clip: Clip;
  index: number;
  onEdit: () => void;
}) {
  return (
    <Card className="p-3">
      <button onClick={onEdit} className="w-full text-left">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center flex-shrink-0 text-[10px] font-mono text-muted-foreground">
            {index + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-medium truncate">{clip.title}</span>
              {clip.audioReady ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              )}
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              {clip.subtitle || clip.trigger.type === "geofence"
                ? `${(clip.trigger as GeofenceTrigger).lat.toFixed(4)}°, ${(clip.trigger as GeofenceTrigger).lon.toFixed(4)}° · ${(clip.trigger as GeofenceTrigger).radiusM}m`
                : `SLK ${(clip.trigger as SlkRangeTrigger).slkStart}–${(clip.trigger as SlkRangeTrigger).slkEnd}`}
            </div>
          </div>
          <Edit3 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </div>
      </button>
    </Card>
  );
}

// ============================================================================
// Clip Editor Form
// ============================================================================

function ClipEditorForm({
  clip,
  isNew,
  onSave,
  onCancel,
  onDelete,
  onAudioSaved,
  onAudioDeleted,
}: {
  clip: Clip | null;
  isNew: boolean;
  onSave: (clip: Clip) => void;
  onCancel: () => void;
  onDelete: (clipId: string) => void;
  onAudioSaved: (clipId: string) => Promise<void>;
  onAudioDeleted: (clipId: string) => Promise<void>;
}) {
  const { toast } = useToast();
  // Form state
  const [title, setTitle] = useState(clip?.title ?? "");
  const [subtitle, setSubtitle] = useState(clip?.subtitle ?? "");
  const [script, setScript] = useState(clip?.script ?? "");
  const [triggerType, setTriggerType] = useState<"geofence" | "slk-range">(
    clip?.trigger.type ?? "geofence",
  );
  // Geofence fields
  const [lat, setLat] = useState(
    clip?.trigger.type === "geofence" ? clip.trigger.lat : -31.8977,
  );
  const [lon, setLon] = useState(
    clip?.trigger.type === "geofence" ? clip.trigger.lon : 116.7664,
  );
  const [radiusM, setRadiusM] = useState(
    clip?.trigger.type === "geofence" ? clip.trigger.radiusM : 300,
  );
  const [direction, setDirection] = useState<
    "none" | "arriving" | "departing"
  >(
    clip?.trigger.type === "geofence" && clip.trigger.direction
      ? clip.trigger.direction
      : "none",
  );
  // SLK fields
  const [roadId, setRoadId] = useState(
    clip?.trigger.type === "slk-range" ? clip.trigger.roadId : "M031",
  );
  const [slkStart, setSlkStart] = useState(
    clip?.trigger.type === "slk-range" ? clip.trigger.slkStart : 0,
  );
  const [slkEnd, setSlkEnd] = useState(
    clip?.trigger.type === "slk-range" ? clip.trigger.slkEnd : 2,
  );
  const [slkDirection, setSlkDirection] = useState<"increasing" | "decreasing">(
    clip?.trigger.type === "slk-range" ? clip.trigger.direction : "increasing",
  );

  // Audio state
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioReady, setAudioReady] = useState(clip?.audioReady ?? false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [generatingTts, setGeneratingTts] = useState(false);

  // Load existing audio URL
  useEffect(() => {
    if (clip?.audioReady && clip.id) {
      void (async () => {
        const url = await createAudioUrl(clip.id);
        setAudioUrl(url);
      })();
    }
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [clip?.id, clip?.audioReady]);

  const buildTrigger = (): TriggerSpec => {
    if (triggerType === "slk-range") {
      return {
        type: "slk-range",
        roadId,
        slkStart,
        slkEnd,
        direction: slkDirection,
      };
    }
    const geo: GeofenceTrigger = {
      type: "geofence",
      lat,
      lon,
      radiusM,
    };
    if (direction !== "none") {
      geo.direction = direction;
    }
    return geo;
  };

  const buildClip = (): Clip => {
    return {
      id: clip?.id ?? `clip-custom-${Date.now()}`,
      tripId: clip?.tripId ?? "",
      title: title.trim() || "Untitled",
      subtitle: subtitle.trim() || undefined,
      script: script.trim(),
      durationSec: clip?.durationSec,
      trigger: buildTrigger(),
      audioId: clip?.audioId,
      audioReady,
      order: clip?.order ?? 0,
    };
  };

  const handleSave = () => {
    const built = buildClip();
    if (!built.title.trim()) {
      toast({ variant: "destructive", title: "Title required" });
      return;
    }
    onSave(built);
  };

  // --- Audio handlers ---

  const handleRecordingSave = async (blob: Blob, durationSec: number) => {
    if (!clip?.id) {
      toast({
        variant: "destructive",
        title: "Save the clip first",
        description: "Create the clip before recording audio.",
      });
      return;
    }
    await putAudio(clip.id, blob);
    setAudioReady(true);
    setAudioUrl(URL.createObjectURL(blob));
    await onAudioSaved(clip.id);
    toast({ title: "Recording saved", description: `${durationSec}s` });
  };

  const handleFileUpload = async (file: File) => {
    if (!clip?.id) {
      toast({
        variant: "destructive",
        title: "Save the clip first",
        description: "Create the clip before uploading audio.",
      });
      return;
    }
    setUploadingFile(true);
    try {
      const blob = new Blob([await file.arrayBuffer()], { type: file.type });
      await putAudio(clip.id, blob);
      setAudioReady(true);
      setAudioUrl(URL.createObjectURL(blob));
      await onAudioSaved(clip.id);
      toast({
        title: "Audio uploaded",
        description: `${file.name} (${(file.size / 1024).toFixed(0)} KB)`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setUploadingFile(false);
    }
  };

  const handleTtsGenerate = async () => {
    if (!clip?.id) {
      toast({
        variant: "destructive",
        title: "Save the clip first",
        description: "Create the clip before generating TTS.",
      });
      return;
    }
    if (!script.trim()) {
      toast({
        variant: "destructive",
        title: "Script required",
        description: "Write a script before generating TTS.",
      });
      return;
    }
    if (script.length > 1024) {
      toast({
        variant: "destructive",
        title: "Script too long",
        description: `TTS limit is 1024 chars (you have ${script.length}). Split into multiple clips.`,
      });
      return;
    }
    setGeneratingTts(true);
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: script.trim(),
          voice: "tongtong",
          speed: 1.0,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }
      const blob = await response.blob();
      await putAudio(clip.id, blob);
      setAudioReady(true);
      setAudioUrl(URL.createObjectURL(blob));
      await onAudioSaved(clip.id);
      toast({
        title: "TTS generated",
        description: `${(blob.size / 1024).toFixed(0)} KB`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "TTS failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setGeneratingTts(false);
    }
  };

  const handleDeleteAudio = async () => {
    if (!clip?.id) return;
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setAudioReady(false);
    await onAudioDeleted(clip.id);
  };

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Header with back + save */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <h2 className="text-sm font-semibold">
          {isNew ? "New clip" : "Edit clip"}
        </h2>
        <Button size="sm" onClick={handleSave}>
          <Save className="w-4 h-4 mr-1" />
          Save
        </Button>
      </div>

      {/* Basic info */}
      <Card className="p-4 space-y-3">
        <div>
          <Label htmlFor="title" className="text-xs">
            Title
          </Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. York Town Centre"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="subtitle" className="text-xs">
            Subtitle (optional)
          </Label>
          <Input
            id="subtitle"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="e.g. Founded 1831 · Population 2,500"
            className="mt-1"
          />
        </div>
      </Card>

      {/* Trigger */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Trigger type</Label>
          <Select
            value={triggerType}
            onValueChange={(v) => setTriggerType(v as "geofence" | "slk-range")}
          >
            <SelectTrigger className="w-[140px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="geofence">Geofence (lat/lon)</SelectItem>
              <SelectItem value="slk-range">SLK range</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {triggerType === "geofence" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="lat" className="text-xs">
                  Latitude
                </Label>
                <Input
                  id="lat"
                  type="number"
                  step="0.0001"
                  value={lat}
                  onChange={(e) => setLat(parseFloat(e.target.value))}
                  className="mt-1 font-mono"
                />
              </div>
              <div>
                <Label htmlFor="lon" className="text-xs">
                  Longitude
                </Label>
                <Input
                  id="lon"
                  type="number"
                  step="0.0001"
                  value={lon}
                  onChange={(e) => setLon(parseFloat(e.target.value))}
                  className="mt-1 font-mono"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="radius" className="text-xs">
                Radius (metres)
              </Label>
              <Input
                id="radius"
                type="number"
                step="50"
                min="50"
                max="5000"
                value={radiusM}
                onChange={(e) => setRadiusM(parseInt(e.target.value) || 300)}
                className="mt-1 font-mono"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                200–500m for towns, 500–1000m for lookouts/POIs
              </p>
            </div>
            <div>
              <Label className="text-xs">Direction filter (optional)</Label>
              <Select
                value={direction}
                onValueChange={(v) =>
                  setDirection(v as "none" | "arriving" | "departing")
                }
              >
                <SelectTrigger className="w-full h-8 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Either direction</SelectItem>
                  <SelectItem value="arriving">Arriving only</SelectItem>
                  <SelectItem value="departing">Departing only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        ) : (
          <>
            <div>
              <Label htmlFor="roadId" className="text-xs">
                Road ID
              </Label>
              <Input
                id="roadId"
                value={roadId}
                onChange={(e) => setRoadId(e.target.value)}
                placeholder="e.g. M031"
                className="mt-1 font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="slkStart" className="text-xs">
                  SLK start
                </Label>
                <Input
                  id="slkStart"
                  type="number"
                  step="0.1"
                  value={slkStart}
                  onChange={(e) => setSlkStart(parseFloat(e.target.value))}
                  className="mt-1 font-mono"
                />
              </div>
              <div>
                <Label htmlFor="slkEnd" className="text-xs">
                  SLK end
                </Label>
                <Input
                  id="slkEnd"
                  type="number"
                  step="0.1"
                  value={slkEnd}
                  onChange={(e) => setSlkEnd(parseFloat(e.target.value))}
                  className="mt-1 font-mono"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Direction</Label>
              <Select
                value={slkDirection}
                onValueChange={(v) =>
                  setSlkDirection(v as "increasing" | "decreasing")
                }
              >
                <SelectTrigger className="w-full h-8 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="increasing">Increasing (True Left)</SelectItem>
                  <SelectItem value="decreasing">Decreasing (True Right)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </Card>

      {/* Script */}
      <Card className="p-4 space-y-2">
        <Label htmlFor="script" className="text-xs">
          Narration script
        </Label>
        <Textarea
          id="script"
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="The narration text for TTS, or a reference script for your own recording..."
          className="min-h-[120px] text-sm"
        />
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{script.length} chars</span>
          <span className={cn(script.length > 1024 && "text-destructive")}>
            {script.length > 1024
              ? `${script.length - 1024} over TTS limit`
              : `${1024 - script.length} left for TTS`}
          </span>
        </div>
      </Card>

      {/* Audio source */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Audio</Label>
          {audioReady ? (
            <Badge variant="default" className="text-[10px]">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Ready
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">
              <AlertCircle className="w-3 h-3 mr-1" />
              No audio
            </Badge>
          )}
        </div>

        {isNew ? (
          <div className="text-xs text-muted-foreground p-2 rounded-md bg-muted/30">
            Save the clip first, then add audio (record / upload / TTS).
          </div>
        ) : (
          <>
            {/* Recording */}
            <AudioRecorder
              onSave={handleRecordingSave}
              existingUrl={audioUrl}
              onDelete={handleDeleteAudio}
              hasExisting={audioReady}
            />

            {/* File upload */}
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Upload file
              </span>
              <label className="flex items-center justify-center gap-2 p-3 rounded-md border border-dashed border-border cursor-pointer hover:bg-muted/30 transition-colors">
                <Upload className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {uploadingFile ? "Uploading..." : "Choose MP3 / WAV file"}
                </span>
                <input
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFileUpload(file);
                    e.target.value = ""; // reset for re-upload
                  }}
                />
              </label>
            </div>

            {/* TTS generate */}
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Generate TTS
              </span>
              <Button
                onClick={handleTtsGenerate}
                disabled={generatingTts || !script.trim() || script.length > 1024}
                size="sm"
                variant="outline"
                className="w-full"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {generatingTts
                  ? "Generating..."
                  : `Generate from script (${script.length}/1024)`}
              </Button>
            </div>
          </>
        )}
      </Card>

      {/* Delete (existing clips only) */}
      {!isNew && clip && (
        <>
          <Separator />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete this clip
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete clip?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes &quot;{clip.title}&quot; and its audio.
                  This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(clip.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
