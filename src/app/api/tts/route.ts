import { NextRequest, NextResponse } from "next/server";

/**
 * TTS endpoint — generates an MP3 from text via z-ai-web-dev-sdk.
 *
 * Used by:
 *   - The seed-audio generation script (scripts/generate-seed-audio.ts)
 *   - Phase 6 script editor (future — generates audio on demand)
 *
 * Backend-only — z-ai-web-dev-sdk MUST NOT be imported on the client.
 */

export async function POST(req: NextRequest) {
  try {
    const { text, voice = "tongtong", speed = 1.0 } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "text is required and must be a string" },
        { status: 400 },
      );
    }

    if (text.length > 1024) {
      return NextResponse.json(
        { error: `text exceeds 1024 chars (got ${text.length})` },
        { status: 400 },
      );
    }

    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();

    const response = await zai.audio.tts.create({
      input: text.trim(),
      voice,
      speed,
      response_format: "wav",
      stream: false,
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[/api/tts] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "TTS generation failed",
      },
      { status: 500 },
    );
  }
}
