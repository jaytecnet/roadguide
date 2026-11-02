import { NextRequest, NextResponse } from "next/server";

/**
 * TTS endpoint — turns clip script text into audio.
 *
 * Two providers, picked by the TTS_PROVIDER env var:
 *
 *   - "voicestudio" (default): a local VoiceStudio backend
 *     (https://github.com/debpalash/VoiceStudio) via its OpenAI-compatible
 *     POST /v1/audio/speech. Speaks in a cloned voice saved in VoiceStudio.
 *     Free, local, works offline once the model is installed. The VoiceStudio
 *     app must be running on the same machine as this Next.js server.
 *   - "zai": the original z-ai-web-dev-sdk cloud TTS ("tongtong" voice).
 *
 * Env vars (all optional):
 *   TTS_PROVIDER           "voicestudio" | "zai"          (default "voicestudio")
 *   VOICESTUDIO_URL        backend address                (default "http://localhost:3900")
 *   VOICESTUDIO_VOICE      saved voice profile name or ID (default "default")
 *   VOICESTUDIO_MODEL      VoiceStudio engine ID          (default "omnivoice")
 *   VOICESTUDIO_LANGUAGE   ISO 639-1 language code        (default "en")
 *
 * Request body: { text: string, voice?: string, speed?: number, format?: "mp3" | "wav" }
 * `voice` overrides the provider's default voice for that request.
 *
 * Backend-only — z-ai-web-dev-sdk MUST NOT be imported on the client.
 */

// Cloned-voice generation on a modest GPU takes ~30–60 s per clip.
export const maxDuration = 300;

const MAX_CHARS = 1024;

type Format = "mp3" | "wav";

const CONTENT_TYPES: Record<Format, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text: unknown = body?.text;
    const speed: number = typeof body?.speed === "number" ? body.speed : 1.0;
    const format: Format = body?.format === "wav" ? "wav" : "mp3";
    const voiceOverride: string | undefined =
      typeof body?.voice === "string" && body.voice.trim() ? body.voice.trim() : undefined;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "text is required and must be a string" },
        { status: 400 },
      );
    }

    if (text.length > MAX_CHARS) {
      return NextResponse.json(
        { error: `text exceeds ${MAX_CHARS} chars (got ${text.length})` },
        { status: 400 },
      );
    }

    const provider = (process.env.TTS_PROVIDER ?? "voicestudio").toLowerCase();

    const audio =
      provider === "zai"
        ? await synthesizeZai(text.trim(), voiceOverride ?? "tongtong", speed)
        : await synthesizeVoiceStudio(text.trim(), voiceOverride, speed, format);

    return new NextResponse(audio.buffer, {
      status: 200,
      headers: {
        "Content-Type": audio.contentType,
        "Content-Length": audio.buffer.length.toString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[/api/tts] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "TTS generation failed",
      },
      { status: error instanceof TtsError ? error.status : 500 },
    );
  }
}

class TtsError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function synthesizeVoiceStudio(
  text: string,
  voiceOverride: string | undefined,
  speed: number,
  format: Format,
): Promise<{ buffer: Buffer; contentType: string }> {
  const baseUrl = (process.env.VOICESTUDIO_URL ?? "http://localhost:3900").replace(/\/+$/, "");
  const voice = voiceOverride ?? process.env.VOICESTUDIO_VOICE ?? "default";

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.VOICESTUDIO_MODEL ?? "omnivoice",
        voice,
        input: text,
        speed,
        language: process.env.VOICESTUDIO_LANGUAGE ?? "en",
        response_format: format,
      }),
    });
  } catch {
    throw new TtsError(
      `Can't reach VoiceStudio at ${baseUrl}. Is the VoiceStudio app running on this machine?`,
      503,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new TtsError(
      `VoiceStudio returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      502,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? CONTENT_TYPES[format];

  // An error page saved as "audio" is worse than a clear failure.
  if (buffer.length < 1024 || !contentType.startsWith("audio/")) {
    throw new TtsError(
      `VoiceStudio returned unexpected content (${contentType}, ${buffer.length} bytes)`,
      502,
    );
  }

  return { buffer, contentType };
}

async function synthesizeZai(
  text: string,
  voice: string,
  speed: number,
): Promise<{ buffer: Buffer; contentType: string }> {
  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();

  const response = await zai.audio.tts.create({
    input: text,
    voice,
    speed,
    response_format: "wav",
    stream: false,
  });

  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(new Uint8Array(arrayBuffer)), contentType: "audio/wav" };
}
