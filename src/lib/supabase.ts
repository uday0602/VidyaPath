import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { UserDoc, OutcomeResult } from "./types";

const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || "";
const envAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = Boolean(envUrl && envAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(envUrl, envAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

// Local fallback storage keys for zero-loss offline / demo resilience
const LOCAL_STORAGE_PREFIX = "eduquest_supabase_";

function getLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setLocal<T>(key: string, value: T): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // ignore local storage quota errors
  }
}

export interface StoredRevisionProgress {
  id: string;
  userId: string;
  topicId: string;
  chapterId?: string;
  revisedAt: string;
  revisionCount: number;
}

export interface StoredSpinReward {
  id: string;
  userId: string;
  result: string;
  xp: number;
  stars: number;
  badgeId: string | null;
  createdAt: string;
}

export interface StoredSpinState {
  userId: string;
  nextSpinAt: number | null;
  lastResult: string | null;
  totalSpins: number;
}

export interface StoredQuizAttempt {
  id: string;
  userId: string;
  quizId: string;
  score: number;
  total: number;
  accuracy: number;
  answers: Record<string, number>;
  wrongAnswers: { questionId: string; text: string; yourAnswer: string; correctAnswer: string; explanation: string }[];
  createdAt: string;
}

export interface StoredStudyBuddy {
  id: string;
  userId: string;
  buddyId: string;
  status: "connected" | "pending";
  createdAt: string;
}

