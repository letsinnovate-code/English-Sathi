import type {
  ContextualVocabularyItemDTO,
  ProficiencyLevel,
  TutorPersonaId,
} from "@english-sathi/shared-types";

export interface ConversationScenarioSpec {
  id: string;
  slug: string;
  title: string;
  description: string;
  level: ProficiencyLevel;
  category: string;
  recommendedPersonaId: TutorPersonaId;
  aiRole: string;
  learnerRole: string;
  objectives: string[];
  keyPhrases: string[];
  promptStarter: string;
  stageHints: string[];
  targetVocabulary: ContextualVocabularyItemDTO[];
}

export const CONVERSATION_SCENARIOS: ConversationScenarioSpec[] = [
  {
    id: "introducing-yourself-confidently",
    slug: "introducing-yourself-confidently",
    title: "Introducing Yourself Confidently",
    description:
      "Learn essential phrases to introduce yourself clearly in social and everyday settings.",
    level: "A1",
    category: "Daily Conversations",
    recommendedPersonaId: "sathi_friend",
    aiRole: "A warm, welcoming neighbor or new classmate meeting you for the first time",
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
    stageHints: [
      "Name & hometown",
      "Daily work or college routine",
      "Free-time hobbies & asking a return question",
    ],
    targetVocabulary: [
      {
        word: "hometown",
        partOfSpeech: "noun",
        meaning: "The city or town where you grew up or live.",
        hindiMeaning: "गृह नगर / अपना शहर या कस्बा",
        example: "My hometown is Indore, and it is famous for street food.",
      },
      {
        word: "in my free time",
        partOfSpeech: "phrase",
        meaning: "When you are not working or studying.",
        hindiMeaning: "अपने खाली समय में",
        example: "In my free time, I enjoy playing cricket with friends.",
      },
    ],
  },
  {
    id: "talking-with-a-friend-weekend",
    slug: "talking-with-a-friend-weekend",
    title: "Catching Up With a Friend",
    description:
      "Practice relaxed everyday conversation about weekend plans, movies, food, and family.",
    level: "A2",
    category: "Daily Conversations",
    recommendedPersonaId: "sathi_friend",
    aiRole: "A close friend catching up with you over evening tea",
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
    stageHints: [
      "Share last week's highlight in past tense",
      "Suggest a fun plan for this coming weekend",
      "Agree on a time and place",
    ],
    targetVocabulary: [
      {
        word: "catch up",
        partOfSpeech: "phrasal verb",
        meaning: "Talk to someone you haven't seen recently to share news.",
        hindiMeaning: "पुराने दोस्त से मिलकर हाल-चाल और बातें करना",
        example: "Let's meet on Sunday evening and catch up over chai.",
      },
      {
        word: "hang out",
        partOfSpeech: "phrasal verb",
        meaning: "Spend relaxed time with friends.",
        hindiMeaning: "दोस्तों के साथ आराम से समय बिताना",
        example: "We usually hang out at the park after college.",
      },
    ],
  },
  {
    id: "ordering-at-a-cafe",
    slug: "ordering-at-a-cafe",
    title: "Ordering at a Café or Restaurant",
    description:
      "Master polite ordering, asking for recommendations, customizing drinks, and paying the bill.",
    level: "A2",
    category: "Practical Situations",
    recommendedPersonaId: "ananya_roleplay",
    aiRole: "A friendly barista and server at Sathi Café",
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
    stageHints: [
      "Order drink & snack politely",
      "Ask for recommendation or dietary check",
      "Customize & request the bill",
    ],
    targetVocabulary: [
      {
        word: "recommend",
        partOfSpeech: "verb",
        meaning: "Suggest something good as a choice.",
        hindiMeaning: "सुझाव देना / अच्छी चीज़ बताना",
        example: "What dessert do you recommend with black coffee?",
      },
      {
        word: "takeaway",
        partOfSpeech: "noun / adjective",
        meaning: "Food or drink packed to eat outside the café.",
        hindiMeaning: "पैक कराकर साथ ले जाने वाला खाना",
        example: "Could I get two samosas for takeaway, please?",
      },
    ],
  },
  {
    id: "shopping-and-exchanging-item",
    slug: "shopping-and-exchanging-item",
    title: "Shopping & Exchanging an Item",
    description:
      "Practice asking for sizes, comparing prices, and politely exchanging a clothing or store item.",
    level: "A2",
    category: "Practical Situations",
    recommendedPersonaId: "ananya_roleplay",
    aiRole: "A helpful retail store assistant at a clothing & lifestyle shop",
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
    stageHints: [
      "Explain what you need or want to exchange",
      "Ask about size, price, or discount",
      "Complete payment or exchange smoothly",
    ],
    targetVocabulary: [
      {
        word: "exchange",
        partOfSpeech: "verb / noun",
        meaning: "Return an item and take another size or product instead.",
        hindiMeaning: "बदलकर दूसरा सामान लेना",
        example: "I bought this shirt yesterday and would like to exchange it for a larger size.",
      },
      {
        word: "receipt",
        partOfSpeech: "noun",
        meaning: "The printed bill or proof of purchase.",
        hindiMeaning: "रसीद / पक्का बिल",
        example: "Yes, I kept the receipt right here in my wallet.",
      },
    ],
  },
  {
    id: "asking-for-directions-travel",
    slug: "asking-for-directions-travel",
    title: "Travelling & Asking for Directions",
    description:
      "Navigate train stations, airports, hotels, and unfamiliar city streets with clear prepositions.",
    level: "B1",
    category: "Travel & Directions",
    recommendedPersonaId: "ananya_roleplay",
    aiRole: "A helpful station information desk coordinator / local commuter",
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
    stageHints: [
      "Ask destination & preferred transport",
      "Clarify turns, landmarks, and travel time",
      "Confirm hotel/station details",
    ],
    targetVocabulary: [
      {
        word: "landmark",
        partOfSpeech: "noun",
        meaning: "A famous or easily noticed building/place that helps you navigate.",
        hindiMeaning: "प्रमुख पहचान चिह्न / मशहूर जगह",
        example: "Is there any famous landmark near the metro station?",
      },
      {
        word: "commute",
        partOfSpeech: "verb / noun",
        meaning: "Regularly travel between home and work or across a city.",
        hindiMeaning: "रोज़ाना आना-जाना",
        example: "The morning commute takes around twenty minutes by metro.",
      },
    ],
  },
  {
    id: "phone-call-rescheduling",
    slug: "phone-call-rescheduling",
    title: "Phone Call: Rescheduling an Appointment",
    description:
      "Handle phone etiquette cleanly when audio-only cues matter: spell details, confirm times, and reschedule politely.",
    level: "B1",
    category: "Phone Conversations",
    recommendedPersonaId: "priya_coach",
    aiRole: "A polite clinic/service reception coordinator answering the phone",
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
    stageHints: [
      "State purpose of call and existing slot",
      "Request a new date/time smoothly",
      "Verify confirmation details before hanging up",
    ],
    targetVocabulary: [
      {
        word: "reschedule",
        partOfSpeech: "verb",
        meaning: "Move a planned meeting or appointment to a different date/time.",
        hindiMeaning: "समय बदलकर नई तारीख़ तय करना",
        example: "I need to reschedule my dentist visit to next Tuesday.",
      },
      {
        word: "availability",
        partOfSpeech: "noun",
        meaning: "Open time slots when someone or something is free.",
        hindiMeaning: "खाली समय / उपलब्धता",
        example: "Could you check the doctor's availability around 4 PM?",
      },
    ],
  },
  {
    id: "job-interview-strengths",
    slug: "job-interview-strengths",
    title: "Job Interview: Strengths & Weaknesses",
    description:
      "Answer classic behavioral interview questions with concrete examples and confident STAR structure.",
    level: "B1",
    category: "Career & Business",
    recommendedPersonaId: "vikram_interviewer",
    aiRole: "Vikram, a thoughtful hiring manager conducting a first-round interview",
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
    stageHints: [
      "Highlight top strength with STAR story",
      "Discuss a challenge solved in a team",
      "Describe a constructive growth area",
    ],
    targetVocabulary: [
      {
        word: "collaborate",
        partOfSpeech: "verb",
        meaning: "Work together effectively with others toward a shared goal.",
        hindiMeaning: "मिलजुलकर काम करना",
        example: "I love to collaborate with designers and testers during product launches.",
      },
      {
        word: "proactive",
        partOfSpeech: "adjective",
        meaning: "Taking action early to solve problems before they grow.",
        hindiMeaning: "पहले से पहल करने वाला / सक्रिय",
        example: "Being proactive helped our team avoid last-minute release delays.",
      },
    ],
  },
  {
    id: "leading-a-project-meeting",
    slug: "leading-a-project-meeting",
    title: "Leading a Team Status Meeting",
    description:
      "Guide workplace updates, handle blockers constructively, and align teammates on next action items.",
    level: "B2",
    category: "Workplace Communication",
    recommendedPersonaId: "vikram_interviewer",
    aiRole: "A senior teammate joining the morning sprint standup you are facilitating",
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
    stageHints: [
      "Set meeting agenda concisely",
      "Address an unexpected dependency/blocker",
      "Summarize clear owners and deadlines",
    ],
    targetVocabulary: [
      {
        word: "blocker",
        partOfSpeech: "noun",
        meaning: "An obstacle that prevents progress on a task.",
        hindiMeaning: "काम में आने वाली रुकावट",
        example: "Let's resolve the API blocker first so testing isn't delayed.",
      },
      {
        word: "alignment",
        partOfSpeech: "noun",
        meaning: "Shared agreement among team members on goals and next steps.",
        hindiMeaning: "टीम के बीच सहमति और एक दिशा",
        example: "Before ending the call, let's ensure alignment on tomorrow's deadline.",
      },
    ],
  },
  {
    id: "client-negotiation-executive-pitch",
    slug: "client-negotiation-executive-pitch",
    title: "Executive Negotiation & Client Pitch",
    description:
      "Defend pricing, manage objections diplomatically, and steer high-stakes business conversations with nuance.",
    level: "C1",
    category: "Workplace Communication",
    recommendedPersonaId: "vikram_interviewer",
    aiRole: "A skeptical enterprise procurement director pushing back on timeline and cost",
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
    stageHints: [
      "Acknowledge objection calmly without defensiveness",
      "Articulate differentiated value & phased trade-off",
      "Propose a clear commercial next step",
    ],
    targetVocabulary: [
      {
        word: "incumbent",
        partOfSpeech: "noun / adjective",
        meaning: "The current supplier or holder of a contract/position.",
        hindiMeaning: "वर्तमान में कार्यरत कंपनी या विक्रेता",
        example: "While the incumbent offers a lower base rate, their turnaround time slows your launch.",
      },
      {
        word: "mitigate",
        partOfSpeech: "verb",
        meaning: "Reduce the severity or risk of an undesirable outcome.",
        hindiMeaning: "जोखिम या नुकसान को कम करना",
        example: "A two-week pilot will mitigate migration risk for your operations team.",
      },
    ],
  },
];

