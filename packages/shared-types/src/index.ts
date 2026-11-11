export type ProficiencyLevel =
  | "A1"
  | "A2"
  | "B1"
  | "B2"
  | "C1"
  | "C2"
  | "UNKNOWN";

export type UserRole = "STUDENT" | "ADMIN";

export type LearningGoal =
  | "DAILY_CONVERSATION"
  | "JOB_INTERVIEW"
  | "BUSINESS_ENGLISH"
  | "TRAVEL"
  | "ACADEMIC"
  | "CONFIDENCE";

export type SpeakingSpeed = "SLOW" | "NORMAL" | "FAST";

export type SubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELLED"
  | "EXPIRED";

export interface AuthUserDTO {
  id: string;
  email: string;
  role: UserRole;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface UserProfileDTO {
  id: string;
  userId: string;
  displayName: string;
  nativeLanguage: string;
  targetLanguage: string;
  explanationLanguage: string;
  proficiencyLevel: ProficiencyLevel;
  dailyGoalMinutes: number;
  speakingSpeed: SpeakingSpeed;
  learningGoals: LearningGoal[];
  timezone: string;
  onboardingCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokensDTO {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  tokenType: "Bearer";
}

export interface AuthSessionResponseDTO {
  user: AuthUserDTO;
  profile: UserProfileDTO;
  onboardingRequired: boolean;
  tokens: AuthTokensDTO;
}

export interface SubscriptionSummaryDTO {
  planName: string;
  status: SubscriptionStatus;
  dailyVoiceLimitSeconds: number;
  usedVoiceSecondsToday: number;
  remainingVoiceSecondsToday: number;
}

export interface StarterLessonSummaryDTO {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  level: ProficiencyLevel;
  category: string;
}

export interface DashboardSummaryDTO {
  user: AuthUserDTO;
  profile: UserProfileDTO;
  onboardingRequired: boolean;
  dailyGoal: {
    targetMinutes: number;
    completedMinutesToday: number;
    progressPercent: number;
  };
  subscription: SubscriptionSummaryDTO | null;
  recommendedLessons: StarterLessonSummaryDTO[];
}

export interface ConversationMessage {
  id: string;
  sender: "user" | "ai";
  content: string;
  timestamp: string;
  audioUrl?: string;
  grammarCorrections?: GrammarCorrection[];
}

export interface GrammarCorrection {
  original: string;
  suggestion: string;
  explanation: string;
}

export interface PracticeSessionDTO {
  id: string;
  userId: string;
  topic: string;
  messages: ConversationMessage[];
  score?: number;
  startedAt: string;
  endedAt?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
