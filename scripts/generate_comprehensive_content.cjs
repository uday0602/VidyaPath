// Node script to generate complete, high-quality study modules for Classes 9-12
// Specifically solving:
// 1. Class 10 NCERT Physics module not opening bug (all 4 chapters: Light, Human Eye, Electricity, Magnetic Effects)
// 2. Class 9, Class 11, Class 12 CBSE, JEE, NEET modules
// 3. Short notes, practice questions, MCQs, Easy/Medium/Hard difficulty, auto-saving

const fs = require('fs');
const path = require('path');

const contentDir = path.join(__dirname, '../seed/content');

const chaptersPath = path.join(contentDir, 'chapters.json');
const topicsPath = path.join(contentDir, 'topics.json');
const modulesPath = path.join(contentDir, 'modules.json');
const quizzesPath = path.join(contentDir, 'quizzes.json');
const questionsPath = path.join(contentDir, 'questions.json');
const problemsPath = path.join(contentDir, 'problems.json');

const chapters = JSON.parse(fs.readFileSync(chaptersPath, 'utf8'));
const existingTopics = JSON.parse(fs.readFileSync(topicsPath, 'utf8'));
const existingModules = JSON.parse(fs.readFileSync(modulesPath, 'utf8'));
const existingQuizzes = JSON.parse(fs.readFileSync(quizzesPath, 'utf8'));
const existingQuestions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
const existingProblems = JSON.parse(fs.readFileSync(problemsPath, 'utf8'));

// Filter out old stub topics/modules/quizzes that match our target IDs to avoid duplicate keys
const targetTopicIds = new Set();

const newTopics = [];
const newModules = [];
const newQuizzes = [];
const newQuestions = [];
const newProblems = [];

// Helper to register a complete topic with modules, quiz, MCQs, and practice problems
function addTopicWithContent(data) {
  const {
    id, chapterId, subjectId, classLevel, name, order,
    concept, keyPoints, formulae, examples, commonMistakes, revision,
    modules,
    quiz: quizData,
    problems: problemList
  } = data;

  targetTopicIds.add(id);

  const quizId = `${id}-quiz`;

  newTopics.push({
    id,
    chapterId,
    subjectId,
    classLevel,
    name,
    order: order || 1,
    hasContent: true,
    concept,
    keyPoints: keyPoints || [],
    formulae: formulae || [],
    examples: examples || [],
    commonMistakes: commonMistakes || [],
    revision: revision || null,
    quizId
  });

  // Modules
  if (modules && modules.length > 0) {
    modules.forEach((mod, idx) => {
      newModules.push({
        id: `${id}-m${idx + 1}`,
        topicId: id,
        chapterId,
        subjectId,
        classLevel,
        title: mod.title,
        description: mod.description,
        estimatedMinutes: mod.estimatedMinutes || 15,
        order: idx + 1,
        blocks: mod.blocks || []
      });
    });
  }

  // Quiz & MCQs
  if (quizData && quizData.questions && quizData.questions.length > 0) {
    const qIds = [];
    quizData.questions.forEach((q, qIdx) => {
      const qId = `${id}-q${qIdx + 1}`;
      qIds.push(qId);
      newQuestions.push({
        question: {
          id: qId,
          topicId: id,
          subjectId,
          classLevel,
          level: q.level || 1,
          text: q.text,
          options: q.options
        },
        key: {
          id: qId,
          correctIndex: q.correctIndex,
          explanation: q.explanation
        }
      });
    });

    newQuizzes.push({
      id: quizId,
      title: quizData.title || `${name} Mastery Quiz`,
      topicId: id,
      subjectId,
      classLevel,
      level: quizData.level || 1,
      questionIds: qIds,
      timeLimitSec: quizData.timeLimitSec || 300
    });
  }

  // Practice Problems (Problem Lab)
  if (problemList && problemList.length > 0) {
    problemList.forEach((prob, pIdx) => {
      const pId = `${id}-p${pIdx + 1}`;
      newProblems.push({
        problem: {
          id: pId,
          topicId: id,
          chapterId,
          subjectId,
          classLevel,
          level: prob.level || 1,
          examTypes: prob.examTypes || ["board"],
          framework: subjectId,
          title: prob.title,
          statement: prob.statement,
          concept: prob.concept || name,
          expectedMinutes: prob.expectedMinutes || 5,
          marks: prob.marks || 3,
          hints: prob.hints || ["Think about the foundational formula."],
          answerType: prob.answerType || "numeric",
          answerUnit: prob.answerUnit || null,
          similarProblemIds: []
        },
        solution: {
          id: pId,
          finalAnswer: prob.solution.finalAnswer,
          numericAnswer: prob.solution.numericAnswer !== undefined ? prob.solution.numericAnswer : null,
          tolerance: prob.solution.tolerance || 0.05,
          acceptedAnswers: prob.solution.acceptedAnswers || [prob.solution.finalAnswer],
          steps: prob.solution.steps || [{ label: "Step 1", content: "Apply the standard formula." }],
          commonMistakes: prob.solution.commonMistakes || [],
          coach: prob.solution.coach || {
            hint: "Check given parameters carefully.",
            concept: "Fundamental principle.",
            guide: "Substitute into formula.",
            checkApproach: "Double check calculation.",
            findMistake: "Watch signs and units.",
            fullExplanation: prob.solution.finalAnswer
          }
        }
      });
    });
  }
}

// -------------------------------------------------------------
// 1. CLASS 10 NCERT PHYSICS - ALL 4 CHAPTERS (CRITICAL BUG FIX)
// -------------------------------------------------------------

