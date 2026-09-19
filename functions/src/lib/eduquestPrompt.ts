import type { AiMode } from "../types.js";

export const EDUQUEST_SYSTEM_PROMPT = `# EduQuest Universal AI Tutor – System Prompt

You are EduQuest AI Tutor, an intelligent educational assistant for students from Classes 9–12 (CBSE, ICSE, State Boards), JEE, and NEET aspirants.

## Your Role

Answer **any question the user asks**, not just questions from the currently selected topic or module.

You can help with:

* Physics, Chemistry, Mathematics, Biology
* English and other school subjects
* Computer Science and Coding (C, C++, Python, Java, HTML, CSS, JavaScript)
* General Knowledge
* Study techniques
* Exam preparation
* Career guidance
* Doubt solving
* Logical reasoning
* Everyday educational questions

## Response Rules

* Give accurate and complete answers.
* Explain concepts in simple language first, then provide detailed explanations if needed.
* When appropriate, include examples, formulas, diagrams (text-based), or step-by-step solutions.
* If the user asks for MCQs, notes, summaries, or practice questions, generate them.
* If the user asks coding questions, provide working code with explanation.
* Adapt explanations to the student's level.

## Context Awareness

* If the user is inside a subject module, use that as helpful context, but **never restrict your answers** to that subject.
* If the user switches topics, answer the new topic naturally.
* Maintain conversation memory during the chat.

## When the Question Is Unclear

Ask a brief clarifying question instead of refusing.

Example:

* "Can you share the exact math problem?"
* "Which class are you studying in?"

## Tone

Be friendly, encouraging, patient, and concise.`;

export interface UniversalQueryContext {
  message?: string;
  mode: AiMode;
  topicName?: string | null;
  problemTitle?: string | null;
  userClass?: number | null;
  userGoal?: string | null;
  attemptAnswer?: string;
  attemptSteps?: string;
}

/**
 * Intelligent educational fallback response adhering strictly to the EduQuest persona
 * when the remote Gemini API is unavailable.
 */
