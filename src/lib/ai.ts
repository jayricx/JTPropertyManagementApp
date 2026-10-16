/**
 * The LLM seam.
 *
 * One OpenAI-compatible chat endpoint, called with plain `fetch` — no SDK,
 * so swapping providers is an env var rather than a dependency. Any
 * OpenAI-compatible endpoint works (OpenAI, Groq, OpenRouter, Gemini's
 * compatibility layer, a local Ollama, …).
 *
 * With no `AI_API_KEY` every helper here returns null and callers fall back
 * to deterministic rules. The UI always labels which mode produced a
 * suggestion — a rule-based guess is never presented as AI.
 */

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const TIMEOUT_MS = 15_000;

export type AiSource = "ai" | "rules";

export function aiConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY);
}

export function aiMode(): AiSource {
  return aiConfigured() ? "ai" : "rules";
}

/** Strip a ```json fence some providers wrap answers in. */
function unwrap(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/**
 * Ask the model for JSON. Returns null on any failure (no key, network
 * error, non-2xx, unparseable answer) so callers can fall back silently —
 * a broken provider must never break a form.
 */
export async function aiJson<T>({
  system,
  user,
  maxTokens = 400,
}: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<T | null> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = (process.env.AI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = process.env.AI_MODEL ?? DEFAULT_MODEL;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(unwrap(content)) as T;
  } catch {
    return null;
  }
}

/** Clamp a model-provided number into a sane band; null when nonsense. */
export function clampNumber(
  value: unknown,
  { min, max }: { min: number; max: number },
): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}