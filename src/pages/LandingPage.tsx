import { Link } from "react-router-dom";

const FLOW = ["NCERT", "Concept", "5 Levels", "Problem Lab", "Step-by-step thinking", "AI guidance", "Mistake analysis", "Adaptive practice", "Planning", "Progress", "Revision"];

const BENEFITS = [
  { title: "Learn how to think, not just the answer", body: "Every problem walks you through Given, Find, Concept, Formula, Solve and Verify. The AI coach hints before it explains." },
  { title: "Know exactly what to study next", body: "Weak topics, recent mistakes and your exam date turn into one recommendation and a daily time plan." },
  { title: "One path for Board, JEE and NEET Foundation", body: "NCERT chapters, five difficulty levels and exam-tagged problems in one place for Class 9 to 12." },
  { title: "Consistency that counts", body: "Streaks only grow with real learning. XP, Stars and rewards follow effort, not logins." }
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div>
          <p className="text-xl font-bold text-brand-700">VidyaPath AI</p>
          <p className="text-xs text-ink-500">One Path. From School to Success.</p>
        </div>
        <nav className="flex gap-2" aria-label="Account">
          <Link to="/login" className="btn-secondary">Log in</Link>
          <Link to="/register" className="btn-primary">Create account</Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-12 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">For students of Class 9 to 12</p>
        <h1 className="mt-3 text-4xl font-bold text-ink-900 sm:text-5xl">One Path. From School to Success.</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-ink-700">
          VidyaPath AI combines NCERT learning, Board preparation, JEE and NEET Foundation, a Problem Lab that teaches how to approach a question, an AI tutor that guides instead of answering, and a plan that adapts to your weak topics.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/register" className="btn-primary">Start learning</Link>
          <Link to="/login" className="btn-secondary">I already have an account</Link>
        </div>
      </section>

      <section className="bg-ink-100 py-10" aria-labelledby="flow-heading">
        <div className="mx-auto max-w-6xl px-6">
          <h2 id="flow-heading" className="text-center text-xl font-semibold">How VidyaPath is different</h2>
          <p className="mt-1 text-center text-sm text-ink-500">Most platforms stop at videos and answers. VidyaPath connects every step of learning into one loop.</p>
          <ol className="mt-6 flex flex-wrap justify-center gap-2">
            {FLOW.map((step, index) => (
              <li key={step} className="flex items-center gap-2">
                <span className="rounded-full border border-brand-500 bg-white px-3 py-1 text-sm font-medium text-brand-700">{step}</span>
                {index < FLOW.length - 1 && <span aria-hidden="true" className="text-ink-500">→</span>}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-12 sm:grid-cols-2" aria-label="Benefits">
        {BENEFITS.map((benefit) => (
          <div key={benefit.title} className="card">
            <p className="font-semibold">{benefit.title}</p>
            <p className="mt-1 text-sm text-ink-700">{benefit.body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-ink-200 py-6 text-center text-xs text-ink-500">
        Smart India Hackathon entry. AICTE, Problem Statement SIH26207, Theme: Smart Education, Title: Student Innovation - Smart Education.
      </footer>
    </div>
  );
}
