import {
  PrismaClient,
  ProficiencyLevel,
  UserRole,
  LearningGoal,
  SubscriptionStatus,
} from "../src";

const prisma = new PrismaClient();

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

  // 2. Seed Demo Student & Profile
  const demoStudent = await prisma.user.upsert({
    where: { email: "student@englishsathi.com" },
    update: {},
    create: {
      email: "student@englishsathi.com",
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
  await prisma.user.upsert({
    where: { email: "admin@englishsathi.com" },
    update: {},
    create: {
      email: "admin@englishsathi.com",
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
        },
      },
    },
  });

  // 4. Seed Initial Curriculum Lessons (idempotent by slug)
  const lessons = [
    {
      slug: "introducing-yourself-confidently",
      title: "Introducing Yourself Confidently",
      description:
        "Learn essential phrases to introduce yourself in social and professional settings.",
      level: ProficiencyLevel.A1,
      category: "Daily Conversations",
      isPublished: true,
      content: {
        objectives: [
          "Introduce your name, city, and hobbies",
          "Ask someone else about themselves politely",
        ],
        keyPhrases: [
          "Hello, my name is...",
          "Nice to meet you!",
          "I am from...",
          "I work as a...",
          "In my free time, I enjoy...",
        ],
        promptStarter:
          "Hello! Nice to meet you. Can you tell me your name and where you are from?",
      },
    },
    {
      slug: "ordering-at-a-cafe",
      title: "Ordering at a Café or Restaurant",
      description:
        "Master polite ordering, asking for recommendations, and handling the bill.",
      level: ProficiencyLevel.A2,
      category: "Practical Situations",
      isPublished: true,
      content: {
        objectives: [
          "Order food and drinks politely",
          "Ask about menu items and ingredients",
          "Request the bill naturally",
        ],
        keyPhrases: [
          "Could I please have a masala chai?",
          "What do you recommend?",
          "Does this contain dairy?",
          "Could we get the bill, please?",
        ],
        promptStarter:
          "Welcome to Sathi Café! What can I get started for you today?",
      },
    },
    {
      slug: "job-interview-strengths",
      title: "Job Interview: Strengths & Weaknesses",
      description:
        "Practice answering classic behavioral interview questions clearly and professionally.",
      level: ProficiencyLevel.B1,
      category: "Career & Business",
      isPublished: true,
      content: {
        objectives: [
          "Describe your greatest strength with an example",
          "Frame an area for improvement constructively",
        ],
        keyPhrases: [
          "One of my key strengths is...",
          "An area I have been actively improving is...",
          "For example, in my previous role...",
        ],
        promptStarter:
          "Thank you for joining this interview today. To start off, could you tell me about one of your key strengths?",
      },
    },
    {
      slug: "leading-a-project-meeting",
      title: "Leading a Team Status Meeting",
      description:
        "Guide workplace updates, handle blockers constructively, and summarize next steps.",
      level: ProficiencyLevel.B2,
      category: "Workplace Communication",
      isPublished: true,
      content: {
        objectives: [
          "Open a meeting with a crisp agenda",
          "Ask teammates about project blockers politely",
        ],
        keyPhrases: [
          "Let's get started with a quick status update.",
          "Are there any blockers holding us up?",
          "Just to recap our action items...",
        ],
        promptStarter:
          "Good morning! You're leading today's sprint sync. How would you kick off the meeting?",
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