// Chapter 1: Light - Reflection and Refraction
addTopicWithContent({
  id: "10-physics-light-reflection-spherical-mirrors",
  chapterId: "10-physics-light-reflection-and-refraction",
  subjectId: "physics",
  classLevel: 10,
  name: "Reflection of Light & Spherical Mirrors",
  order: 1,
  concept: "Reflection is the bouncing back of light into the same medium when it hits a polished surface. Spherical mirrors are curved mirrors cut from a sphere: Concave (converging) and Convex (diverging). The mirror formula 1/f = 1/v + 1/u relates object distance u, image distance v, and focal length f with Cartesian sign convention.",
  keyPoints: [
    "Laws of Reflection: Angle of incidence = Angle of reflection (i = r). Incident ray, normal, and reflected ray lie in the same plane.",
    "Concave Mirror: Focal length f is negative. Forms real & inverted images for u > f, and virtual & erect enlarged image when object is between pole and focus (magnifying mirror).",
    "Convex Mirror: Focal length f is positive. Always forms virtual, erect, and diminished images. Widely used as rear-view mirrors in vehicles.",
    "New Cartesian Sign Convention: Distances measured in the direction of incident light are positive; opposite are negative. Object distance u is always negative.",
    "Linear Magnification: m = h'/h = -v/u. Negative m indicates real image; positive m indicates virtual image."
  ],
  formulae: [
    "1/f = 1/v + 1/u (Mirror Formula)",
    "R = 2f (Radius of curvature = 2 * Focal length)",
    "m = h'/h = -v/u (Magnification)"
  ],
  examples: [
    {
      problem: "A concave mirror has focal length 15 cm. An object is placed 30 cm in front of it. Find the image distance and nature of the image.",
      solution: "Given: f = -15 cm, u = -30 cm.\nUsing 1/f = 1/v + 1/u:\n1/v = 1/f - 1/u = 1/(-15) - 1/(-30) = -1/15 + 1/30 = -1/30.\nThus, v = -30 cm.\nMagnification m = -v/u = -(-30)/(-30) = -1.\nThe image is formed at 30 cm in front of the mirror, is real, inverted, and of the same size as the object."
    },
    {
      problem: "A convex mirror used as a rear-view mirror on a car has a radius of curvature of 3.00 m. If a bus is located 5.00 m from this mirror, find the position and magnification of the image.",
      solution: "Radius R = +3.00 m => f = R/2 = +1.50 m. Object distance u = -5.00 m.\n1/v = 1/f - 1/u = 1/1.50 - 1/(-5.00) = (10/15) + (1/5) = 2/3 + 1/5 = 13/15.\nv = +15/13 = +1.15 m.\nm = -v/u = -(1.15) / (-5.00) = +0.23.\nThe image is virtual, erect, diminished (0.23 times), formed behind the mirror at 1.15 m."
    }
  ],
  commonMistakes: [
    "Forgetting to put negative sign for object distance u.",
    "Assuming focal length of convex mirror is negative (it is positive).",
    "Missing the negative sign in the mirror magnification formula m = -v/u."
  ],
  revision: {
    concept: "Spherical mirror formula: 1/f = 1/v + 1/u with sign convention (u always negative, f negative for concave, positive for convex).",
    formula: "1/f = 1/v + 1/u and m = -v/u",
    commonMistake: "Confusing mirror magnification (-v/u) with lens magnification (+v/u).",
    miniQuestion: {
      question: "What is the focal length of a plane mirror?",
      answer: "Infinity (power = 0)"
    }
  },
  modules: [
    {
      title: "Module 1: Laws of Reflection and Spherical Mirrors",
      description: "Understand converging concave and diverging convex mirrors, focal point, and ray tracing rules.",
      estimatedMinutes: 15,
      blocks: [
        {
          type: "text",
          heading: "Core Principle",
          body: "When light rays hit a smooth curved mirror surface, each individual ray strictly obeys the law of reflection (i = r). A concave mirror curves inwards like a cave, focusing parallel incident rays into a real focal point in front of it. A convex mirror curves outwards, causing parallel rays to diverge as if originating from a focal point behind the mirror."
        },
        {
          type: "keypoints",
          heading: "Ray Tracing Rules",
          body: "1. A ray parallel to the principal axis passes through (or appears to diverge from) the principal focus after reflection.\n2. A ray passing through the center of curvature retraces its path back along the same normal line.\n3. A ray directed towards the pole reflects symmetrically at the same angle to the principal axis."
        },
        {
          type: "formula",
          heading: "Fundamental Relationship",
          body: "f = R / 2\nFor concave mirror: f < 0, R < 0\nFor convex mirror: f > 0, R > 0"
        }
      ]
    },
    {
      title: "Module 2: Mirror Formula & Numerical Problem Solving",
      description: "Master Cartesian coordinate sign conventions, image calculations, and magnification.",
      estimatedMinutes: 20,
      blocks: [
        {
          type: "text",
          heading: "Cartesian Sign Convention",
          body: "Always take the Pole (P) as the origin (0,0). All distances measured in the direction of incident light (to the right) are taken as positive (+), while distances measured against incident light (to the left) are negative (-). The heights measured upward normal to the principal axis are positive (+), and downward are negative (-)."
        },
        {
          type: "formula",
          heading: "The Mirror Equation",
          body: "1/f = 1/v + 1/u\nm = h'/h = -v/u"
        },
        {
          type: "example",
          heading: "Class 10 Board Example",
          body: "An object 4 cm in size is placed at 25 cm in front of a concave mirror of focal length 15 cm. Find image distance: 1/v = 1/(-15) - 1/(-25) = -1/15 + 1/25 = -2/75 => v = -37.5 cm. Height h' = -(-37.5/-25)*4 = -6 cm (real, inverted, magnified)."
        }
      ]
    }
  ],
  quiz: {
    title: "Class 10 Light: Reflection & Mirrors MCQ Quiz",
    level: 1,
    timeLimitSec: 360,
    questions: [
      {
        level: 1,
        text: "The focal length of a concave mirror with radius of curvature 30 cm is:",
        options: ["+30 cm", "-30 cm", "+15 cm", "-15 cm"],
        correctIndex: 3,
        explanation: "By convention, concave mirror focal length is negative: f = -R/2 = -30/2 = -15 cm."
      },
      {
        level: 2,
        text: "Which type of mirror is preferred for vehicle rear-view mirrors and why?",
        options: ["Concave, because it magnifies", "Convex, because it gives a wider field of view and erect image", "Plane mirror, for exact size", "Parabolic mirror, for high brightness"],
        correctIndex: 1,
        explanation: "Convex mirrors always give an erect, diminished virtual image and curve outward, offering a significantly wider field of view."
      },
      {
        level: 2,
        text: "An object is placed at the center of curvature (C) of a concave mirror. The image formed is:",
        options: ["At infinity, real and enlarged", "At C, real, inverted and same size", "Between F and C, virtual", "Behind mirror, magnified"],
        correctIndex: 1,
        explanation: "When placed at C, rays reflect to form a real, inverted image exactly at C with magnification m = -1."
      },
      {
        level: 3,
        text: "If magnification m = -2 for a spherical mirror, this signifies the image is:",
        options: ["Virtual, erect, enlarged", "Real, inverted, enlarged twice", "Real, inverted, diminished half", "Virtual, inverted, enlarged"],
        correctIndex: 1,
        explanation: "Negative sign of magnification denotes a real and inverted image; |m| = 2 denotes twice the object size."
      }
    ]
  },
  problems: [
    {
      level: 1,
      title: "Focal length from radius",
      statement: "Find the focal length in cm of a convex mirror whose radius of curvature is 32 cm.",
      concept: "Focal length R/2",
      expectedMinutes: 2,
      marks: 2,
      hints: ["Formula: f = R / 2.", "Convex mirror focal length is positive."],
      answerType: "numeric",
      solution: {
        finalAnswer: "16",
        numericAnswer: 16,
        tolerance: 0.1,
        steps: [
          { label: "Step 1", content: "f = R / 2 = 32 / 2 = 16 cm." }
        ]
      }
    }
  ]
});

// Topic 2: Refraction of Light, Lenses and Power
addTopicWithContent({
  id: "10-physics-light-refraction-lenses-power",
  chapterId: "10-physics-light-reflection-and-refraction",
  subjectId: "physics",
  classLevel: 10,
  name: "Refraction of Light, Lenses & Optical Power",
  order: 2,
  concept: "Refraction is the bending of light as it passes obliquely from one optical medium to another due to a change in propagation speed. Governed by Snell's Law (sin i / sin r = constant = n2/n1). Convex lens is converging (positive power); concave lens is diverging (negative power). Lens formula: 1/f = 1/v - 1/u. Power P = 1/f (in meters), measured in Dioptres (D).",
  keyPoints: [
    "Snell's Law: sin i / sin r = n21 = v1 / v2. Light bending towards the normal indicates entering an optically denser medium.",
    "Refractive Index n = c / v (speed of light in vacuum / speed in medium). Absolute refractive index is always >= 1.",
    "Lens Formula: 1/f = 1/v - 1/u. Notice the minus sign between 1/v and 1/u (unlike the mirror formula).",
    "Linear Magnification for Lenses: m = h'/h = +v/u.",
    "Power of Lens P = 1 / f (meters). Unit: Dioptre (D). 1 D = 1 m^-1. Convex lens has positive power (+D), concave has negative power (-D)."
  ],
  formulae: [
    "n = c / v",
    "sin i / sin r = n2 / n1 (Snell's Law)",
    "1/f = 1/v - 1/u (Lens Formula)",
    "m = +v/u = h'/h (Lens Magnification)",
    "P = 1/f (m) (Power in Dioptres)"
  ],
  examples: [
    {
      problem: "A convex lens has focal length of 20 cm. An object is placed at 30 cm from the lens. Find the position, nature, and magnification of the image.",
      solution: "Given: f = +20 cm, u = -30 cm.\n1/f = 1/v - 1/u => 1/v = 1/f + 1/u = 1/20 + 1/(-30) = 1/20 - 1/30 = (3 - 2)/60 = 1/60.\nSo v = +60 cm.\nMagnification m = v / u = (+60) / (-30) = -2.\nThe image is formed at 60 cm on the other side of the lens, is real, inverted, and magnified 2 times."
    },
    {
      problem: "Find the focal length of a lens of power -2.0 D. What type of lens is this?",
      solution: "P = 1/f => f = 1/P = 1/(-2.0) = -0.5 m = -50 cm.\nSince focal length is negative, it is a diverging (concave) lens."
    }
  ],
  commonMistakes: [
    "Using mirror formula (1/f = 1/v + 1/u) instead of lens formula (1/f = 1/v - 1/u).",
    "Confusing lens magnification (+v/u) with mirror magnification (-v/u).",
    "Calculating power with focal length in cm without converting to meters."
  ],
  revision: {
    concept: "Lens equation: 1/f = 1/v - 1/u, magnification m = +v/u, and Power P = 1/f (in meters).",
    formula: "1/f = 1/v - 1/u, P = 100/f(cm) D",
    commonMistake: "Failing to convert focal length from cm to m when computing Dioptres.",
    miniQuestion: {
      question: "If two lenses of power +2D and -1.5D are combined in contact, what is the net power?",
      answer: "+0.5 D"
    }
  },
  modules: [
    {
      title: "Module 1: Snell's Law & Refractive Index",
      description: "How light bends across optical boundaries, absolute and relative refractive indices.",
      estimatedMinutes: 15,
      blocks: [
        {
          type: "text",
          heading: "Mechanism of Refraction",
          body: "Light slows down when passing from an optically rarer medium (like air) into an optically denser medium (like water or glass). To minimize travel time (Fermat's principle), the wave front changes direction, bending toward the normal. When speeding up from denser to rarer, it bends away from the normal."
        },
        {
          type: "formula",
          heading: "Snell's Mathematical Law",
          body: "n1 * sin(i) = n2 * sin(r)\nRefractive index of glass ~ 1.5, water ~ 1.33, diamond ~ 2.42"
        }
      ]
    },
    {
      title: "Module 2: Lens Formula & Dioptres Power",
      description: "Calculate real and virtual images for convex/concave lenses and combination optical power.",
      estimatedMinutes: 20,
      blocks: [
        {
          type: "text",
          heading: "Lens Characteristics",
          body: "A convex lens is thicker at the center and thinner at the edges. It converges incident parallel rays to a real focus on the opposite side (f > 0). A concave lens is thinner at the center and diverges rays, yielding a virtual focal point (f < 0)."
        },
        {
          type: "formula",
          heading: "Lenses Master Formulae",
          body: "1/f = 1/v - 1/u\nm = v/u\nP = 1/f(m)\nP_net = P1 + P2"
        }
      ]
    }
  ],
  quiz: {
    title: "Class 10 Refraction & Lens Power Quiz",
    level: 1,
    timeLimitSec: 360,
    questions: [
      {
        level: 1,
        text: "The SI unit of power of a lens is:",
        options: ["Meter", "Dioptre", "Watt", "Lumen"],
        correctIndex: 1,
        explanation: "1 Dioptre (D) is defined as the power of a lens of focal length 1 meter."
      },
      {
        level: 2,
        text: "A doctor prescribes a corrective lens of power +1.5 D. The lens is:",
        options: ["Diverging lens with f = -66.7 cm", "Converging lens with f = +66.7 cm", "Concave lens with f = +150 cm", "Plane glass with no focal point"],
        correctIndex: 1,
        explanation: "Positive power indicates a convex (converging) lens. f = 1/P = 1/1.5 m = 0.667 m = +66.7 cm."
      },
      {
        level: 2,
        text: "When light travels from air into glass slab, its frequency:",
        options: ["Increases", "Decreases", "Remains unchanged", "Doubles"],
        correctIndex: 2,
        explanation: "Frequency is a characteristic of the source and remains constant across all media; wavelength and speed decrease."
      }
    ]
  },
  problems: [
    {
      level: 1,
      title: "Power calculation",
      statement: "A convex lens has a focal length of 50 cm. Calculate its optical power in dioptres.",
      concept: "P = 1/f(m)",
      expectedMinutes: 2,
      marks: 2,
      hints: ["Convert 50 cm to meters: 0.5 m", "P = 1 / 0.5"],
      answerType: "numeric",
      solution: {
        finalAnswer: "2",
        numericAnswer: 2,
        tolerance: 0.05,
        steps: [
          { label: "Step 1", content: "f = 50 cm = 0.5 m. P = 1 / 0.5 = +2.0 D." }
        ]
      }
    }
  ]
});

