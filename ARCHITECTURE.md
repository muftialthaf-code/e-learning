# Architecture

AI Learning Engine is a personal Next.js App Router modular monolith intended for Railway. Supabase provides PostgreSQL and Auth. Server components read session-scoped data, server actions perform browser mutations, and route handlers serve health and integration endpoints. The server service role performs answer-key reads, AI spending reservations, transactional grading, and connector operations. Every such request is mapped to an authenticated owner or scoped connection.

Discover adapts Brave and YouTube results into source links with publisher, provenance and discovery timestamps. Access, licensing and syllabus alignment require user review. User-approved sources become University study plans with user-defined modules. Lesson generation takes a topic and optional source metadata, and the application stores the resulting lesson before opening it. Original materials are linked through their publisher.

Quick Learning and University use the same lesson and assessment model. The database grades submissions, records assessment evidence, updates concept-level estimates and schedules the next review in one transaction. The companion can issue quizzes off the same recorded lessons and writes through the same grading function.

The productivity app repository is unavailable. Its adapter can use the Learning Engine API without a shared database or authentication provider.
