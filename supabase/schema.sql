-- EduQuest Supabase PostgreSQL Database Schema
-- Production Ready with Row Level Security (RLS), Relationships, and Indexes

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Users Table (Synchronized with Supabase auth.users or custom auth)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Student Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  class_level INT NOT NULL CHECK (class_level BETWEEN 9 AND 12),
  board TEXT NOT NULL DEFAULT 'CBSE',
  stream TEXT,
  language TEXT DEFAULT 'en',
  goal TEXT NOT NULL DEFAULT 'board',
  subjects JSONB DEFAULT '["mathematics", "physics", "chemistry"]'::jsonb,
  xp INT NOT NULL DEFAULT 0,
  stars INT NOT NULL DEFAULT 0,
  credit_score INT NOT NULL DEFAULT 750,
  bio TEXT DEFAULT 'Dedicated student preparing for excellence.',
  accuracy NUMERIC(5,2) DEFAULT 0.0,
  questions_solved INT NOT NULL DEFAULT 0,
  modules_completed INT NOT NULL DEFAULT 0,
  avatar TEXT DEFAULT 'student-1',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_profile UNIQUE (user_id)
);

-- 4. Chapters Table
CREATE TABLE IF NOT EXISTS public.chapters (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  class_level INT NOT NULL CHECK (class_level BETWEEN 9 AND 12),
  name TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 1,
  sample_only BOOLEAN NOT NULL DEFAULT FALSE,
  exam_tags JSONB DEFAULT '["board"]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Course Topics Table
CREATE TABLE IF NOT EXISTS public.topics (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL,
  class_level INT NOT NULL CHECK (class_level BETWEEN 9 AND 12),
  name TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 1,
  has_content BOOLEAN NOT NULL DEFAULT TRUE,
  concept TEXT NOT NULL,
  key_points JSONB DEFAULT '[]'::jsonb,
  formulae JSONB DEFAULT '[]'::jsonb,
  examples JSONB DEFAULT '[]'::jsonb,
  common_mistakes JSONB DEFAULT '[]'::jsonb,
  revision JSONB,
  quiz_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Course Modules Table (Study blocks, short notes, practice)
CREATE TABLE IF NOT EXISTS public.modules (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL,
  class_level INT NOT NULL CHECK (class_level BETWEEN 9 AND 12),
  title TEXT NOT NULL,
  description TEXT,
  estimated_minutes INT NOT NULL DEFAULT 15,
  order_index INT NOT NULL DEFAULT 1,
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Module Progress Table (Automatic progress tracking per student)
CREATE TABLE IF NOT EXISTS public.module_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('started', 'completed')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_module UNIQUE (user_id, module_id)
);

-- 8. Quizzes & Question Bank Table
CREATE TABLE IF NOT EXISTS public.quizzes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  topic_id TEXT REFERENCES public.topics(id) ON DELETE SET NULL,
  chapter_id TEXT REFERENCES public.chapters(id) ON DELETE SET NULL,
  subject_id TEXT NOT NULL,
  class_level INT NOT NULL CHECK (class_level BETWEEN 9 AND 12),
  level INT NOT NULL DEFAULT 1,
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  time_limit_sec INT NOT NULL DEFAULT 300,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Quiz Attempts Table (Scores, accuracy, wrong-answer review)
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  quiz_id TEXT NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  total INT NOT NULL DEFAULT 0,
  accuracy NUMERIC(5,2) NOT NULL DEFAULT 0.0,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  results JSONB NOT NULL DEFAULT '{}'::jsonb,
  wrong_answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  finalized BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  finalized_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Revision Progress Table (Persistent topic revision)
CREATE TABLE IF NOT EXISTS public.revision_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  chapter_id TEXT,
  subject_id TEXT,
  class_level INT,
  revised_at TIMESTAMPTZ DEFAULT NOW(),
  revision_count INT NOT NULL DEFAULT 1,
  last_revised_date DATE DEFAULT CURRENT_DATE,
  CONSTRAINT unique_user_topic_revision UNIQUE (user_id, topic_id)
);

-- 11. Spin State & Rewards Table
CREATE TABLE IF NOT EXISTS public.spin_state (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  next_spin_at TIMESTAMPTZ,
  last_result TEXT,
  total_spins INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.spin_rewards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  result TEXT NOT NULL,
  xp INT NOT NULL DEFAULT 0,
  stars INT NOT NULL DEFAULT 0,
  badge_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Study Buddies (Study Twin matching & connection)
CREATE TABLE IF NOT EXISTS public.study_buddies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  buddy_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('pending', 'connected', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_study_pair UNIQUE (user_id, buddy_id)
);

-- 13. Streaks Table
CREATE TABLE IF NOT EXISTS public.streaks (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  current_streak INT NOT NULL DEFAULT 1,
  longest_streak INT NOT NULL DEFAULT 1,
  last_activity_date DATE DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Achievements & Badges Table
CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_badge UNIQUE (user_id, badge_id)
);

-- 15. Create Indexes for High Performance
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_class_goal ON public.profiles(class_level, goal);
CREATE INDEX IF NOT EXISTS idx_chapters_class_subject ON public.chapters(class_level, subject_id);
CREATE INDEX IF NOT EXISTS idx_topics_chapter ON public.topics(chapter_id);
CREATE INDEX IF NOT EXISTS idx_modules_topic ON public.modules(topic_id);
CREATE INDEX IF NOT EXISTS idx_module_progress_user ON public.module_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON public.quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_revision_progress_user ON public.revision_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_spin_rewards_user ON public.spin_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_study_buddies_user ON public.study_buddies(user_id);

-- 16. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revision_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spin_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spin_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_buddies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

-- 17. Row Level Security Policies
-- Profiles: Users can select all profiles (for study buddy discovery) but only update their own
CREATE POLICY "Public profiles are viewable by everyone" 
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" 
  ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Module Progress: Users can only see and modify their own progress
CREATE POLICY "Users manage their own module progress"
  ON public.module_progress FOR ALL USING (auth.uid() = user_id);

-- Quiz Attempts: Users can only see and record their own attempts
CREATE POLICY "Users manage their own quiz attempts"
  ON public.quiz_attempts FOR ALL USING (auth.uid() = user_id);

-- Revision Progress: Users manage their own revision
CREATE POLICY "Users manage their own revision progress"
  ON public.revision_progress FOR ALL USING (auth.uid() = user_id);

-- Spin State & Rewards: Users manage their own spin state
CREATE POLICY "Users view and manage their spin state"
  ON public.spin_state FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users view and claim their spin rewards"
  ON public.spin_rewards FOR ALL USING (auth.uid() = user_id);

-- Study Buddies: Users can view and manage their buddy requests
CREATE POLICY "Users view their own study buddies"
  ON public.study_buddies FOR ALL USING (auth.uid() = user_id OR auth.uid() = buddy_id);

-- Streaks: Users view and update their streaks
CREATE POLICY "Users view and update their own streaks"
  ON public.streaks FOR ALL USING (auth.uid() = user_id);

-- Achievements: Users view their achievements
CREATE POLICY "Users view their own achievements"
  ON public.achievements FOR ALL USING (auth.uid() = user_id);