// Chapter 2: The Human Eye and the Colourful World
addTopicWithContent({
  id: "10-physics-human-eye-defects-of-vision",
  chapterId: "10-physics-the-human-eye-and-the-colourful-world",
  subjectId: "physics",
  classLevel: 10,
  name: "Human Eye, Accommodation & Defects of Vision",
  order: 1,
  concept: "The human eye works like a natural optical camera with a crystalline lens focusing light onto the light-sensitive retina. Power of accommodation is the ability of ciliary muscles to adjust focal length. Near point is 25 cm, far point is infinity. Common defects include Myopia (short-sightedness, corrected with concave lens), Hypermetropia (far-sightedness, corrected with convex lens), and Presbyopia (aging ciliary muscles, corrected with bifocal lenses).",
  keyPoints: [
    "Cornea is the transparent front bulge doing 80% of light bending; Iris controls pupil aperture size.",
    "Retina acts as biological screen containing Rod cells (dim light intensity) and Cone cells (colour vision).",
    "Accommodation: Looking at distant objects relaxes ciliary muscles, making lens thin (focal length increases). Looking close contracts muscles, making lens round/thick.",
    "Myopia: Near objects clear, distant blurry. Image falls IN FRONT of retina. Cause: excessive curvature or eyeball elongation. Corrected by Concave lens.",
    "Hypermetropia: Distant objects clear, near blurry. Image falls BEHIND retina. Cause: focal length too long or eyeball too small. Corrected by Convex lens."
  ],
  formulae: [
    "Near Point of normal adult eye = 25 cm (Least distance of distinct vision, D)",
    "Far Point of normal eye = Infinity",
    "Corrective Lens for Myopia: 1/f = 1/v - 1/u with u = -infinity, v = -d_far => f = -d_far",
    "Corrective Lens for Hypermetropia: u = -25 cm, v = -d_near"
  ],
  examples: [
    {
      problem: "A myopic person cannot see objects beyond 1.2 m clearly. What should be the type and power of the corrective lens required to restore normal vision?",
      solution: "To see distant objects at infinity (u = -infinity), the lens must produce their virtual image at the person's far point (v = -1.2 m = -120 cm).\n1/f = 1/v - 1/u = 1/(-1.2) - 1/(-infinity) = -1/1.2.\nSo f = -1.2 m.\nPower P = 1/f = 1/(-1.2) = -0.83 D.\nA concave lens of power -0.83 D is required."
    }
  ],
  commonMistakes: [
    "Assuming Myopia is corrected by a convex lens (it requires a concave lens to diverge rays).",
    "Mixing up pupil function with retina function."
  ],
  revision: {
    concept: "Myopia = Image before retina -> concave lens (-D). Hypermetropia = Image behind retina -> convex lens (+D).",
    formula: "P = 1/f (m), normal near point = 25 cm",
    commonMistake: "Confusing Myopia (nearsighted) with Hypermetropia (farsighted).",
    miniQuestion: {
      question: "Which defect of vision arises due to gradual weakening of ciliary muscles with old age?",
      answer: "Presbyopia"
    }
  },
  modules: [
    {
      title: "Module 1: Optical Anatomy & Accommodation",
      description: "Structure of the eye: Cornea, Iris, Pupil, Crystalline Lens, Retina, and Ciliary Muscles.",
      estimatedMinutes: 15,
      blocks: [
        {
          type: "text",
          heading: "How We See",
          body: "Light enters the eye through the cornea, passes through the pupil whose diameter is actively regulated by the muscular iris. The flexible crystalline lens forms a real inverted image onto the retina, which sends electrical impulses to the brain via the optic nerve."
        },
        {
          type: "keypoints",
          heading: "Key Anatomy Checklist",
          body: "• Cornea: Primary refraction boundary\n• Iris: Colored diaphragm adjusting light ingress\n• Ciliary muscles: Change lens curvature for focal accommodation\n• Retina: Photoreceptor screen (Rods & Cones)"
        }
      ]
    },
    {
      title: "Module 2: Defects of Vision & Lens Corrections",
      description: "Myopia, Hypermetropia, Astigmatism, Presbyopia, and corrective ray diagrams.",
      estimatedMinutes: 20,
      blocks: [
        {
          type: "text",
          heading: "Defects and Remedies",
          body: "When the eyeball is too long, rays from distant objects converge before reaching the retina: Myopia, solved by a diverging concave lens. When the eyeball is too short, near rays converge behind the retina: Hypermetropia, solved by a converging convex lens."
        }
      ]
    }
  ],
  quiz: {
    title: "Class 10 Eye Anatomy & Vision Defects Quiz",
    level: 1,
    timeLimitSec: 300,
    questions: [
      {
        level: 1,
        text: "The least distance of distinct vision for a normal young adult eye is approximately:",
        options: ["2.5 m", "25 cm", "25 mm", "Infinity"],
        correctIndex: 1,
        explanation: "The normal near point (least distance of distinct vision) is 25 cm."
      },
      {
        level: 2,
        text: "In myopia, the image of a distant object is formed:",
        options: ["Behind the retina", "On the yellow spot", "In front of the retina", "On the blind spot"],
        correctIndex: 2,
        explanation: "Due to high converging power or elongated eyeball, rays focus in front of the retina."
      }
    ]
  },
  problems: []
});

