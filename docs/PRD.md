# ENGLISH SATHI
## Product Requirements Document (PRD) v1.0

**Product:** English Sathi  
**Category:** AI-powered spoken English learning platform  
**Document version:** 1.0  
**Status:** Approved product direction / Development specification  
**Initial market:** India  
**Platforms:** Web, Android, iOS  
**Primary languages:** Hindi and English  
**Target audience:** English-speaking learners at beginner, intermediate, and advanced levels.

---

# 1. Executive Summary

English Sathi is an AI-powered, voice-first English learning platform that provides users with a personal spoken English tutor available anytime.

The platform allows learners to communicate with an AI tutor through natural voice conversations. The tutor listens, understands, responds verbally, identifies mistakes, explains corrections, and adapts future lessons based on the learner's performance.

Unlike traditional English learning applications that primarily focus on reading, writing, and memorizing vocabulary, English Sathi focuses on developing practical speaking abilities through continuous interaction.

The platform combines:

- Real-time speech-to-speech AI.
- Speech transcription and analysis.
- Grammar correction.
- Pronunciation evaluation.
- Personalized learning plans.
- Long-term learner memory.
- Conversation simulations.
- Progress analytics.

The initial product will focus on Hindi-speaking learners in India, with English as the primary learning language and Hindi as a supporting explanation language.

# 2. Vision and Mission

## Vision

Become a trusted personal AI English-speaking tutor for millions of learners worldwide.

## Mission

Make spoken English practice affordable, accessible, personalized, and available to everyone.

## Product philosophy

Every learner should be able to practice speaking English without fear of making mistakes.

The AI tutor should encourage communication first, correct mistakes constructively, and continuously improve the learner's confidence.

# 3. Problem Statement

The target audience faces several problems:

1. Learners understand English but struggle to speak.
2. Learners translate sentences from their native language.
3. Learners hesitate because they fear grammatical mistakes.
4. They lack regular speaking partners.
5. Professional English tutoring can be expensive.
6. They receive limited personalized feedback.
7. They cannot accurately measure their speaking progress.

# 4. Proposed Solution

English Sathi provides an interactive AI tutor that:

1. Conducts real-time voice conversations.
2. Adapts conversation difficulty to the learner's level.
3. Identifies grammatical errors.
4. Explains corrections in Hindi or English.
5. Evaluates pronunciation using speech-analysis capabilities.
6. Teaches vocabulary in context.
7. Simulates real-world scenarios.
8. Tracks recurring mistakes.
9. Creates personalized learning plans.
10. Measures learning progress over time.

# 5. Product Objectives

## Primary objectives

- Improve speaking confidence.
- Improve conversational fluency.
- Improve grammatical accuracy.
- Improve vocabulary usage.
- Improve pronunciation and intelligibility.
- Increase daily English-speaking practice.
- Build sustainable learning habits.

## Business objectives

- Acquire the first 1,000 learners.
- Validate user engagement and retention.
- Establish a sustainable freemium business model.
- Validate AI inference costs.
- Build a scalable foundation for future growth.

These are business milestones, not guaranteed outcomes.

# 6. Target Audience

## Segment A: Beginners

Learners who understand very little English.

Needs:
- Basic sentences.
- Everyday vocabulary.
- Slow conversations.
- Hindi explanations.
- Guided speaking practice.

## Segment B: Intermediate learners

Learners who understand English but struggle with fluency.

Needs:
- Natural conversations.
- Grammar correction.
- Vocabulary expansion.
- Sentence formation.
- Confidence building.

## Segment C: Advanced learners

Learners who can communicate but want professional-level fluency.

Needs:
- Business communication.
- Interviews.
- Presentations.
- Debates.
- Advanced vocabulary.
- Professional conversation.

## Segment D: Students and job seekers

Needs:
- Interview preparation.
- Self-introduction.
- Group discussion.
- Workplace communication.
- College presentations.

# 7. User Roles

### Student
- Register and authenticate.
- Complete onboarding.
- Select learning goals.
- Complete English assessments.
- Practice with the AI tutor.
- View feedback.
- Track learning progress.
- Manage subscription.

### Administrator
- Manage users.
- Manage learning content.
- Manage subscription plans.
- Configure AI providers.
- Monitor system usage.
- Review platform health.
- Manage abuse reports.

### AI Tutor
- Conduct conversations.
- Ask follow-up questions.
- Correct grammar.
- Explain vocabulary.
- Evaluate speaking performance.
- Adapt teaching difficulty.
- Generate learning recommendations.

# 8. Core Functional Modules

## F01: Authentication and User Management

Requirements:
- Email registration.
- Password login.
- Google authentication.
- Secure logout.
- Password reset.
- Session management.
- User profile management.
- Account deletion.

Acceptance criteria:
- A user can securely register and log in.
- The system validates authentication on protected endpoints.
- Users cannot access another user's learning data.

## F02: User Onboarding

Collect:
- Preferred name.
- Native language.
- English proficiency estimate.
- Learning objectives.
- Daily speaking goal.
- Preferred tutor speaking speed.
- Preferred explanation language.

The onboarding process must be short and mobile-friendly.

## F03: Initial English Assessment

The system should assess:
- Grammar.
- Vocabulary.
- Sentence construction.
- Listening comprehension.
- Speaking fluency.
- Pronunciation, where reliable speech analysis is available.

Output:
- Estimated proficiency level.
- Skill-wise performance.
- Strengths.
- Weaknesses.
- Recommended starting lesson.

Use CEFR-aligned A1–C2 proficiency levels, but do not claim an official CEFR certification.

## F04: Real-Time Voice Tutor

