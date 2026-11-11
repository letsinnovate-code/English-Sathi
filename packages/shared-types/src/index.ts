export type ProficiencyLevel =
  | "A1"
  | "A2"
  | "B1"
  | "B2"
  | "C1"
  | "C2"
  | "UNKNOWN";

export type UserRole = "STUDENT" | "ADMIN";

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  level: ProficiencyLevel;
  createdAt: string;
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