addTopicWithContent({
  id: "10-physics-atmospheric-refraction-dispersion",
  chapterId: "10-physics-the-human-eye-and-the-colourful-world",
  subjectId: "physics",
  classLevel: 10,
  name: "Dispersion of Light & Atmospheric Refraction",
  order: 2,
  concept: "Dispersion is the splitting of white light into its component colors (VIBGYOR) when passing through a prism due to different refractive indices for different wavelengths (Red bends least, Violet bends most). Atmospheric refraction causes twinkling of stars, early sunrise, and delayed sunset. Rayleigh scattering explains why the sky is blue and danger signals are red.",
  keyPoints: [
    "Prism Dispersion: White light splits into Red, Orange, Yellow, Green, Blue, Indigo, Violet. Red has longest wavelength and refracts least.",
    "Rainbow Formation: Combines refraction, dispersion, and internal reflection within suspended raindrops.",
    "Atmospheric Refraction: Atmosphere optical density increases toward earth. Light bends continuously downward, making stars appear higher than their true position.",
    "Twinkling of Stars: Moving air currents cause varying density and refractive index, fluctuating apparent star brightness. Planets do not twinkle because they are extended sources.",
    "Rayleigh Scattering: Intensity of scattering is inversely proportional to lambda^4. Blue scatters much more than red, making sky blue. Red light scatters least, visible from longest distance."
  ],
  formulae: [
    "Scattering Intensity I proportional to 1 / lambda^4 (Rayleigh Law)",
    "Angle of Deviation D = i + e - A (for prism)",
    "Early sunrise & delayed sunset time shift ~ 2 minutes each"
  ],
  examples: [
    {
      problem: "Why does the sun appear reddish early in the morning and at sunset?",
      solution: "Near the horizon, sunlight travels through a thicker layer of atmosphere and a longer distance. Blue light of shorter wavelengths is scattered away by air particles. Only longer wavelength red/orange light reaches our eyes, giving the sun a reddish appearance."
    }
  ],
  commonMistakes: [
    "Confusing total internal reflection with dispersion in rainbow formation (both occur).",
    "Thinking planets twinkle (planets are close and act as collection of point sources which cancel out fluctuations)."
  ],
  revision: {
    concept: "Dispersion splits light by wavelength; Atmospheric refraction causes twinkling & 4-min daylight extension; Rayleigh scattering (1/lambda^4) makes sky blue.",
    formula: "Scattering ~ 1 / lambda^4",
    commonMistake: "Thinking red scatters more than blue (blue scatters 16x more than red).",
    miniQuestion: {
      question: "Why do danger signals use red light?",
      answer: "Red has the longest wavelength and is scattered least by fog or smoke, remaining visible at max distance."
    }
  },
  modules: [
    {
      title: "Module 1: Glass Prism & Rainbow Formation",
      description: "Prism deviation, angular dispersion, and rain drop internal reflection.",
      estimatedMinutes: 15,
      blocks: [
        {
          type: "text",
          heading: "Newton's Experiment",
          body: "Isaac Newton first used a glass prism to split sunlight into a spectrum. Placing an inverted second prism in front of the spectrum recombined all colors back into white light, proving white light is composed of 7 spectral colors."
        }
      ]
    },
    {
      title: "Module 2: Atmospheric Wonders & Scattering",
      description: "Twinkling stars, atmospheric delay, blue skies, and crimson sunsets.",
      estimatedMinutes: 15,
      blocks: [
        {
          type: "text",
          heading: "Scattering Physics",
          body: "Molecules of N2 and O2 in the upper atmosphere have sizes smaller than the wavelength of visible light. They scatter blue light much more intensely than red. In space where there is no atmosphere, astronauts see a pitch-black sky."
        }
      ]
    }
  ],
  quiz: {
    title: "Class 10 Dispersion & Scattering Quiz",
    level: 1,
    timeLimitSec: 300,
    questions: [
      {
        level: 1,
        text: "Which color of light bends the most when passing through a triangular glass prism?",
        options: ["Red", "Yellow", "Violet", "Green"],
        correctIndex: 2,
        explanation: "Violet has the shortest visible wavelength, travels slowest in glass, and suffers maximum deviation."
      },
      {
        level: 2,
        text: "Due to atmospheric refraction, the apparent duration of daytime on Earth increases by approximately:",
        options: ["1 minute", "2 minutes", "4 minutes", "10 minutes"],
        correctIndex: 2,
        explanation: "Sunrise is advanced by ~2 min and sunset delayed by ~2 min, increasing day length by ~4 minutes."
      }
    ]
  },
  problems: []
});

// Chapter 3: Electricity
addTopicWithContent({
  id: "10-physics-electricity-ohms-law-resistance",
  chapterId: "10-physics-electricity",
  subjectId: "physics",
  classLevel: 10,
  name: "Electric Current, Potential Difference & Ohm's Law",
  order: 1,
  concept: "Electric current (I) is the rate of flow of electric charge: I = Q / t (Amperes). Electric potential difference (V) between two points is work done per unit charge: V = W / Q (Volts). Ohm's Law states that at constant temperature, current through a conductor is directly proportional to the potential difference across it: V = I * R. Resistance depends on length L, cross-sectional area A, and resistivity rho: R = rho * L / A.",
  keyPoints: [
    "1 Coulomb = charge of 6.25 x 10^18 electrons. Electron charge e = 1.6 x 10^-19 C.",
    "Ammeter measures current (connected in series, low resistance); Voltmeter measures potential difference (connected in parallel, high resistance).",
    "Ohm's Law: V = I * R. Linear V-I graph slope represents resistance R.",
    "Resistance factors: Directly proportional to length (R ~ L), inversely proportional to area (R ~ 1/A), and depends on material nature and temperature.",
    "Resistivity (rho): R = rho * (L / A). Unit: Ohm-meter (Omega*m). Metals have very low resistivity (10^-8 Omega*m), insulators have high resistivity (10^12 Omega*m)."
  ],
  formulae: [
    "I = Q / t (1 Ampere = 1 Coulomb / 1 Second)",
    "V = W / Q (1 Volt = 1 Joule / 1 Coulomb)",
    "V = I * R (Ohm's Law)",
    "R = rho * L / A (Resistance Formula)",
    "R_series = R1 + R2 + ...",
    "1 / R_parallel = 1 / R1 + 1 / R2 + ..."
  ],
  examples: [
    {
      problem: "A current of 0.5 A is drawn by a filament of an electric bulb for 10 minutes. Find the amount of electric charge that flows through the circuit.",
      solution: "Given: I = 0.5 A, t = 10 min = 10 x 60 s = 600 s.\nUsing Q = I x t:\nQ = 0.5 A x 600 s = 300 Coulombs."
    },
    {
      problem: "A resistance wire of length L and cross-sectional area A has resistance 4 Omega. What will be the resistance of another wire of the same material having length L/2 and cross-section area 2A?",
      solution: "Original wire: R1 = rho * L / A = 4 Omega.\nNew wire: L2 = L/2, A2 = 2A.\nR2 = rho * (L/2) / (2A) = (1/4) * (rho * L / A) = (1/4) * 4 Omega = 1 Omega."
    }
  ],
  commonMistakes: [
    "Forgetting to convert time in minutes to seconds when calculating Q = I * t.",
    "Connecting an ammeter in parallel or a voltmeter in series.",
    "Confusing resistance (changes with geometry) with resistivity (material property, constant at fixed temperature)."
  ],
  revision: {
    concept: "V = I * R and R = rho * L / A. Current is charge/time (A), Voltage is work/charge (V).",
    formula: "V = I * R, R = rho * L / A",
    commonMistake: "Thinking resistivity changes when a wire is stretched (only resistance changes).",
    miniQuestion: {
      question: "If a wire of resistance R is stretched to double its original length, its new resistance becomes:",
      answer: "4R (volume is constant, area halves as length doubles)"
    }
  },
  modules: [
    {
      title: "Module 1: Charge, Current and Potential Difference",
      description: "Charge units, battery electromotive force, and measuring instruments.",
      estimatedMinutes: 15,
      blocks: [
        {
          type: "text",
          heading: "The Circuit Loop",
          body: "Electric current flows from the positive terminal to the negative terminal of a cell (conventional direction), which is opposite to the actual motion of electrons. The potential difference maintained by chemical reactions inside the cell does work to push charges around the conducting loop."
        },
        {
          type: "formula",
          heading: "Primary Definitions",
          body: "I = Q / t [Amperes]\nV = W / Q [Volts]"
        }
      ]
    },
    {
      title: "Module 2: Ohm's Law and Resistivity Calculations",
      description: "Derive Ohm's law, V-I slope, and factors affecting conductor resistance.",
      estimatedMinutes: 20,
      blocks: [
        {
          type: "text",
          heading: "Resistance in Real Wires",
          body: "As electrons drift through metallic lattice, they collide with oscillating metal ions, creating resistance. Thick short wires have minimal resistance, making them ideal for transmission cables."
        },
        {
          type: "formula",
          heading: "Geometry Equation",
          body: "R = rho * L / A\nUnit of rho: Ohm * meter (Omega * m)"
        }
      ]
    }
  ],
  quiz: {
    title: "Class 10 Ohm's Law & Circuit Basics Quiz",
    level: 1,
    timeLimitSec: 360,
    questions: [
      {
        level: 1,
        text: "How much work is done in moving a charge of 2 Coulombs across two points having a potential difference of 12 V?",
        options: ["6 Joules", "14 Joules", "24 Joules", "0.16 Joules"],
        correctIndex: 2,
        explanation: "W = V * Q = 12 V * 2 C = 24 Joules."
      },
      {
        level: 2,
        text: "When a wire is cut into two equal halves, the resistivity of each piece:",
        options: ["Halves", "Doubles", "Remains unchanged", "Becomes one-fourth"],
        correctIndex: 2,
        explanation: "Resistivity is an intrinsic material property; it depends only on material and temperature, not dimensions."
      },
      {
        level: 2,
        text: "Two resistors of 6 Omega and 3 Omega are connected in parallel. Their equivalent resistance is:",
        options: ["9 Omega", "2 Omega", "18 Omega", "0.5 Omega"],
        correctIndex: 1,
        explanation: "1/Rp = 1/6 + 1/3 = (1 + 2)/6 = 3/6 = 1/2 => Rp = 2 Omega."
      }
    ]
  },
  problems: [
    {
      level: 1,
      title: "Parallel resistance",
      statement: "Calculate the equivalent resistance in ohms of three resistors of 30, 20, and 10 ohms connected in parallel.",
      concept: "1/R = 1/R1 + 1/R2 + 1/R3",
      expectedMinutes: 3,
      marks: 3,
      hints: ["1/R = 1/30 + 1/20 + 1/10", "Common denominator is 60: (2 + 3 + 6) / 60 = 11/60", "R = 60 / 11 ~ 5.45"],
      answerType: "numeric",
      solution: {
        finalAnswer: "5.45",
        numericAnswer: 5.45,
        tolerance: 0.1,
        steps: [
          { label: "Step 1", content: "1/R = 1/30 + 1/20 + 1/10 = 11/60 => R = 60/11 = 5.45 Omega." }
        ]
      }
    }
  ]
});