Requirements:
- Microphone permission.
- Voice session creation.
- Real-time audio input.
- Streaming audio response.
- Conversation turn detection.
- Interruption support.
- Silence handling.
- Voice session termination.
- Connection recovery.
- Transcript generation.

The user must be able to speak naturally instead of waiting for a traditional chatbot response.

## F05: AI Teaching Engine

Responsibilities:
- Maintain tutor personality.
- Understand learner proficiency.
- Select appropriate vocabulary.
- Ask relevant questions.
- Detect communication difficulties.
- Explain mistakes.
- Provide encouraging feedback.
- Adapt difficulty.

## F06: Grammar Correction

Detect:
- Tense errors.
- Articles.
- Prepositions.
- Subject-verb agreement.
- Sentence structure.
- Word order.
- Common grammatical mistakes.

Each correction should contain:
- Original sentence.
- Corrected sentence.
- Explanation.
- Example.
- Practice opportunity.

The tutor must preserve the learner's intended meaning.

## F07: Pronunciation Evaluation

Evaluate:
- Phoneme production.
- Word-level pronunciation.
- Stress.
- Intonation.
- Speech rhythm.
- Intelligibility.

Use dedicated speech assessment capabilities rather than relying exclusively on an LLM or transcription accuracy.

If pronunciation confidence is insufficient, the system must avoid presenting an unreliable score.

## F08: Vocabulary Builder

Features:
- Daily words.
- Definitions.
- Example sentences.
- Synonyms.
- Contextual usage.
- Saved vocabulary.
- Revision exercises.
- Spaced repetition.

## F09: Real-World Roleplay

Initial scenarios:
- Introducing yourself.
- Talking to friends.
- Ordering food.
- Shopping.
- Travelling.
- Asking for directions.
- Job interviews.
- Office meetings.
- Phone conversations.

The AI must remain consistent with the selected scenario.

## F10: Personalized Learning Plan

Generate a learning plan based on:
- Proficiency level.
- Learning goals.
- Past mistakes.
- Vocabulary knowledge.
- Completed lessons.
- Assessment results.

The learning planner should recommend the next lesson and practice exercises.

## F11: Conversation History

Features:
- List past sessions.
- View transcripts.
- View corrections.
- View session summaries.
- Search and paginate history.
- Delete conversation history.

Audio storage must be optional, consent-based, and governed by retention policies.

## F12: Progress Analytics

Track:
- Daily speaking duration.
- Weekly speaking duration.
- Grammar accuracy.
- Vocabulary usage.
- Fluency indicators.
- Pronunciation assessment results.
- Learning streaks.
- Completed lessons.
- Assessment progress.

## F13: Subscription and Usage Management

Plans:
- Free.
- Pro.
- Premium.

The backend must enforce:
- Speaking-minute limits.
- Concurrent-session limits.
- Feature entitlements.
- Usage tracking.
- Subscription status.
- Payment status.

Never trust client-side usage counters for billing or quota enforcement.

# 9. Non-Functional Requirements

## Performance
- Fast initial application loading.
- Low-latency voice interaction.
- Responsive streaming.
- Efficient transcript retrieval.

## Availability
- Initial service availability target: 99.9%.
- Health checks.
- Graceful degradation.
- Recovery procedures.

## Scalability
- Stateless application APIs.
- Horizontal scaling.
- Independent voice-session capacity management.
- Database connection pooling.
- Background job processing.

## Security
- Encrypted communication.
- Encrypted sensitive data.
- Secure authentication.
- Authorization.
- Rate limiting.
- API key protection.
- Audit logging.

## Privacy
- Explicit microphone consent.
- Clear audio retention policy.
- User-controlled account deletion.
- Secure transcript access.
- Data minimization.

# 10. MVP Scope

The first public MVP must include:

1. Registration and authentication.
2. Onboarding.
3. Basic proficiency assessment.
4. Real-time AI voice conversation.
5. Spoken AI responses.
6. Conversation transcripts.
7. Basic grammar corrections.
8. End-of-session feedback.
9. Conversation history.
10. Basic progress dashboard.
11. Daily speaking goal.
12. Usage limits.

# 11. Out of Scope for MVP

- Social networking.
- Teacher marketplace.
- Live human tutoring.
- Advanced competitive leaderboards.
- Complex multi-agent workflows.
- Custom foundation model training.
- Full offline AI conversation.
- All Indian languages.
- Enterprise LMS integration.

# 12. Success Metrics

Product:
- Activation rate.
- Daily active learners.
- Weekly active learners.
- Average speaking minutes.
- Completed speaking sessions.
- 7-day and 30-day retention.

Learning:
- Change in assessment scores.
- Reduction in recurring grammar errors.
- Vocabulary retention.
- Speaking confidence surveys.
- Pronunciation improvement where measurable.

Business:
- Free-to-paid conversion.
- Subscription retention.
- AI cost per active learner.
- Revenue per paying learner.
- Contribution margin.

# 13. Product Risks

- AI correction errors.
- Voice latency.
- Speech recognition errors.
- Unfair accent scoring.
- High inference costs.
- Provider outages.
- Privacy risks.
- Poor learner retention.

# 14. Product Launch Strategy

Stage 1: Internal prototype.

Stage 2: Closed beta with 50–100 learners.

Stage 3: Expanded beta with 500–1,000 learners.

Stage 4: Public MVP.

Stage 5: Scale based on validated retention, learning outcomes, cost, and infrastructure performance.

# 15. Product Definition of Done

The MVP is ready when:
- Core user flows work.
- Voice sessions are reliable under tested conditions.
- AI responses are pedagogically appropriate.
- Grammar feedback passes the evaluation suite.
- User data is isolated and secure.
- Usage limits are enforced server-side.
- Critical observability is operational.
- Backup and recovery procedures are tested.
- Beta feedback has been addressed.

