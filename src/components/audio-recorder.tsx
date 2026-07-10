"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * AudioRecorder — records audio in-browser via MediaRecorder API.
 *
 * Saves the recording as a Blob (audio/webm by default, the format
 * MediaRecorder produces on Chrome/Android). The blob is returned via
 * the onSave callback — caller is responsible for storing it in IndexedDB.
 *
 * Limitations:
 *   - MediaRecorder produces webm/opus on Chrome, not mp3. HTML5 <audio>
 *     plays webm fine, so this works for playback. If you need mp3, we'd
 *     need a wasm encoder (lamejs) — deferred.
 *   - Requires microphone permission. If denied, shows an error.
 */

interface AudioRecorderProps {
  /** Called when user saves a recording. */
  onSave: (blob: Blob, durationSec: number) => void;
  /** Existing audio URL to preview (if clip already has audio). */
  existingUrl?: string | null;
  /** Called when user deletes existing audio. */
  onDelete?: () => void;
  /** Whether there's existing audio. */
  hasExisting: boolean;
}

type RecorderState = "idle" | "recording" | "recorded" | "error";

export function AudioRecorder({
  onSave,
  existingUrl,
  onDelete,
  hasExisting,
}: AudioRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [recordingSec, setRecordingSec] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  const startRecording = async () => {
    setError(null);
    setState("idle");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Pick the best mime type the browser supports
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeType || "audio/webm",
        });
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedUrl(url);
        setState("recorded");
        // Stop the stream tracks
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      setState("recording");
      setRecordingSec(0);
      timerRef.current = setInterval(() => {
        setRecordingSec((s) => s + 1);
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Permission") || msg.includes("denied")) {
        setError("Microphone permission denied. Allow mic access to record.");
      } else {
        setError(`Recording failed: ${msg}`);
      }
      setState("error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const cancelRecording = () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRecordingSec(0);
    setState("idle");
  };

  const saveRecording = () => {
    if (!recordedBlob) return;
    onSave(recordedBlob, recordingSec);
    // Reset to idle after save
    cancelRecording();
  };

  const togglePreview = () => {
    if (!previewAudioRef.current) return;
    if (isPreviewPlaying) {
      previewAudioRef.current.pause();
    } else {
      void previewAudioRef.current.play();
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Record audio
        </span>
        {state === "recording" && (
          <span className="flex items-center gap-1 text-xs text-destructive font-mono">
            <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            REC {formatTime(recordingSec)}
          </span>
        )}
      </div>

      {/* Recording controls */}
      {state === "idle" || state === "error" ? (
        <Button onClick={startRecording} size="sm" className="w-full">
          <Mic className="w-4 h-4 mr-2" />
          Start recording
        </Button>
      ) : state === "recording" ? (
        <Button onClick={stopRecording} size="sm" variant="destructive" className="w-full">
          <Square className="w-4 h-4 mr-2" />
          Stop recording ({formatTime(recordingSec)})
        </Button>
      ) : state === "recorded" ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
            <Button onClick={togglePreview} size="sm" variant="outline">
              {isPreviewPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </Button>
            <div className="flex-1 text-xs font-mono">
              {formatTime(recordingSec)} recording
            </div>
            <Button onClick={cancelRecording} size="sm" variant="ghost">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
          <audio
            ref={previewAudioRef}
            src={recordedUrl ?? undefined}
            onPlay={() => setIsPreviewPlaying(true)}
            onPause={() => setIsPreviewPlaying(false)}
            onEnded={() => setIsPreviewPlaying(false)}
            className="hidden"
          />
          <div className="flex gap-2">
            <Button onClick={saveRecording} size="sm" className="flex-1">
              Save recording
            </Button>
            <Button onClick={cancelRecording} size="sm" variant="outline">
              Discard
            </Button>
          </div>
        </div>
      ) : null}

      {/* Existing audio preview */}
      {hasExisting && state === "idle" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
            <Button
              onClick={() => {
                if (previewAudioRef.current) {
                  if (isPreviewPlaying) {
                    previewAudioRef.current.pause();
                  } else {
                    void previewAudioRef.current.play();
                  }
                }
              }}
              size="sm"
              variant="outline"
            >
              {isPreviewPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <div className="flex-1 text-xs">Existing audio</div>
            {onDelete && (
              <Button onClick={onDelete} size="sm" variant="ghost" className="text-destructive">
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
          <audio
            ref={previewAudioRef}
            src={existingUrl ?? undefined}
            onPlay={() => setIsPreviewPlaying(true)}
            onPause={() => setIsPreviewPlaying(false)}
            onEnded={() => setIsPreviewPlaying(false)}
            className="hidden"
          />
        </div>
      )}

      {error && (
        <div className="text-xs text-destructive p-2 rounded-md bg-destructive/10">
          {error}
        </div>
      )}
    </Card>
  );
}