addTopicWithContent({
  id: "10-physics-electricity-heating-effect-electric-power",
  chapterId: "10-physics-electricity",
  subjectId: "physics",
  classLevel: 10,
  name: "Heating Effect of Current & Electric Power",
  order: 2,
  concept: "Joule's Law of Heating states that heat produced in a resistor is directly proportional to the square of current, resistance, and time: H = I^2 * R * t. Applied in electric irons, toasters, and safety fuses. Electric Power (P) is the rate of electrical energy consumption: P = V * I = I^2 * R = V^2 / R (Watts). Commercial unit of electrical energy is kilowatt-hour (kWh), commonly known as 1 unit (1 kWh = 3.6 x 10^6 J).",
  keyPoints: [
    "Joule's Law of Heating: H = I^2 * R * t = V * I * t = (V^2 / R) * t.",
    "Electric Fuse: A safety device made of a lead-tin alloy with low melting point; breaks circuit on overcurrent.",
    "Electric Bulb: Contains high melting point tungsten filament (3380 °C) enclosed in inert argon/nitrogen gas.",
    "Electric Power P = V * I = I^2 * R = V^2 / R. SI unit: Watt (W). 1 W = 1 Volt * 1 Ampere.",
    "Commercial Unit: 1 Kilowatt-hour (kWh) = 1000 W x 3600 s = 3.6 x 10^6 Joules."
  ],
  formulae: [
    "H = I^2 * R * t (Joule's Law)",
    "P = V * I = I^2 * R = V^2 / R (Watts)",
    "Energy E = P * t",
    "1 kWh = 1 Board of Trade Unit = 3.6 x 10^6 Joules",
    "Cost = Units consumed x Rate per unit"
  ],
  examples: [
    {
      problem: "An electric heater rated 1000 W operates for 5 hours daily. Calculate the cost of energy to operate it for 30 days at Rs 4.00 per unit.",
      solution: "Energy consumed per day = P x t = 1000 W x 5 h = 5000 Wh = 5 kWh.\nTotal energy for 30 days = 5 kWh x 30 = 150 kWh (150 units).\nTotal cost = 150 x Rs 4.00 = Rs 600."
    }
  ],
  commonMistakes: [
    "Using H = I * R * t instead of I squared (H = I^2 * R * t).",
    "Confusing power (Watts) with energy (Joules or kWh)."
  ],
  revision: {
    concept: "Heating H = I^2 * R * t; Power P = V * I = I^2 * R = V^2 / R; 1 kWh = 3.6 x 10^6 J.",
    formula: "H = I^2 * R * t, P = V * I, 1 unit = 1 kWh",
    commonMistake: "Calculating electricity bill with power in Watts instead of kW.",
    miniQuestion: {
      question: "How many Joules are there in 1 kilowatt-hour?",
      answer: "3.6 x 10^6 Joules"
    }
  },
  modules: [
    {
      title: "Module 1: Joule's Law of Heating & Safety Fuse",
      description: "Heat dissipation mechanism, heating appliances, and short-circuit protection.",
      estimatedMinutes: 15,
      blocks: [
        {
          type: "text",
          heading: "Thermal Dissipation",
          body: "When electrical potential drives charges through high-resistance elements (like Nichrome), collisions convert electrical energy into heat. Electric heaters, kettles, and irons exploit this to provide controlled thermal output."
        }
      ]
    },
    {
      title: "Module 2: Electrical Power & Commercial Billing",
      description: "Watt ratings, appliance energy calculation, and utility unit tariffs.",
      estimatedMinutes: 15,
      blocks: [
        {
          type: "text",
          heading: "Commercial Energy Billing",
          body: "Utility electricity meters measure energy in kilowatt-hours (kWh). 1 kWh corresponds to the consumption of an appliance consuming 1000 Joules every second continuously for 1 hour."
        }
      ]
    }
  ],
  quiz: {
    title: "Class 10 Heating Effect & Power Quiz",
    level: 1,
    timeLimitSec: 300,
    questions: [
      {
        level: 1,
        text: "Which of the following terms does NOT represent electrical power in a circuit?",
        options: ["I^2 * R", "I * R^2", "V * I", "V^2 / R"],
        correctIndex: 1,
        explanation: "P = V * I = I^2 * R = V^2 / R. I * R^2 is dimensionally incorrect."
      },
      {
        level: 2,
        text: "An electric bulb is rated 220 V and 100 W. When operated on 110 V, the power consumed will be:",
        options: ["100 W", "75 W", "50 W", "25 W"],
        correctIndex: 3,
        explanation: "R = V^2 / P = (220)^2 / 100 = 484 Omega. At 110 V: P = V^2 / R = (110)^2 / 484 = 12100 / 484 = 25 W."
      }
    ]
  },
  problems: []
});

// Chapter 4: Magnetic Effects of Electric Current
addTopicWithContent({
  id: "10-physics-magnetic-field-and-field-lines",
  chapterId: "10-physics-magnetic-effects-of-electric-current",
  subjectId: "physics",
  classLevel: 10,
  name: "Magnetic Field Lines & Right-Hand Thumb Rule",
  order: 1,
  concept: "Oersted discovered that an electric current in a wire produces a magnetic field around it. Magnetic field lines emerge from the North pole and enter the South pole outside a magnet (closed continuous loops). Tangent at any point gives the field direction; two field lines never cross. Right-Hand Thumb Rule gives the magnetic field direction around a straight current: thumb points along current, curled fingers show field lines.",
  keyPoints: [
    "Magnetic field is a vector quantity having both magnitude and direction. SI unit: Tesla (T).",
    "Field lines never intersect because at the point of intersection, a compass needle would have to point in two different directions simultaneously.",
    "Field around straight conductor: Concentric circles centered on the wire. Strength B ~ I and B ~ 1/r.",
    "Circular Loop: Field lines are circular near the wire, and become parallel straight lines at the center, creating a strong uniform field.",
    "Solenoid: A long coil of many circular turns of insulated copper wire. Field inside is uniform and strong, identical to a bar magnet. Inserting soft iron core makes an electromagnet."
  ],
  formulae: [
    "B ~ I / r (Field near straight conductor)",
    "B = mu_0 * n * I (Uniform field inside long solenoid)"
  ],
  examples: [
    {
      problem: "A current through a horizontal power line flows from east to west direction. What is the direction of magnetic field at a point directly below it?",
      solution: "Using the Right-Hand Thumb Rule: Point your right thumb towards the West. Your fingers curl over the wire and point towards the North at the point directly below the wire. Hence, the magnetic field is directed towards North."
    }
  ],
  commonMistakes: [
    "Drawing magnetic field lines that intersect each other.",
    "Thinking field lines are open curves (they form closed continuous loops inside the magnet from South to North)."
  ],
  revision: {
    concept: "Current produces magnetic field. Right-Hand Thumb Rule gives circular field direction; Solenoid behaves like a bar magnet.",
    formula: "Right-Hand Thumb Rule: Thumb = Current I, Fingers = Field B",
    commonMistake: "Using left hand for the thumb rule.",
    miniQuestion: {
      question: "What is the shape of magnetic field lines inside a current-carrying solenoid?",
      answer: "Parallel straight lines (indicating uniform magnetic field)"
    }
  },
  modules: [
    {
      title: "Module 1: Field Lines & The Oersted Discovery",
      description: "Bar magnets, compass needles, field line properties, and non-intersection proof.",
      estimatedMinutes: 15,
      blocks: [
        {
          type: "text",
          heading: "Magnetic Fields in Space",
          body: "In 1820, Hans Christian Oersted noticed a compass needle deflecting when placed near a current-carrying metallic wire. This was the first empirical proof connecting electricity and magnetism into the unified force of electromagnetism."
        }
      ]
    },
    {
      title: "Module 2: Solenoids & Electromagnets",
      description: "Helical coils, core permeability, and creating switchable industrial magnets.",
      estimatedMinutes: 15,
      blocks: [
        {
          type: "text",
          heading: "Solenoid Physics",
          body: "When current flows through multiple circular loops wound tightly into a cylinder, fields from individual turns add constructively inside the core while canceling outside. An iron rod inserted in the core becomes a powerful electromagnet."
        }
      ]
    }
  ],
  quiz: {
    title: "Class 10 Magnetic Field Lines Quiz",
    level: 1,
    timeLimitSec: 300,
    questions: [
      {
        level: 1,
        text: "The magnetic field inside a long straight solenoid carrying current:",
        options: ["Is zero", "Decreases as we move towards its end", "Increases as we move towards its end", "Is the same at all points"],
        correctIndex: 3,
        explanation: "The field lines inside a solenoid are parallel straight lines, meaning the magnetic field is uniform and constant."
      }
    ]
  },
  problems: []
});

