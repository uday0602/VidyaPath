import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { EDUQUEST_SYSTEM_PROMPT } from "./functions/src/lib/eduquestPrompt";

const PORT = 3000;
const HOST = "0.0.0.0";

// Secure API key configured on server
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  "AQ.Ab8RN6Lb6cc5ksi7JScwnp3Ag0CtAoPMMiQEAD0--34ZAUXVgg";

const CANDIDATE_MODELS = [
  "gemini-3.7-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.6-flash"
];

async function startServer() {
  const app = express();

  app.use(express.json());

  // Health endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // User database file path
  const dataDir = path.join(process.cwd(), "data");
  const usersDbPath = path.join(dataDir, "users.json");

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Pre-seed users if file does not exist
  const initialUsers = [
    {
      uid: "admin-uday",
      email: "uday12462@gmail.com",
      name: "Uday (App Owner)",
      role: "admin",
      classLevel: 12,
      board: "CBSE",
      stream: "PCM",
      goal: "board_jee",
      subjects: ["mathematics", "physics", "chemistry"],
      xp: 4500,
      stars: 350,
      questionsSolved: 120,
      modulesCompleted: 18,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      uid: "demo-aarav",
      email: "aarav@vidyapath.demo",
      name: "Aarav Sharma",
      role: "student",
      classLevel: 10,
      board: "CBSE",
      stream: null,
      goal: "board_jee",
      subjects: ["mathematics", "physics", "chemistry"],
      xp: 2450,
      stars: 180,
      questionsSolved: 48,
      modulesCompleted: 6,
      createdAt: new Date(Date.now() - 17 * 86400000).toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      uid: "demo-priya",
      email: "priya@vidyapath.demo",
      name: "Priya Nair",
      role: "student",
      classLevel: 11,
      board: "CBSE",
      stream: "PCM",
      goal: "board",
      subjects: ["mathematics", "physics", "chemistry"],
      xp: 1800,
      stars: 90,
      questionsSolved: 32,
      modulesCompleted: 4,
      createdAt: new Date(Date.now() - 12 * 86400000).toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      uid: "demo-rahul",
      email: "rahul@vidyapath.demo",
      name: "Rahul Verma",
      role: "student",
      classLevel: 12,
      board: "CBSE",
      stream: "PCB",
      goal: "board_neet",
      subjects: ["physics", "chemistry", "biology"],
      xp: 1250,
      stars: 60,
      questionsSolved: 24,
      modulesCompleted: 3,
      createdAt: new Date(Date.now() - 8 * 86400000).toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      uid: "demo-meera",
      email: "meera@vidyapath.demo",
      name: "Meera Iyer",
      role: "student",
      classLevel: 10,
      board: "ICSE",
      stream: null,
      goal: "board_jee",
      subjects: ["mathematics", "physics", "chemistry"],
      xp: 2100,
      stars: 140,
      questionsSolved: 41,
      modulesCompleted: 5,
      createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  if (!fs.existsSync(usersDbPath)) {
    fs.writeFileSync(usersDbPath, JSON.stringify(initialUsers, null, 2));
  }

  function readUsersDb(): any[] {
    try {
      if (!fs.existsSync(usersDbPath)) return initialUsers;
      const content = fs.readFileSync(usersDbPath, "utf-8");
      return JSON.parse(content || "[]");
    } catch {
      return initialUsers;
    }
  }

  function writeUsersDb(users: any[]): void {
    try {
      fs.writeFileSync(usersDbPath, JSON.stringify(users, null, 2));
    } catch (err) {
      console.error("Failed to write users db", err);
    }
  }

  // Centralized user sync endpoint - called whenever any user creates/updates profile
  app.post("/api/users/sync", (req, res) => {
    try {
      const user = req.body;
      if (!user || (!user.uid && !user.email)) {
        res.status(400).json({ error: "Invalid user data" });
        return;
      }
      const users = readUsersDb();
      const existingIndex = users.findIndex(
        (u) => (user.uid && u.uid === user.uid) || (user.email && u.email?.toLowerCase() === user.email.toLowerCase())
      );

      const normalizedUser = {
        uid: user.uid || `usr_${Date.now()}`,
        email: user.email || "anonymous@vidyapath.edu",
        name: user.name || "Student",
        role: user.role || "student",
        classLevel: Number(user.classLevel) || 10,
        board: user.board || "CBSE",
        stream: user.stream || null,
        language: user.language || "en",
        goal: user.goal || "board",
        subjects: Array.isArray(user.subjects) ? user.subjects : ["mathematics"],
        xp: Number(user.xp) || 0,
        stars: Number(user.stars) || 0,
        questionsSolved: Number(user.questionsSolved) || 0,
        modulesCompleted: Number(user.modulesCompleted) || 0,
        problemsSolved: Number(user.problemsSolved) || 0,
        createdAt: user.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (existingIndex >= 0) {
        users[existingIndex] = { ...users[existingIndex], ...normalizedUser };
      } else {
        users.unshift(normalizedUser);
      }
      writeUsersDb(users);
      res.json({ success: true, count: users.length });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Sync failed" });
    }
  });

  // Admin user database listing endpoint
  app.get("/api/admin/users", (_req, res) => {
    try {
      const users = readUsersDb();
      res.json({
        success: true,
        total: users.length,
        users,
        firebase: {
          projectId: "woven-analyst-s3skh",
          databaseId: "ai-studio-vidyapath-586c39bf-0539-4e55-883c-51165ddaff25",
          consoleUrl:
            "https://console.firebase.google.com/project/woven-analyst-s3skh/firestore/databases/ai-studio-vidyapath-586c39bf-0539-4e55-883c-51165ddaff25/data"
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to load users" });
    }
  });

  // Admin user database export
  app.get("/api/admin/users/export", (req, res) => {
    try {
      const users = readUsersDb();
      const format = req.query.format === "csv" ? "csv" : "json";
      if (format === "csv") {
        const headers = ["UID", "Name", "Email", "Role", "Class", "Board", "Stream", "Goal", "XP", "Stars", "QuestionsSolved", "CreatedAt"];
        const rows = users.map((u) => [
          `"${u.uid || ""}"`,
          `"${(u.name || "").replace(/"/g, '""')}"`,
          `"${(u.email || "").replace(/"/g, '""')}"`,
          `"${u.role || "student"}"`,
          `"${u.classLevel || ""}"`,
          `"${u.board || ""}"`,
          `"${u.stream || ""}"`,
          `"${u.goal || ""}"`,
          `"${u.xp || 0}"`,
          `"${u.stars || 0}"`,
          `"${u.questionsSolved || 0}"`,
          `"${u.createdAt || ""}"`
        ]);
        const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", 'attachment; filename="vidyapath_users_database.csv"');
        res.send(csvContent);
      } else {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", 'attachment; filename="vidyapath_users_database.json"');
        res.send(JSON.stringify(users, null, 2));
      }
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Export failed" });
    }
  });

  // AI Tutor endpoint - proxies Gemini server-side so guests and shared users don't need their own key
  app.post("/api/ai/ask", async (req, res) => {
    try {
      const data = req.body || {};
      const apiKey = GEMINI_API_KEY;

      if (!apiKey) {
        res.status(200).json({
          text: null,
          source: "fallback",
          notice: null
        });
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
      const userPrompt = data.message
        ? promptPrefix
          ? `${promptPrefix}\n\nStudent question/input: ${data.message}`
          : data.message
        : promptPrefix;

      const systemInstruction = [
        EDUQUEST_SYSTEM_PROMPT,
        `Student context: Class ${data.userClass || 10}, Goal: ${data.userGoal || "Board/JEE/NEET"}.`,
        data.topicName ? `Active topic context (do not restrict your answer): ${data.topicName}` : ""
      ]
        .filter(Boolean)
        .join("\n\n");

      let generatedText: string | null = null;
      let lastErrorMsg = "";

      for (const model of CANDIDATE_MODELS) {
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
        res.json({
          text: generatedText,
          source: "gemini",
          notice: null
        });
      } else {
        res.json({
          text: null,
          source: "fallback",
          notice: null,
          debug: lastErrorMsg ? `Model failed: ${lastErrorMsg}` : undefined
        });
      }
    } catch (err: any) {
      res.json({
        text: null,
        source: "fallback",
        notice: null,
        debug: err?.message
      });
    }
  });

  // In development, hook up Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    // In production (shared preview and Cloud Run deployment)
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Express v5 wildcard route
    app.get("*all", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`EduQuest server listening on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
