import { PrismaClient, EnglishLevel, Role } from "../src";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding English Sathi initial curriculum...");

  // Create demo admin and demo student
  const demoStudent = await prisma.user.upsert({
    where: { email: "student@englishsathi.com" },
    update: {},
    create: {
      email: "student@englishsathi.com",
      name: "Aarav Sharma",
      role: Role.STUDENT,
      level: EnglishLevel.BEGINNER,
    },
  });

  const demoAdmin = await prisma.user.upsert({
    where: { email: "admin@englishsathi.com" },
    update: {},
    create: {
      email: "admin@englishsathi.com",
      name: "Admin Sathi",
      role: Role.ADMIN,
      level: EnglishLevel.ADVANCED,
    },
  });

  // Sample lessons
  const lessons = [
    {
      title: "Introducing Yourself Confidently",
      description: "Learn essential phrases to introduce yourself in social and professional settings.",
      level: EnglishLevel.BEGINNER,
      category: "Daily Conversations",
      content: {
        objectives: ["Introduce your name, origin, and hobbies", "Ask someone else about themselves"],
        keyPhrases: [
          "Hello, my name is...",
          "Nice to meet you!",
          "I am from...",
          "I work as a...",
          "In my free time, I enjoy...",
        ],
        promptStarter: "Hello! Nice to meet you. Can you tell me your name and where you are from?",
      },
    },
    {
      title: "Ordering at a Café or Restaurant",
      description: "Master polite ordering, asking for recommendations, and handling the bill.",
      level: EnglishLevel.ELEMENTARY,
      category: "Practical Situations",
      content: {
        objectives: ["Order food and drinks politely", "Ask about menu items and ingredients", "Ask for the check"],
        keyPhrases: [
          "Could I please have a cappuccino?",
          "What do you recommend?",
          "Does this contain dairy?",
          "Could we get the bill, please?",
        ],
        promptStarter: "Welcome to Sathi Café! What can I get started for you today?",
      },
    },
    {
      title: "Job Interview: Strengths & Weaknesses",
      description: "Practice answering classic behavioral interview questions clearly and professionally.",
      level: EnglishLevel.INTERMEDIATE,
      category: "Career & Business",
      content: {
        objectives: ["Describe your greatest strength with an example", "Frame a weakness constructively"],
        keyPhrases: [
          "One of my key strengths is...",
          "An area I have been actively improving is...",
          "For example, in my previous role...",
        ],
        promptStarter: "Thank you for joining this interview today. To start off, could you tell me a little about your greatest professional strength?",
      },
    },
  ];

  for (const lesson of lessons) {
    await prisma.lesson.create({
      data: lesson,
    });
  }

  console.log("Seeding complete! 🌱");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