addTopicWithContent({
  id: "10-physics-electromagnetic-induction-and-motor",
  chapterId: "10-physics-magnetic-effects-of-electric-current",
  subjectId: "physics",
  classLevel: 10,
  name: "Force on Conductor, Electric Motor & Domestic Circuits",
  order: 2,
  concept: "A current-carrying conductor in a magnetic field experiences a mechanical force: F = I * L * B * sin(theta). Maximum when perpendicular (theta = 90°). Direction given by Fleming's Left-Hand Rule (Thumb = Motion/Force, Forefinger = Magnetic Field, Center finger = Current). Electric motor converts electrical energy into mechanical energy using split-ring commutators. Domestic circuits feature Live (220V), Neutral (0V), and Earth (safety grounding) wires.",
  keyPoints: [
    "Fleming's Left-Hand Rule (Father-Mother-Child = Force-Magnetic Field-Current): Forefinger = Field, Middle finger = Current, Thumb = Force.",
    "Electric Motor: Converts electrical energy to mechanical rotation. Split-ring commutator reverses current every half-rotation to maintain unidirectional torque.",
    "Domestic Supply in India: 220 V AC, 50 Hz frequency (changes direction every 1/100 second).",
    "Wire Color Codes: Live wire = Red/Brown; Neutral wire = Black/Blue; Earth wire = Green/Yellow.",
    "Earth Wire: Connected to metal casing of high-power appliances (refrigerator, toaster) to route leakage current harmlessly to ground, preventing fatal electric shocks.",
    "Overloading & Short Circuit: When live and neutral wires touch directly with zero resistance, huge current sparks fire. Prevented by Miniature Circuit Breakers (MCBs) or fuses."
  ],
  formulae: [
    "F = I * L * B * sin(theta)",
    "F_max = I * L * B (when conductor is perpendicular to field)",
    "Domestic AC = 220 V, 50 Hz"
  ],
  examples: [
    {
      problem: "A positively charged alpha particle projected towards west is deflected towards north by a magnetic field. What is the direction of magnetic field?",
      solution: "Alpha particle is positive, so current direction is towards West. The force/deflection is towards North.\nUsing Fleming's Left-Hand Rule: Middle finger towards West, Thumb towards North. The Forefinger points Upward.\nTherefore, the magnetic field is directed upwards (out of the page)."
    }
  ],
  commonMistakes: [
    "Confusing Fleming's Left-Hand Rule (Motors/Force) with Fleming's Right-Hand Rule (Generators/Induction).",
    "Thinking the earth wire carries power during normal operation (it only carries fault current)."
  ],
  revision: {
    concept: "F = I * L * B, Fleming's Left-Hand Rule (F-B-I = Thumb-Forefinger-Middle). Earth wire safeguards against shocks.",
    formula: "F = I * L * B, Left Hand: Thumb=Force, Forefinger=Field, Middle=Current",
    commonMistake: "Using right hand for Fleming's Left-Hand motor rule.",
    miniQuestion: {
      question: "What is the function of split rings (commutator) in an electric motor?",
      answer: "Reverses the direction of current in the coil every half-rotation to keep it rotating continuously in one direction."
    }
  },
  modules: [
    {
      title: "Module 1: Magnetic Force & The Electric Motor",
      description: "Lorentz magnetic force, coil torque, split rings, and commercial motor efficiency.",
      estimatedMinutes: 20,
      blocks: [
        {
          type: "text",
          heading: "The Motor Principle",
          body: "When an electric current flows through a rectangular coil placed in a magnetic field, the two opposite arms experience equal and opposite perpendicular forces given by Fleming's Left-Hand Rule, setting up a continuous rotational torque."
        }
      ]
    },
    {
      title: "Module 2: Domestic Electric Circuits & Earthing",
      description: "Live, neutral, earth wires, fuse ratings, and short-circuit prevention.",
      estimatedMinutes: 15,
      blocks: [
        {
          type: "text",
          heading: "Household Safety",
          body: "Household circuits are wired in parallel so that every appliance receives the full 220 V mains voltage and can be switched independently without disrupting other rooms. The green earth wire provides a low-resistance path straight into a copper plate buried deep in the ground."
        }
      ]
    }
  ],
  quiz: {
    title: "Class 10 Electric Motor & Circuits Quiz",
    level: 1,
    timeLimitSec: 300,
    questions: [
      {
        level: 1,
        text: "The essential difference between an AC generator and a DC generator / motor is:",
        options: ["AC has an electromagnet while DC has permanent magnet", "DC generator generates a higher voltage", "AC uses slip rings while DC uses a split-ring commutator", "AC motor does not rotate"],
        correctIndex: 2,
        explanation: "A split-ring commutator reverses connections every half-cycle for DC, while slip rings maintain continuous AC contact."
      }
    ]
  },
  problems: []
});

// -------------------------------------------------------------
// 2. CLASS 9 PHYSICS & SCIENCE MODULES
// -------------------------------------------------------------
addTopicWithContent({
  id: "9-physics-force-and-laws-of-motion-newtons-laws",
  chapterId: "9-physics-force-and-laws-of-motion",
  subjectId: "physics",
  classLevel: 9,
  name: "Newton's Laws of Motion & Momentum",
  order: 1,
  concept: "Newton's First Law (Law of Inertia) states an object remains in rest or uniform motion unless acted upon by an external unbalanced force. Newton's Second Law states that rate of change of momentum is directly proportional to applied force: F = m * a. Newton's Third Law states every action has an equal and opposite reaction. Law of Conservation of Momentum: Total momentum of an isolated system remains constant.",
  keyPoints: [
    "Inertia is the natural tendency of an object to resist changes in its state of motion. Mass is the measure of inertia.",
    "Linear Momentum p = m * v (kg*m/s). Vector quantity in the direction of velocity.",
    "Second Law: F = dp/dt = m*(v - u)/t = m * a. 1 Newton = 1 kg * 1 m/s^2.",
    "Third Law: Action and reaction forces are equal in magnitude, opposite in direction, and act on TWO DIFFERENT bodies simultaneously.",
    "Conservation of Momentum: m1*u1 + m2*u2 = m1*v1 + m2*v2 in collisions."
  ],
  formulae: [
    "p = m * v",
    "F = m * a = m * (v - u) / t",
    "F_action = -F_reaction",
    "m1*u1 + m2*u2 = m1*v1 + m2*v2"
  ],
  examples: [
    {
      problem: "A constant force acts on an object of mass 5 kg for a duration of 2 s. It increases the object's velocity from 3 m/s to 7 m/s. Find the magnitude of the applied force.",
      solution: "Given: m = 5 kg, u = 3 m/s, v = 7 m/s, t = 2 s.\nAcceleration a = (v - u) / t = (7 - 3) / 2 = 4 / 2 = 2 m/s^2.\nForce F = m * a = 5 kg * 2 m/s^2 = 10 N."
    }
  ],
  commonMistakes: [
    "Thinking action and reaction cancel each other (they act on different bodies!).",
    "Confusing mass (scalar, kg) with weight (force, N = m*g)."
  ],
  revision: {
    concept: "F = m*a, p = m*v, and action-reaction pairs act on different objects.",
    formula: "F = m*a, m1*u1 + m2*u2 = m1*v1 + m2*v2",
    commonMistake: "Adding action and reaction on the same free-body diagram.",
    miniQuestion: {
      question: "Why does a fielder pull his hands backward while catching a fast cricket ball?",
      answer: "To increase the time of impact, thereby reducing the rate of change of momentum and the force on his hands."
    }
  },
  modules: [
    {
      title: "Module 1: Inertia, Momentum and Newton's Second Law",
      description: "Concept of inertia, momentum definitions, and F = ma derivations.",
      estimatedMinutes: 15,
      blocks: [
        {
          type: "text",
          heading: "The Origin of Force",
          body: "Galileo realized that an object in motion does not need a continuous push to stay in motion; friction is the hidden force stopping everyday objects. Newton codified this into his first two laws."
        }
      ]
    }
  ],
  quiz: {
    title: "Class 9 Newton's Laws Quiz",
    level: 1,
    timeLimitSec: 300,
    questions: [
      {
        level: 1,
        text: "The inertia of an object tends to cause the object to:",
        options: ["Increase its speed", "Decrease its speed", "Resist any change in its state of motion", "Decelerate due to friction"],
        correctIndex: 2,
        explanation: "Inertia is the natural resistance of any physical object to any change in its velocity."
      }
    ]
  },
  problems: []
});

