import { randomBytes, scryptSync } from "node:crypto";
import {
  PrismaClient,
  ProficiencyLevel,
  UserRole,
  LearningGoal,
  SubscriptionStatus,
} from "../src";

const prisma = new PrismaClient();

function hashSeedPassword(plainPassword: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(plainPassword, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  }).toString("hex");
  return `scrypt$${salt}$${derivedKey}`;
}

async function main() {
  console.log("Seeding English Sathi database...");

  // 1. Seed Subscription Plans (idempotent)
  const freePlan = await prisma.plan.upsert({
    where: { name: "FREE" },
    update: {
      monthlyPrice: 0,
      dailyVoiceLimitSeconds: 600, // 10 mins/day
      features: {
        hindiExplanations: true,
        dailyGoalTracking: true,
        roleplayScenarios: "basic",
      },
      isActive: true,
    },
    create: {
      name: "FREE",
      monthlyPrice: 0,
      dailyVoiceLimitSeconds: 600,
      features: {
        hindiExplanations: true,
        dailyGoalTracking: true,
        roleplayScenarios: "basic",
      },
      isActive: true,
    },
  });

  await prisma.plan.upsert({
    where: { name: "PRO" },
    update: {
      monthlyPrice: 299,
      dailyVoiceLimitSeconds: 3600, // 60 mins/day
      features: {
        hindiExplanations: true,
        dailyGoalTracking: true,
        roleplayScenarios: "all",
        detailedPronunciation: true,
      },
      isActive: true,
    },
    create: {
      name: "PRO",
      monthlyPrice: 299,
      dailyVoiceLimitSeconds: 3600,
      features: {
        hindiExplanations: true,
        dailyGoalTracking: true,
        roleplayScenarios: "all",
        detailedPronunciation: true,
      },
      isActive: true,
    },
  });

  await prisma.plan.upsert({
    where: { name: "PREMIUM" },
    update: {
      monthlyPrice: 599,
      dailyVoiceLimitSeconds: 10800, // 180 mins/day
      features: {
        hindiExplanations: true,
        dailyGoalTracking: true,
        roleplayScenarios: "all",
        detailedPronunciation: true,
        priorityVoiceRouting: true,
      },
      isActive: true,
    },
    create: {
      name: "PREMIUM",
      monthlyPrice: 599,
      dailyVoiceLimitSeconds: 10800,
      features: {
        hindiExplanations: true,
        dailyGoalTracking: true,
        roleplayScenarios: "all",
        detailedPronunciation: true,
        priorityVoiceRouting: true,
      },
      isActive: true,
    },
  });

  const isNonProd = process.env.NODE_ENV !== "production";
  const seededOnboardingAt = new Date("2026-01-01T00:00:00.000Z");

  // 2. Seed Demo Student & Profile
  const existingStudent = await prisma.user.findUnique({
    where: { email: "student@englishsathi.com" },
    select: { passwordHash: true },
  });
  const studentPasswordHash =
    isNonProd && !existingStudent?.passwordHash
      ? hashSeedPassword(process.env.SEED_DEMO_PASSWORD || "Student@123!")
      : undefined;

  const demoStudent = await prisma.user.upsert({
    where: { email: "student@englishsathi.com" },
    update: {
      ...(studentPasswordHash ? { passwordHash: studentPasswordHash } : {}),
      profile: {
        update: {
          onboardingCompletedAt: seededOnboardingAt,
        },
      },
    },
    create: {
      email: "student@englishsathi.com",
      ...(studentPasswordHash ? { passwordHash: studentPasswordHash } : {}),
      role: UserRole.STUDENT,
      profile: {
        create: {
          displayName: "Aarav Sharma",
          nativeLanguage: "hi",
          targetLanguage: "en",
          explanationLanguage: "hi",
          proficiencyLevel: ProficiencyLevel.A2,
          dailyGoalMinutes: 15,
          speakingSpeed: "NORMAL",
          learningGoals: [
            LearningGoal.DAILY_CONVERSATION,
            LearningGoal.CONFIDENCE,
          ],
          timezone: "Asia/Kolkata",
          onboardingCompletedAt: seededOnboardingAt,
        },
      },
      subscription: {
        create: {
          planId: freePlan.id,
          status: SubscriptionStatus.ACTIVE,
          startsAt: new Date(),
        },
      },
    },
  });

  // 3. Seed Demo Admin
  const existingAdmin = await prisma.user.findUnique({
    where: { email: "admin@englishsathi.com" },
    select: { passwordHash: true },
  });
  const adminPasswordHash =
    isNonProd && !existingAdmin?.passwordHash
      ? hashSeedPassword(process.env.SEED_ADMIN_PASSWORD || "Admin@123!")
      : undefined;

  await prisma.user.upsert({
    where: { email: "admin@englishsathi.com" },
    update: {
      ...(adminPasswordHash ? { passwordHash: adminPasswordHash } : {}),
      profile: {
        update: {
          onboardingCompletedAt: seededOnboardingAt,
        },
      },
    },
    create: {
      email: "admin@englishsathi.com",
      ...(adminPasswordHash ? { passwordHash: adminPasswordHash } : {}),
      role: UserRole.ADMIN,
      profile: {
        create: {
          displayName: "Admin Sathi",
          nativeLanguage: "hi",
          targetLanguage: "en",
          explanationLanguage: "en",
          proficiencyLevel: ProficiencyLevel.C2,
          dailyGoalMinutes: 30,
          speakingSpeed: "NORMAL",
          learningGoals: [LearningGoal.BUSINESS_ENGLISH],
          timezone: "Asia/Kolkata",
          onboardingCompletedAt: seededOnboardingAt,
        },
      },
    },
  });

  // 4. Seed Initial Curriculum Lessons (idempotent by slug, aligned with PRD F09)
  const lessons = [
    {
      slug: "introducing-yourself-confidently",
      title: "Introducing Yourself Confidently",
      description:
        "Learn essential phrases to introduce yourself clearly in social and everyday settings.",
      level: ProficiencyLevel.A1,
      category: "Daily Conversations",
      isPublished: true,
      content: {
        personaId: "sathi_friend",
        roleplayRole: "A warm, welcoming neighbor or new classmate meeting you for the first time",
        learnerRole: "Yourself — introducing your name, hometown, work/study, and hobbies",
        objectives: [
          "State your name and hometown naturally",
          "Share what you do for work or study and one hobby",
          "Ask a polite return question to keep a friendly chat going",
        ],
        keyPhrases: [
          "Hello, my name is...",
          "Nice to meet you!",
          "I am from...",
          "In my free time, I enjoy...",
        ],
        promptStarter:
          "Hello! Nice to meet you. Can you tell me your name and where you are from?",
        vocabulary: [
          {
            word: "hometown",
            meaning: "The city or town where you grew up or live.",
            hindiMeaning: "गृह नगर / अपना शहर या कस्बा",
            example: "My hometown is Indore, and it is famous for street food.",
          },
          {
            word: "in my free time",
            meaning: "When you are not working or studying.",
            hindiMeaning: "अपने खाली समय में",
            example: "In my free time, I enjoy playing cricket with friends.",
          },
        ],
      },
    },
    {
      slug: "talking-with-a-friend-weekend",
      title: "Catching Up With a Friend",
      description:
        "Practice relaxed everyday conversation about weekend plans, movies, food, and family.",
      level: ProficiencyLevel.A2,
      category: "Daily Conversations",
      isPublished: true,
      content: {
        personaId: "sathi_friend",
        roleplayRole: "A close friend catching up with you over evening tea",
        learnerRole: "A friend sharing how your week went and making weekend plans",
        objectives: [
          "Talk about past events cleanly using simple past tense",
          "Invite a friend and suggest a time or place",
        ],
        keyPhrases: [
          "How has your week been?",
          "Yesterday, I went to...",
          "Would you like to join me on Saturday?",
        ],
        promptStarter:
          "Hey! Long time no see! How was your week, and what did you do last weekend?",
        vocabulary: [
          {
            word: "catch up",
            meaning: "Talk to someone you haven't seen recently to share news.",
            hindiMeaning: "पुराने दोस्त से मिलकर हाल-चाल और बातें करना",
            example: "Let's meet on Sunday evening and catch up over chai.",
          },
          {
            word: "hang out",
            meaning: "Spend relaxed time with friends.",
            hindiMeaning: "दोस्तों के साथ आराम से समय बिताना",
            example: "We usually hang out at the park after college.",
          },
        ],
      },
    },
    {
      slug: "ordering-at-a-cafe",
      title: "Ordering at a Café or Restaurant",
      description:
        "Master polite ordering, asking for recommendations, customizing drinks, and handling the bill.",
      level: ProficiencyLevel.A2,
      category: "Practical Situations",
      isPublished: true,
      content: {
        personaId: "ananya_roleplay",
        roleplayRole: "A friendly barista and server at Sathi Café",
        learnerRole: "A customer ordering snacks/drinks and checking options",
        objectives: [
          "Order food and drinks politely using 'Could I have...'",
          "Customize sugar, spice, or portion size",
          "Request the bill naturally",
        ],
        keyPhrases: [
          "Could I please have a masala chai?",
          "What do you recommend?",
          "Could you make it less sweet, please?",
          "Could we get the bill, please?",
        ],
        promptStarter:
          "Welcome to Sathi Café! What can I get started for you today?",
        vocabulary: [
          {
            word: "recommend",
            meaning: "Suggest something good as a choice.",
            hindiMeaning: "सुझाव देना / अच्छी चीज़ बताना",
            example: "What dessert do you recommend with black coffee?",
          },
          {
            word: "takeaway",
            meaning: "Food or drink packed to eat outside the café.",
            hindiMeaning: "पैक कराकर साथ ले जाने वाला खाना",
            example: "Could I get two samosas for takeaway, please?",
          },
        ],
      },
    },
    {
      slug: "shopping-and-exchanging-item",
      title: "Shopping & Exchanging an Item",
      description:
        "Practice asking for sizes, comparing prices, and politely exchanging a clothing or store item.",
      level: ProficiencyLevel.A2,
      category: "Practical Situations",
      isPublished: true,
      content: {
        personaId: "ananya_roleplay",
        roleplayRole: "A helpful retail store assistant at a clothing & lifestyle shop",
        learnerRole: "A shopper looking for the right size or exchanging an earlier purchase",
        objectives: [
          "Ask politely for a different size or color",
          "Explain a simple problem and ask for an exchange",
        ],
        keyPhrases: [
          "Do you have this in a medium size?",
          "Is there a fitting room nearby?",
          "I would like to exchange this, please.",
          "Do you have the receipt?",
        ],
        promptStarter:
          "Good afternoon and welcome to Sathi Apparel! Are you looking for something specific today, or would you like to exchange an item?",
        vocabulary: [
          {
            word: "exchange",
            meaning: "Return an item and take another size or product instead.",
            hindiMeaning: "बदलकर दूसरा सामान लेना",
            example: "I bought this shirt yesterday and would like to exchange it for a larger size.",
          },
          {
            word: "receipt",
            meaning: "The printed bill or proof of purchase.",
            hindiMeaning: "रसीद / पक्का बिल",
            example: "Yes, I kept the receipt right here in my wallet.",
          },
        ],
      },
    },
    {
      slug: "asking-for-directions-travel",
      title: "Travelling & Asking for Directions",
      description:
        "Navigate train stations, airports, hotels, and unfamiliar city streets with clear prepositions.",
      level: ProficiencyLevel.B1,
      category: "Travel & Directions",
      isPublished: true,
      content: {
        personaId: "ananya_roleplay",
        roleplayRole: "A helpful station information desk coordinator / local commuter",
        learnerRole: "A traveller finding platforms, landmarks, or checking into a hotel",
        objectives: [
          "Ask clearly for landmarks, distance, and transport options",
          "Confirm directions back accurately using prepositions of place",
        ],
        keyPhrases: [
          "Excuse me, could you tell me how to get to...?",
          "How long does it take on foot?",
          "Should I take the metro or an auto?",
        ],
        promptStarter:
          "Hello there! You look like you're trying to find your way. Where are you headed today?",
        vocabulary: [
          {
            word: "landmark",
            meaning: "A famous or easily noticed building/place that helps you navigate.",
            hindiMeaning: "प्रमुख पहचान चिह्न / मशहूर जगह",
            example: "Is there any famous landmark near the metro station?",
          },
          {
            word: "commute",
            meaning: "Regularly travel between home and work or across a city.",
            hindiMeaning: "रोज़ाना आना-जाना",
            example: "The morning commute takes around twenty minutes by metro.",
          },
        ],
      },
    },
    {
      slug: "phone-call-rescheduling",
      title: "Phone Call: Rescheduling an Appointment",
      description:
        "Handle phone etiquette cleanly when audio-only cues matter: spell details, confirm times, and reschedule politely.",
      level: ProficiencyLevel.B1,
      category: "Phone Conversations",
      isPublished: true,
      content: {
        personaId: "priya_coach",
        roleplayRole: "A polite clinic/service reception coordinator answering the phone",
        learnerRole: "A caller rescheduling tomorrow's appointment and confirming details",
        objectives: [
          "Open a phone call politely and state your purpose clearly",
          "Propose alternative dates/times and confirm spelling/booking number",
        ],
        keyPhrases: [
          "Hello, I am calling regarding my appointment tomorrow.",
          "Would it be possible to reschedule to Friday afternoon?",
          "Could you please repeat that time to be sure?",
        ],
        promptStarter:
          "Good morning, Sathi Wellness Clinic, Priya speaking. How may I help you over the phone today?",
        vocabulary: [
          {
            word: "reschedule",
            meaning: "Move a planned meeting or appointment to a different date/time.",
            hindiMeaning: "समय बदलकर नई तारीख़ तय करना",
            example: "I need to reschedule my dentist visit to next Tuesday.",
          },
          {
            word: "availability",
            meaning: "Open time slots when someone or something is free.",
            hindiMeaning: "खाली समय / उपलब्धता",
            example: "Could you check the doctor's availability around 4 PM?",
          },
        ],
      },
    },
    {
      slug: "job-interview-strengths",
      title: "Job Interview: Strengths & Weaknesses",
      description:
        "Answer classic behavioral interview questions with concrete examples and confident STAR structure.",
      level: ProficiencyLevel.B1,
      category: "Career & Business",
      isPublished: true,
      content: {
        personaId: "vikram_interviewer",
        roleplayRole: "Vikram, a thoughtful hiring manager conducting a first-round interview",
        learnerRole: "A job candidate sharing strengths, past projects, and growth areas",
        objectives: [
          "Describe a core strength backed by a concrete workplace/college example",
          "Frame an area of growth constructively without sounding negative",
        ],
        keyPhrases: [
          "One of my key strengths is...",
          "For example, in my previous project...",
          "An area I have been actively improving is...",
        ],
        promptStarter:
          "Thank you for joining this interview today. To start off, could you tell me about one of your key strengths and share an example?",
        vocabulary: [
          {
            word: "collaborate",
            meaning: "Work together effectively with others toward a shared goal.",
            hindiMeaning: "मिलजुलकर काम करना",
            example: "I love to collaborate with designers and testers during product launches.",
          },
          {
            word: "proactive",
            meaning: "Taking action early to solve problems before they grow.",
            hindiMeaning: "पहले से पहल करने वाला / सक्रिय",
            example: "Being proactive helped our team avoid last-minute release delays.",
          },
        ],
      },
    },
    {
      slug: "leading-a-project-meeting",
      title: "Leading a Team Status Meeting",
      description:
        "Guide workplace updates, handle blockers constructively, and align teammates on next action items.",
      level: ProficiencyLevel.B2,
      category: "Workplace Communication",
      isPublished: true,
      content: {
        personaId: "vikram_interviewer",
        roleplayRole: "A senior teammate joining the morning sprint standup you are facilitating",
        learnerRole: "The project lead running the meeting and resolving delivery blockers",
        objectives: [
          "Open a meeting with a concise agenda and objective",
          "Probe blockers diplomatically and assign clear action items",
        ],
        keyPhrases: [
          "Let's get started with a quick status update.",
          "Are there any blockers holding us up?",
          "Just to recap our action items before we wrap up...",
        ],
        promptStarter:
          "Good morning! You're leading today's sprint sync. How would you kick off the meeting and check in on priorities?",
        vocabulary: [
          {
            word: "blocker",
            meaning: "An obstacle that prevents progress on a task.",
            hindiMeaning: "काम में आने वाली रुकावट",
            example: "Let's resolve the API blocker first so testing isn't delayed.",
          },
          {
            word: "alignment",
            meaning: "Shared agreement among team members on goals and next steps.",
            hindiMeaning: "टीम के बीच सहमति और एक दिशा",
            example: "Before ending the call, let's ensure alignment on tomorrow's deadline.",
          },
        ],
      },
    },
    {
      slug: "client-negotiation-executive-pitch",
      title: "Executive Negotiation & Client Pitch",
      description:
        "Defend pricing, manage objections diplomatically, and steer high-stakes business conversations with nuance.",
      level: ProficiencyLevel.C1,
      category: "Workplace Communication",
      isPublished: true,
      content: {
        personaId: "vikram_interviewer",
        roleplayRole: "A skeptical enterprise procurement director pushing back on timeline and cost",
        learnerRole: "An account director presenting value and negotiating win-win terms",
        objectives: [
          "Reframe price objections around measurable ROI and delivery risk",
          "Use diplomatic conditional language ('Provided that...', 'What if we phased...')",
        ],
        keyPhrases: [
          "I appreciate your budget constraints; let's look at the ROI timeline.",
          "Would a phased rollout address your risk concerns?",
          "If we commit to that SLA, we would need...",
        ],
        promptStarter:
          "Thanks for walking us through the proposal. Honestly, your quote is 20% higher than our incumbent vendor's. Why shouldn't we stick with them?",
        vocabulary: [
          {
            word: "incumbent",
            meaning: "The current supplier or holder of a contract/position.",
            hindiMeaning: "वर्तमान में कार्यरत कंपनी या विक्रेता",
            example: "While the incumbent offers a lower base rate, their turnaround time slows your launch.",
          },
          {
            word: "mitigate",
            meaning: "Reduce the severity or risk of an undesirable outcome.",
            hindiMeaning: "जोखिम या नुकसान को कम करना",
            example: "A two-week pilot will mitigate migration risk for your operations team.",
          },
        ],
      },
    },
  ];

  for (const lesson of lessons) {
    await prisma.lesson.upsert({
      where: { slug: lesson.slug },
      update: {
        title: lesson.title,
        description: lesson.description,
        level: lesson.level,
        category: lesson.category,
        content: lesson.content,
        isPublished: lesson.isPublished,
      },
      create: lesson,
    });
  }

  console.log(
    `Seeding complete! Demo student (${demoStudent.email}) and ${lessons.length} published lessons ready.`
  );
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