export function listConversationScenarios(): ConversationScenarioSpec[] {
  return CONVERSATION_SCENARIOS;
}

export function findScenarioContext(
  topicOrSlug?: string | null,
): ConversationScenarioSpec | null {
  if (!topicOrSlug || !topicOrSlug.trim()) {
    return null;
  }

  const normalized = topicOrSlug.trim().toLowerCase();
  const exact = CONVERSATION_SCENARIOS.find(
    (s) => s.slug === normalized || s.id === normalized || s.title.toLowerCase() === normalized,
  );
  if (exact) return exact;

  if (/\b(cafe|café|coffee|tea|chai|restaurant|order|menu)\b/.test(normalized)) {
    return CONVERSATION_SCENARIOS.find((s) => s.id === "ordering-at-a-cafe") ?? null;
  }
  if (/\b(shop|store|mall|buy|exchange|clothes|size)\b/.test(normalized)) {
    return CONVERSATION_SCENARIOS.find((s) => s.id === "shopping-and-exchanging-item") ?? null;
  }
  if (/\b(travel|direction|airport|train|station|hotel|bus|metro)\b/.test(normalized)) {
    return CONVERSATION_SCENARIOS.find((s) => s.id === "asking-for-directions-travel") ?? null;
  }
  if (/\b(phone|call|reschedul|appointment)\b/.test(normalized)) {
    return CONVERSATION_SCENARIOS.find((s) => s.id === "phone-call-rescheduling") ?? null;
  }
  if (/\b(friend|weekend|catch up|movie)\b/.test(normalized)) {
    return CONVERSATION_SCENARIOS.find((s) => s.id === "talking-with-a-friend-weekend") ?? null;
  }
  if (/\b(negotiat|pitch|client|executive|pricing|contract)\b/.test(normalized)) {
    return CONVERSATION_SCENARIOS.find((s) => s.id === "client-negotiation-executive-pitch") ?? null;
  }
  if (/\b(meeting|standup|sprint|team|blocker)\b/.test(normalized)) {
    return CONVERSATION_SCENARIOS.find((s) => s.id === "leading-a-project-meeting") ?? null;
  }
  if (/\b(interview|strength|weakness|hire|job|career)\b/.test(normalized)) {
    return CONVERSATION_SCENARIOS.find((s) => s.id === "job-interview-strengths") ?? null;
  }
  if (/\b(introduc|yourself|hometown)\b/.test(normalized)) {
    return CONVERSATION_SCENARIOS.find((s) => s.id === "introducing-yourself-confidently") ?? null;
  }

  return null;
}

