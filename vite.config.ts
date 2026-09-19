import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { GoogleGenAI } from "@google/genai";
import { EDUQUEST_SYSTEM_PROMPT } from "./functions/src/lib/eduquestPrompt";

const FIREBASE_MODULES = ["app", "auth", "firestore", "functions"];

function eduquestApiPlugin(injectedKey?: string): Plugin {
  return {
    name: "eduquest-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === "/api/ai/ask" && req.method === "POST") {
          let body = "";
          req.on("data", (chunk: Buffer) => {
            body += chunk.toString();
          });
          req.on("end", async () => {
            try {
              const data = JSON.parse(body || "{}");
              const apiKey = injectedKey || process.env.GEMINI_API_KEY;
              if (!apiKey) {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ text: null, source: "fallback", notice: null }));
                return;
              }
              const ai = new GoogleGenAI({ apiKey });

              const modePromptMap: Record<string, string> = {
                hint: "Give one hint for the next step only.",
                identify_concept: "Name the concept and formula this problem needs and why.",
                guide: "Guide me through the solution plan without solving it fully.",
                check_approach: `Check this approach and say what is right and what is missing: ${data.attemptSteps || ""}`,
                find_mistake: `My answer was "${data.attemptAnswer || ""}" with steps: ${data.attemptSteps || ""}. Find the mistake and classify it.`,
                full_explanation: "Give the complete step-by-step explanation.",
                explain: "Explain this concept clearly with one example.",
                solve_with_me: "Solve this with me one step at a time. Start with the first step and wait.",
                generate_questions: "Generate 3 practice questions of increasing difficulty with answers hidden at the end.",
                check_answer: `Check my answer "${data.attemptAnswer || ""}" and explain briefly.`,
                revision: "Give a compact revision sheet: concept, formulae, common mistakes, one quick question.",
                exam: "Act as an examiner: ask one exam-style question, then evaluate my reply strictly."
              };

              const promptPrefix = modePromptMap[data.mode] || "";
              const userPrompt = data.message ? (promptPrefix ? `${promptPrefix}\n\nStudent question/input: ${data.message}` : data.message) : promptPrefix;

              const systemInstruction = [
                EDUQUEST_SYSTEM_PROMPT,
                `Student context: Class ${data.userClass || 10}, Goal: ${data.userGoal || "Board/JEE/NEET"}.`,
                data.topicName ? `Active topic context (do not restrict your answer): ${data.topicName}` : ""
              ].filter(Boolean).join("\n\n");

              const candidateModels = ["gemini-3.7-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-3.6-flash"];
              let generatedText: string | null = null;
              let lastErrorMsg = "";

              for (const model of candidateModels) {
                try {
                  const genPromise = ai.models.generateContent({
                    model,
                    contents: userPrompt || "Hello! Can you help me?",
                    config: {
                      systemInstruction,
                      maxOutputTokens: 2048,
                      temperature: 0.5
                    }
                  });
                  const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("Model request timed out")), 15000)
                  );
                  const response: any = await Promise.race([genPromise, timeoutPromise]);
                  if (response?.text) {
                    generatedText = response.text;
                    break;
                  }
                } catch (err: any) {
                  lastErrorMsg = err?.message || String(err);
                }
              }

              if (generatedText) {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                  text: generatedText,
                  source: "gemini",
                  notice: null
                }));
              } else {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                  text: null,
                  source: "fallback",
                  notice: `Gemini unavailable: ${lastErrorMsg}`
                }));
              }
            } catch (err: any) {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({
                text: null,
                source: "fallback",
                notice: `Gemini error: ${err.message}`
              }));
            }
          });
          return;
        }
        next();
      });
    }
  };
}

// `vite build --mode demo` swaps the Firebase SDK for the in-browser shims in src/demo so the
// UI runs with seeded data and no Firebase project (used for the GitHub Pages preview).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const demo = mode === "demo" || !env.VITE_FIREBASE_API_KEY;
  return {
    server: {
      host: "0.0.0.0",
      port: 3000,
    },
    plugins: [react(), tailwindcss(), eduquestApiPlugin(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY)],
    resolve: {
      alias: demo
        ? FIREBASE_MODULES.map((name) => ({ find: new RegExp(`^firebase/${name}$`), replacement: fileURLToPath(new URL(`./src/demo/${name}.ts`, import.meta.url)) }))
        : []
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            ...(demo ? {} : { firebase: ["firebase/app", "firebase/auth", "firebase/firestore", "firebase/functions"] }),
            charts: ["recharts"]
          }
        }
      }
    }
  };
});