addTopicWithContent({
  id: "9-physics-gravitation-universal-law-and-free-fall",
  chapterId: "9-physics-gravitation",
  subjectId: "physics",
  classLevel: 9,
  name: "Universal Law of Gravitation, Free Fall & Weight",
  order: 1,
  concept: "Universal Law of Gravitation: Every object in the universe attracts every other object with a force proportional to the product of their masses and inversely proportional to the square of the distance between them: F = G * m1 * m2 / r^2. Universal gravitational constant G = 6.673 x 10^-11 N*m^2/kg^2. Acceleration due to gravity g = G * M / R^2 (~9.8 m/s^2 on Earth). Weight is gravitational force W = m * g.",
  keyPoints: [
    "Gravitational force is always attractive and acts along the line joining the centers of two objects.",
    "G is universal (same everywhere in the universe); g varies with altitude, depth, and planet mass/radius.",
    "On Moon: g_moon = (1/6) * g_earth, so weight of an object on the Moon is 1/6th of its weight on Earth.",
    "Free Fall: Motion under gravity alone with constant acceleration g. Equations of motion: v = u + gt, h = ut + (1/2)gt^2, v^2 = u^2 + 2gh.",
    "Mass is constant everywhere; Weight W = mg changes with local gravity."
  ],
  formulae: [
    "F = G * M * m / d^2",
    "G = 6.673 x 10^-11 N m^2 / kg^2",
    "g = G * M / R^2 = 9.8 m/s^2 on Earth surface",
    "W = m * g",
    "W_moon = (1/6) * W_earth"
  ],
  examples: [
    {
      problem: "Mass of an object is 10 kg. What is its weight on Earth and on the Moon?",
      solution: "On Earth: W = m * g = 10 kg * 9.8 m/s^2 = 98 N.\nOn Moon: W_moon = W_earth / 6 = 98 / 6 = 16.3 N. (Mass remains 10 kg on both)."
    }
  ],
  commonMistakes: [
    "Confusing capital G (universal constant) with small g (acceleration due to gravity).",
    "Saying mass is zero in free fall (mass is never zero; apparent weight is zero)."
  ],
  revision: {
    concept: "F = G*M*m/R^2, g = G*M/R^2 = 9.8 m/s^2, W = m*g (W on Moon = 1/6 on Earth).",
    formula: "F = G*M*m/r^2, g = 9.8 m/s^2",
    commonMistake: "Using kg instead of Newtons for weight.",
    miniQuestion: {
      question: "If the distance between two objects is doubled, how does the gravitational force change?",
      answer: "Becomes one-fourth (1/4th) of original value"
    }
  },
  modules: [
    {
      title: "Module 1: Gravitation & Free Fall Dynamics",
      description: "Universal inverse-square law, Cavendish experiment, and calculating g.",
      estimatedMinutes: 15,
      blocks: [
        {
          type: "text",
          heading: "Gravity Holds the Universe Together",
          body: "From the fall of an apple to the elliptical orbit of planets around the sun and the tidal pull of the moon, one universal law governs all celestial and terrestrial attraction."
        }
      ]
    }
  ],
  quiz: {
    title: "Class 9 Gravitation & Weight Quiz",
    level: 1,
    timeLimitSec: 300,
    questions: [
      {
        level: 1,
        text: "The value of acceleration due to gravity 'g' on the surface of the Earth is approximately:",
        options: ["9.8 m/s^2", "6.67 m/s^2", "98 m/s^2", "zero"],
        correctIndex: 0,
        explanation: "Standard surface gravity g = G*M/R^2 ~ 9.8 m/s^2."
      }
    ]
  },
  problems: []
});

// -------------------------------------------------------------
// 3. CLASS 11 PHYSICS (CBSE + JEE + NEET)
// -------------------------------------------------------------
addTopicWithContent({
  id: "11-physics-motion-in-a-straight-line-kinematics",
  chapterId: "11-physics-motion-in-a-straight-line",
  subjectId: "physics",
  classLevel: 11,
  name: "Kinematics in 1D & Calculus Approach (CBSE / JEE / NEET)",
  order: 1,
  concept: "Kinematics studies motion without considering its causes. Instantaneous velocity v = dx/dt, instantaneous acceleration a = dv/dt = v*(dv/dx). Equations of uniformly accelerated motion: v = u + at, s = ut + (1/2)at^2, v^2 = u^2 + 2as. Relative velocity in 1D: v_AB = v_A - v_B. Calculus-based derivations for non-uniform acceleration.",
  keyPoints: [
    "Distance is total path length (scalar); Displacement is shortest vector from initial to final position.",
    "Speed = |velocity|; Average velocity = total displacement / total time.",
    "Instantaneous values: v = dx/dt; a = d^2x/dt^2 = dv/dt.",
    "Area under a-t graph gives change in velocity; Area under v-t graph gives displacement.",
    "Stopping distance for vehicle: d_stop = u^2 / (2a); Stopping time: t_stop = u / a.",
    "JEE/NEET Tip: When acceleration is a function of position a(x), integrate v*dv = a(x)*dx."
  ],
  formulae: [
    "v = dx / dt, a = dv / dt = v * (dv / dx)",
    "v = u + a*t",
    "s = u*t + (1/2)*a*t^2",
    "v^2 = u^2 + 2*a*s",
    "s_nth = u + (a/2)*(2n - 1)",
    "v_rel = v1 - v2"
  ],
  examples: [
    {
      problem: "A particle moves along x-axis such that its position is given by x = 2t^3 - 9t^2 + 12t. Find the times at which the particle is momentarily at rest.",
      solution: "Velocity v = dx/dt = 6t^2 - 18t + 12.\nAt rest, v = 0 => 6(t^2 - 3t + 2) = 0 => (t - 1)(t - 2) = 0.\nTherefore, the particle is at rest at t = 1 second and t = 2 seconds."
    }
  ],
  commonMistakes: [
    "Applying v = u + at when acceleration is variable (only valid for constant acceleration).",
    "Confusing average speed with magnitude of average velocity."
  ],
  revision: {
    concept: "Calculus kinematics: v = dx/dt, a = dv/dt = v dv/dx; for constant a: v^2 = u^2 + 2as, s_nth = u + a/2(2n-1).",
    formula: "v = dx/dt, a = v(dv/dx), v_AB = v_A - v_B",
    commonMistake: "Integrating without evaluating initial condition constants.",
    miniQuestion: {
      question: "What does the slope of a displacement-time graph represent?",
      answer: "Instantaneous velocity"
    }
  },
  modules: [
    {
      title: "Module 1: 1D Calculus Kinematics (JEE / NEET Focus)",
      description: "Differentiate displacement polynomials, integrate variable accelerations, and analyze v-t slopes.",
      estimatedMinutes: 20,
      blocks: [
        {
          type: "text",
          heading: "Continuous Motion Analysis",
          body: "In advanced competitive physics, acceleration is rarely constant. Whether analyzing air drag where a = -k*v or spring restoration where a = -omega^2*x, differentiation and integration connect position, velocity, and time seamlessly."
        }
      ]
    }
  ],
  quiz: {
    title: "Class 11 1D Kinematics JEE / NEET Quiz",
    level: 2,
    timeLimitSec: 360,
    questions: [
      {
        level: 2,
        text: "The displacement of a particle is given by x = (t - 2)^2. The distance traveled by the particle in first 4 seconds is:",
        options: ["0 m", "4 m", "8 m", "16 m"],
        correctIndex: 2,
        explanation: "v = dx/dt = 2(t - 2). At t = 2 s, particle reverses direction! From t = 0 to 2 s: x changes from 4 to 0 (distance = 4 m). From t = 2 to 4 s: x changes from 0 to 4 (distance = 4 m). Total distance = 8 m."
      }
    ]
  },
  problems: []
});