export function generateEduQuestFallback(ctx: UniversalQueryContext): string {
  const query = (ctx.message || "").trim();
  const lower = query.toLowerCase();

  // If query is empty or just generic mode click
  if (!query) {
    switch (ctx.mode) {
      case "explain":
        return "I am EduQuest AI Tutor! Ask me to explain any concept across Physics, Chemistry, Maths, Biology, Coding, or other school subjects. What would you like to explore?";
      case "solve_with_me":
        return "I'm ready to solve problems step-by-step with you! Paste the question or problem statement, and let's tackle it together.";
      case "generate_questions":
        return "Tell me which topic or chapter you want practice questions for, or what difficulty level (Foundation, Board, JEE, NEET) you'd like.";
      case "check_answer":
        return "Paste your question and your answer, and I will check your reasoning and provide feedback.";
      case "find_mistake":
        return "Paste your working or steps, and I will help you pinpoint where the calculation, concept, or sign went off track.";
      case "revision":
        return "Which topic or chapter shall we revise? I'll summarize key definitions, formulae, and common exam traps.";
      case "exam":
        return "Welcome to Exam Mode! Name a topic or chapter, and I'll test you with an exam-style question.";
      default:
        return "Hello! I am EduQuest Universal AI Tutor. How can I help you today with your studies, coding, or exam prep?";
    }
  }

  // Check for coding & computer science questions
  if (
    lower.includes("python") ||
    lower.includes("javascript") ||
    lower.includes("java") ||
    lower.includes("c++") ||
    lower.includes("html") ||
    lower.includes("css") ||
    lower.includes("code") ||
    lower.includes("function") ||
    lower.includes("loop") ||
    lower.includes("array") ||
    lower.includes("recursion") ||
    lower.includes("algorithm")
  ) {
    if (lower.includes("loop") || lower.includes("for") || lower.includes("while")) {
      return `### Understanding Loops in Programming

Loops allow you to execute a block of code repeatedly until a specific condition is met.

#### Python Example:
\`\`\`python
# 1. For loop iterating through a range
for i in range(1, 6):
    print(f"Count: {i}")

# 2. While loop with a counter
count = 0
while count < 3:
    print("Keep practicing!")
    count += 1
\`\`\`

#### Key Points:
* **For loops** are ideal when you know how many times to iterate.
* **While loops** are best when the termination depends on a runtime condition.
* Always ensure the loop condition eventually turns false to avoid infinite loops.

Do you have a specific problem you'd like to implement with loops?`;
    }

    if (lower.includes("function") || lower.includes("def")) {
      return `### Functions in Programming

A function is an organized, reusable block of code used to perform a single related action.

#### Python Example:
\`\`\`python
def calculate_grade(marks):
    """Returns the grade based on marks percentage."""
    if marks >= 90:
        return "A+"
    elif marks >= 75:
        return "A"
    elif marks >= 60:
        return "B"
    else:
        return "Keep improving!"

# Example usage:
result = calculate_grade(88)
print("Student Grade:", result)
\`\`\`

Functions help keep your code modular, readable, and DRY (*Don't Repeat Yourself*). Let me know if you want to see an example in C++, Java, or JavaScript!`;
    }

    return `### Programming Solution

Here is a clear, structured way to solve this in **Python**:

\`\`\`python
def solution():
    # EduQuest: Working code example
    data = [10, 20, 30, 40, 50]
    total = sum(data)
    average = total / len(data)
    return {"total": total, "average": average}

print(solution())
\`\`\`

#### Explanation:
1. We define a modular function with clear naming.
2. We compute the result using built-in, efficient operations.
3. The output is structured and ready to test.

If you have a specific coding task, algorithm, or language requirement (C, C++, Java, JS), share it and we will build it together!`;
  }

  // Check for study techniques & exam preparation
  if (
    lower.includes("study technique") ||
    lower.includes("how to study") ||
    lower.includes("timetable") ||
    lower.includes("exam prep") ||
    lower.includes("focus") ||
    lower.includes("revision method") ||
    lower.includes("jee prep") ||
    lower.includes("neet prep")
  ) {
    return `### Proven Study & Exam Preparation Techniques

Here are the most effective evidence-based techniques to maximize retention and exam performance:

1. **Active Recall & Testing Effect**
   * Instead of re-reading notes passively, close the book and write down everything you remember or solve questions without looking at hints.

2. **Spaced Repetition**
   * Review notes after 1 day, 3 days, 1 week, and 1 month. This flattens the Ebbinghaus forgetting curve.

3. **The Feynman Technique**
   * Explain a complex concept (e.g. Lenz's Law, Integration by Parts) in simple language as if teaching a classmate. If you get stuck, re-read that exact subsection.

4. **Time-Blocked Deep Work (Pomodoro)**
   * Study with 100% focus for 25–45 minutes, followed by a 5-minute screen-free break. Complete 3–4 cycles per session.

5. **Error Log Notebook**
   * Maintain a dedicated notebook for every question you get wrong in mock tests or homework. Classify errors (calculation, formula misremembered, conceptual trap).

Would you like a customized study timetable based on your daily schedule?`;
  }

  // Check for career guidance
  if (
    lower.includes("career") ||
    lower.includes("after 10th") ||
    lower.includes("after 12th") ||
    lower.includes("engineer") ||
    lower.includes("doctor") ||
    lower.includes("scope")
  ) {
    return `### Career Guidance & Educational Pathways

Choosing your path depends on your strengths, interests, and target entrance examinations:

* **Science (PCM / MPC)**:
  * Pathways: Engineering (JEE Main/Advanced, B.Tech/BE), Computer Science & AI, Pure Sciences (IISc, IISER via IAT), Architecture (NATA), Defense (NDA).
* **Science (PCB / BiPC)**:
  * Pathways: Medicine (NEET-UG, MBBS, BDS), Biotechnology, Pharmacy (B.Pharm), Biomedical Engineering, Nursing, Veterinary Sciences.
* **Commerce (with/without Math)**:
  * Pathways: Chartered Accountancy (CA), Company Secretary (CS), Management (IPMAT, BBA), Economics & Finance.
* **Humanities / Arts**:
  * Pathways: Law (CLAT), Design (UCEED, NID), Civil Services (UPSC), Journalism, Psychology.

What specific subjects or industries excite you the most? I can outline the entrance exams, top colleges, and eligibility criteria for you!`;
  }

  // Check for clarification need if query is too brief (e.g. 1-2 words)
  if (query.length < 5 && !query.includes("?")) {
    return `I am here to help you! Could you share a bit more detail? For example:
* The exact problem statement or equation
* Which subject or topic you are studying
* What specific step you want to understand`;
  }

  // General Educational Response
  return `### EduQuest Explanation & Solution

**Question/Topic:** ${query}

#### 1. Core Concept
Every concept is easier when broken into fundamentals. When tackling problems in this area:
* Identify what is given and what needs to be determined.
* Check the underlying principles or governing laws.
* Ensure all physical quantities and units (e.g., SI units) are consistent.

#### 2. Step-by-Step Approach
1. **Analyze**: Write down the formula or relation connecting the variables.
2. **Substitute**: Plug in values carefully, observing signs and exponents.
3. **Verify**: Check if the resulting magnitude and units make physical sense.

#### 3. Practice & Self-Check
Try working through a related problem without looking at the solution steps. If you get stuck, tell me which step you're on, and I'll give you a focused hint!`;
}
