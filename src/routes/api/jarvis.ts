import Anthropic from "@anthropic-ai/sdk";
import { createFileRoute } from "@tanstack/react-router";
import { JARVIS_SYSTEM_PROMPT, sanitizeTurns } from "#/lib/jarvis";

// Streams JARVIS's reply as plain text. Reads ANTHROPIC_API_KEY from `.dev.vars`,
// which the launcher (`npm start`) creates on first run.
export const Route = createFileRoute("/api/jarvis")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          return new Response("JARVIS is offline: no API key found. Start JARVIS with the launcher (npm start) to add one.", {
            status: 503,
          });
        }

        let body: { messages?: unknown };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON body.", { status: 400 });
        }
        const turns = sanitizeTurns(body.messages);
        if (!turns) {
          return new Response("Expected a non-empty conversation ending with a user message.", {
            status: 400,
          });
        }

        const client = new Anthropic({ apiKey });
        const stream = client.beta.messages.stream({
          model: "claude-opus-5-5",
          max_tokens: 4000,
          // Low effort keeps spoken replies fast; raise it for deeper strategy work.
          output_config: { effort: "low" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: [
            { type: "text", text: JARVIS_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
          ],
          messages: turns.map((t) => ({ role: t.role, content: t.text })),
        });

        const encoder = new TextEncoder();
        const readable = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              for await (const event of stream) {
                if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                  controller.enqueue(encoder.encode(event.delta.text));
                } else if (event.type === "message_delta" && event.delta.stop_reason === "refusal") {
                  controller.enqueue(
                    encoder.encode("\n\nI'm afraid I can't help with that one. Ask me something else."),
                  );
                }
              }
            } catch (error) {
              console.error("JARVIS stream failed", error);
              const message =
                error instanceof Anthropic.AuthenticationError
                  ? "My API key was rejected. Delete the .dev.vars file and restart me to enter a new one."
                  : error instanceof Anthropic.RateLimitError
                    ? "I'm getting a lot of requests right now. Try again in a moment."
                    : "Something went wrong on my end. Please try again.";
              controller.enqueue(encoder.encode(`\n\n${message}`));
            } finally {
              controller.close();
            }
          },
          cancel() {
            stream.abort();
          },
        });

        return new Response(readable, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