export const supabaseService = {
  // Profiles
  async getProfile(userId: string): Promise<UserDoc | null> {
    if (supabase) {
      try {
        const { data, error } = await supabase.from("profiles").select("*").eq("user_id", userId).single();
        if (!error && data) {
          return {
            uid: data.user_id,
            email: data.email,
            name: data.name,
            role: data.role,
            classLevel: data.class_level,
            board: data.board,
            stream: data.stream,
            language: data.language || "en",
            goal: data.goal,
            subjects: data.subjects || [],
            xp: data.xp || 0,
            stars: data.stars || 0,
            questionsSolved: data.questions_solved || 0,
            modulesCompleted: data.modules_completed || 0,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          } as UserDoc;
        }
      } catch (err) {
        console.warn("Supabase getProfile error", err);
      }
    }
    // Fallback to local / sync
    return getLocal<UserDoc | null>(`profile_${userId}`, null);
  },

  async saveProfile(profile: UserDoc): Promise<void> {
    setLocal(`profile_${profile.uid}`, profile);
    // Also sync to server database
    try {
      fetch("/api/users/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      }).catch(() => {});
    } catch {}

    if (supabase) {
      try {
        await supabase.from("profiles").upsert({
          user_id: profile.uid,
          email: profile.email,
          name: profile.name,
          role: profile.role,
          class_level: profile.classLevel,
          board: profile.board,
          stream: profile.stream,
          language: profile.language,
          goal: profile.goal,
          subjects: profile.subjects,
          xp: profile.xp,
          stars: profile.stars,
          questions_solved: profile.questionsSolved,
          modules_completed: profile.modulesCompleted,
          updated_at: new Date().toISOString(),
        });
      } catch (err) {
        console.warn("Supabase saveProfile error", err);
      }
    }
  },

  // Module Progress
  async getCompletedModules(userId: string): Promise<string[]> {
    if (supabase) {
      try {
        const { data } = await supabase.from("module_progress").select("module_id").eq("user_id", userId).eq("status", "completed");
        if (data) return data.map((d: any) => d.module_id);
      } catch {}
    }
    return getLocal<string[]>(`completed_modules_${userId}`, []);
  },

  async markModuleCompleted(userId: string, moduleId: string, topicId: string, subjectId: string): Promise<void> {
    const list = getLocal<string[]>(`completed_modules_${userId}`, []);
    if (!list.includes(moduleId)) {
      list.push(moduleId);
      setLocal(`completed_modules_${userId}`, list);
    }
    if (supabase) {
      try {
        await supabase.from("module_progress").upsert({
          user_id: userId,
          module_id: moduleId,
          topic_id: topicId,
          subject_id: subjectId,
          status: "completed",
          completed_at: new Date().toISOString(),
        });
      } catch {}
    }
  },

  // Revision Progress
  async getRevisionList(userId: string): Promise<StoredRevisionProgress[]> {
    if (supabase) {
      try {
        const { data } = await supabase.from("revision_progress").select("*").eq("user_id", userId);
        if (data && data.length > 0) {
          return data.map((d: any) => ({
            id: d.id,
            userId: d.user_id,
            topicId: d.topic_id,
            chapterId: d.chapter_id,
            revisedAt: d.revised_at,
            revisionCount: d.revision_count,
          }));
        }
      } catch {}
    }
    return getLocal<StoredRevisionProgress[]>(`revisions_${userId}`, []);
  },

  async markTopicRevised(userId: string, topicId: string, chapterId?: string): Promise<StoredRevisionProgress> {
    const list = getLocal<StoredRevisionProgress[]>(`revisions_${userId}`, []);
    const existingIndex = list.findIndex((r) => r.topicId === topicId);
    let record: StoredRevisionProgress;
    if (existingIndex >= 0) {
      list[existingIndex].revisedAt = new Date().toISOString();
      list[existingIndex].revisionCount += 1;
      record = list[existingIndex];
    } else {
      record = {
        id: `rev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId,
        topicId,
        chapterId,
        revisedAt: new Date().toISOString(),
        revisionCount: 1,
      };
      list.push(record);
    }
    setLocal(`revisions_${userId}`, list);

    if (supabase) {
      try {
        await supabase.from("revision_progress").upsert({
          user_id: userId,
          topic_id: topicId,
          chapter_id: chapterId,
          revised_at: record.revisedAt,
          revision_count: record.revisionCount,
        });
      } catch {}
    }

    return record;
  },

  // Spin Wheel State & History
  async getSpinState(userId: string): Promise<StoredSpinState> {
    if (supabase) {
      try {
        const { data } = await supabase.from("spin_state").select("*").eq("user_id", userId).single();
        if (data) {
          return {
            userId: data.user_id,
            nextSpinAt: data.next_spin_at ? new Date(data.next_spin_at).getTime() : null,
            lastResult: data.last_result,
            totalSpins: data.total_spins || 0,
          };
        }
      } catch {}
    }
    return getLocal<StoredSpinState>(`spin_state_${userId}`, {
      userId,
      nextSpinAt: null,
      lastResult: null,
      totalSpins: 0,
    });
  },

  async getSpinHistory(userId: string): Promise<StoredSpinReward[]> {
    if (supabase) {
      try {
        const { data } = await supabase.from("spin_rewards").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(10);
        if (data) {
          return data.map((d: any) => ({
            id: d.id,
            userId: d.user_id,
            result: d.result,
            xp: d.xp,
            stars: d.stars,
            badgeId: d.badge_id,
            createdAt: d.created_at,
          }));
        }
      } catch {}
    }
    return getLocal<StoredSpinReward[]>(`spin_history_${userId}`, []);
  },

  async recordSpin(userId: string, outcome: { label: string; xp: number; stars: number; badgeId?: string | null }, cooldownHours = 24): Promise<{ nextSpinAt: number; reward: StoredSpinReward }> {
    const nextSpinAt = Date.now() + cooldownHours * 3600_000;
    const currentState = await this.getSpinState(userId);
    const updatedState: StoredSpinState = {
      userId,
      nextSpinAt,
      lastResult: outcome.label,
      totalSpins: (currentState.totalSpins || 0) + 1,
    };
    setLocal(`spin_state_${userId}`, updatedState);

    const reward: StoredSpinReward = {
      id: `spin_${Date.now()}`,
      userId,
      result: outcome.label,
      xp: outcome.xp,
      stars: outcome.stars,
      badgeId: outcome.badgeId || null,
      createdAt: new Date().toISOString(),
    };
    const history = getLocal<StoredSpinReward[]>(`spin_history_${userId}`, []);
    history.unshift(reward);
    setLocal(`spin_history_${userId}`, history.slice(0, 20));

    if (supabase) {
      try {
        await supabase.from("spin_state").upsert({
          user_id: userId,
          next_spin_at: new Date(nextSpinAt).toISOString(),
          last_result: outcome.label,
          total_spins: updatedState.totalSpins,
          updated_at: new Date().toISOString(),
        });
        await supabase.from("spin_rewards").insert({
          user_id: userId,
          result: outcome.label,
          xp: outcome.xp,
          stars: outcome.stars,
          badge_id: outcome.badgeId || null,
          created_at: reward.createdAt,
        });
      } catch {}
    }

    return { nextSpinAt, reward };
  },

  // Quiz Attempts
  async saveQuizAttempt(attempt: StoredQuizAttempt): Promise<void> {
    const history = getLocal<StoredQuizAttempt[]>(`quiz_attempts_${attempt.userId}`, []);
    history.unshift(attempt);
    setLocal(`quiz_attempts_${attempt.userId}`, history.slice(0, 50));

    if (supabase) {
      try {
        await supabase.from("quiz_attempts").insert({
          user_id: attempt.userId,
          quiz_id: attempt.quizId,
          score: attempt.score,
          total: attempt.total,
          accuracy: attempt.accuracy,
          answers: attempt.answers,
          wrong_answers: attempt.wrongAnswers,
          created_at: attempt.createdAt,
        });
      } catch {}
    }
  },

  async getQuizAttempts(userId: string): Promise<StoredQuizAttempt[]> {
    if (supabase) {
      try {
        const { data } = await supabase.from("quiz_attempts").select("*").eq("user_id", userId).order("created_at", { ascending: false });
        if (data) {
          return data.map((d: any) => ({
            id: d.id,
            userId: d.user_id,
            quizId: d.quiz_id,
            score: d.score,
            total: d.total,
            accuracy: Number(d.accuracy),
            answers: d.answers || {},
            wrongAnswers: d.wrong_answers || [],
            createdAt: d.created_at,
          }));
        }
      } catch {}
    }
    return getLocal<StoredQuizAttempt[]>(`quiz_attempts_${userId}`, []);
  },

  // Study Buddies & Peer Connect
  async getStudyBuddies(userId: string): Promise<string[]> {
    if (supabase) {
      try {
        const { data } = await supabase.from("study_buddies").select("buddy_id").eq("user_id", userId).eq("status", "connected");
        if (data) return data.map((d: any) => d.buddy_id);
      } catch {}
    }
    return getLocal<string[]>(`buddies_${userId}`, []);
  },

  async connectStudyBuddy(userId: string, buddyId: string): Promise<void> {
    const list = getLocal<string[]>(`buddies_${userId}`, []);
    if (!list.includes(buddyId)) {
      list.push(buddyId);
      setLocal(`buddies_${userId}`, list);
    }
    if (supabase) {
      try {
        await supabase.from("study_buddies").upsert({
          user_id: userId,
          buddy_id: buddyId,
          status: "connected",
        });
      } catch {}
    }
  },
};