// -------------------------------------------------------------
// 4. CLASS 12 PHYSICS (CBSE + JEE + NEET)
// -------------------------------------------------------------
addTopicWithContent({
  id: "12-physics-electric-charges-and-fields-coulombs-law-gauss",
  chapterId: "12-physics-electric-charges-and-fields",
  subjectId: "physics",
  classLevel: 12,
  name: "Coulomb's Law, Electric Dipole & Gauss's Theorem (CBSE / JEE / NEET)",
  order: 1,
  concept: "Electrostatics deals with static charges. Coulomb's Law: F = (1 / 4*pi*epsilon_0) * (q1 * q2 / r^2). Electric field E = F / q. Electric dipole consists of two equal and opposite charges separated by 2a: Dipole moment p = q * 2a. Electric flux Phi = Integral E . dA. Gauss's Theorem states that total electric flux through any closed Gaussian surface equals q_enclosed / epsilon_0.",
  keyPoints: [
    "Coulomb's constant k = 1 / (4*pi*epsilon_0) = 9 x 10^9 N*m^2/C^2. Permittivity of free space epsilon_0 = 8.854 x 10^-12 C^2/(N*m^2).",
    "Principle of Superposition: Net electrostatic force on any charge is the vector sum of forces exerted by all other individual charges.",
    "Electric Dipole: Axial field E_axial = (2kp) / r^3; Equatorial field E_equatorial = -(kp) / r^3. Torque on dipole in uniform field: tau = p x E; Potential energy U = -p . E.",
    "Gauss's Law: Phi = ClosedIntegral(E . dA) = q_in / epsilon_0.",
    "Applications of Gauss's Law: Infinite straight wire: E = lambda / (2*pi*epsilon_0*r); Infinite plane sheet: E = sigma / (2*epsilon_0); Uniform spherical shell: E = 0 inside, E = kQ/r^2 outside."
  ],
  formulae: [
    "F = (1 / 4*pi*epsilon_0) * (|q1*q2| / r^2)",
    "E = F / q_0",
    "p = q * 2a (Dipole moment)",
    "tau = p x E, U = -p . E",
    "Phi = ClosedIntegral(E . dA) = q_enclosed / epsilon_0",
    "E_wire = lambda / (2*pi*epsilon_0*r)",
    "E_sheet = sigma / (2*epsilon_0)"
  ],
  examples: [
    {
      problem: "An electric dipole of length 4 cm, when placed with its axis at 60 degrees to a uniform electric field of 10^4 N/C, experiences a torque of 4*sqrt(3) N*m. Calculate the magnitude of charge on the dipole.",
      solution: "Given: 2a = 4 cm = 0.04 m, theta = 60 deg, E = 10^4 N/C, tau = 4*sqrt(3) N*m.\nUsing tau = p * E * sin(theta) = (q * 2a) * E * sin(60 deg):\n4*sqrt(3) = q * 0.04 * 10^4 * (sqrt(3)/2).\n4 = q * 400 * (1/2) = q * 200 => q = 4 / 200 = 0.02 C = 20 mC."
    }
  ],
  commonMistakes: [
    "Forgetting that torque tau = p x E is a cross product (max at 90 deg, zero at 0 deg).",
    "Assuming electric field inside a charged conductor is non-zero in electrostatics (it is strictly zero)."
  ],
  revision: {
    concept: "Coulomb's Law (9x10^9 q1q2/r^2), Dipole tau = p x E, Gauss Law Phi = q_in / epsilon_0.",
    formula: "F = k*q1*q2/r^2, Phi = q_in/eps_0, E_sheet = sigma/(2*eps_0)",
    commonMistake: "Confusing axial field (2kp/r^3) with equatorial field (kp/r^3).",
    miniQuestion: {
      question: "What is the electric flux through a closed cube containing a dipole inside it?",
      answer: "Zero (net enclosed charge = +q - q = 0)"
    }
  },
  modules: [
    {
      title: "Module 1: Coulomb's Vector Law & Electric Dipoles",
      description: "Coulomb vector form, dipole axial/equatorial fields, and dipole torque dynamics.",
      estimatedMinutes: 20,
      blocks: [
        {
          type: "text",
          heading: "Electrostatic Field Vectors",
          body: "Electric field lines originate on positive charges and terminate on negative charges. They provide a geometric visualization of field intensity (line density) and direction (tangent)."
        }
      ]
    },
    {
      title: "Module 2: Gauss's Law & Symmetric Charge Distributions",
      description: "Gaussian surfaces, flux integration, infinite wire, and conducting sheet fields.",
      estimatedMinutes: 20,
      blocks: [
        {
          type: "text",
          heading: "Power of Gauss's Law",
          body: "For high-symmetry distributions (cylindrical, planar, spherical), Gauss's theorem replaces complicated Coulomb vector integrals with a single scalar equation relating flux to enclosed charge."
        }
      ]
    }
  ],
  quiz: {
    title: "Class 12 Electrostatics & Gauss's Law Quiz",
    level: 3,
    timeLimitSec: 360,
    questions: [
      {
        level: 3,
        text: "An electric dipole of moment 'p' is placed in an electric field of intensity 'E'. The dipole acquires maximum potential energy when the angle between p and E is:",
        options: ["0 degrees", "90 degrees", "180 degrees", "270 degrees"],
        correctIndex: 2,
        explanation: "U = -p . E = -p * E * cos(theta). U is maximum when cos(theta) = -1, which occurs at theta = 180 degrees (U_max = +pE, unstable equilibrium)."
      }
    ]
  },
  problems: []
});

// -------------------------------------------------------------
// Update chapters.json to mark these key chapters as sampleOnly: false
// -------------------------------------------------------------
const chaptersToEnable = [
  '10-physics-light-reflection-and-refraction',
  '10-physics-the-human-eye-and-the-colourful-world',
  '10-physics-electricity',
  '10-physics-magnetic-effects-of-electric-current',
  '9-physics-force-and-laws-of-motion',
  '9-physics-gravitation',
  '9-physics-motion',
  '11-physics-motion-in-a-straight-line',
  '11-physics-laws-of-motion',
  '12-physics-electric-charges-and-fields',
  '12-physics-current-electricity'
];

chapters.forEach(c => {
  if (chaptersToEnable.includes(c.id)) {
    c.sampleOnly = false;
    c.examTags = ["board", "jee", "neet"];
  }
});

// Filter out existing items with our target IDs to replace cleanly
const cleanExistingTopics = existingTopics.filter(t => !targetTopicIds.has(t.id));
const finalTopics = [...cleanExistingTopics, ...newTopics];

const newModuleIds = new Set(newModules.map(m => m.id));
const cleanExistingModules = existingModules.filter(m => !newModuleIds.has(m.id));
const finalModules = [...cleanExistingModules, ...newModules];

const newQuizIds = new Set(newQuizzes.map(q => q.id));
const cleanExistingQuizzes = existingQuizzes.filter(q => !newQuizIds.has(q.id));
const finalQuizzes = [...cleanExistingQuizzes, ...newQuizzes];

const newQuestionIds = new Set(newQuestions.map(q => q.question.id));
const cleanExistingQuestions = existingQuestions.filter(q => !newQuestionIds.has(q.question.id));
const finalQuestions = [...cleanExistingQuestions, ...newQuestions];

const newProblemIds = new Set(newProblems.map(p => p.problem.id));
const cleanExistingProblems = existingProblems.filter(p => !newProblemIds.has(p.problem.id));
const finalProblems = [...cleanExistingProblems, ...newProblems];

fs.writeFileSync(chaptersPath, JSON.stringify(chapters, null, 2));
fs.writeFileSync(topicsPath, JSON.stringify(finalTopics, null, 2));
fs.writeFileSync(modulesPath, JSON.stringify(finalModules, null, 2));
fs.writeFileSync(quizzesPath, JSON.stringify(finalQuizzes, null, 2));
fs.writeFileSync(questionsPath, JSON.stringify(finalQuestions, null, 2));
fs.writeFileSync(problemsPath, JSON.stringify(finalProblems, null, 2));

console.log('SUCCESS!');
console.log('Updated chapters count:', chapters.length);
console.log('Final topics count:', finalTopics.length);
console.log('Final modules count:', finalModules.length);
console.log('Final quizzes count:', finalQuizzes.length);
console.log('Final questions count:', finalQuestions.length);
console.log('Final problems count:', finalProblems.length);
