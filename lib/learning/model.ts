import { z } from "zod";

export const resourceSchema = z.object({
  url: z.url({ protocol: /^https$/ }).max(2048).refine(value => {
    try { const url = new URL(value); return !url.username && !url.password; } catch { return false; }
  }),
  title: z.string().trim().min(1).max(300),
  publisher: z.string().min(1).max(255),
  description: z.string().max(1600),
  kind: z.enum(["course", "video"]),
  checked_at: z.iso.datetime(),
  provenance: z.enum(["web_search", "youtube", "manual"]),
});
export type Resource = z.infer<typeof resourceSchema>;
export type SavedResource = Resource & { id: string; approved: boolean };

export const lessonSchema = z.object({
  title: z.string().min(1).max(150),
  concept: z.string().trim().toLowerCase().min(1).max(120),
  objectives: z.array(z.string().min(1).max(220)).min(1).max(5),
  sections: z.array(z.object({
    title: z.string().min(1).max(100),
    explanation: z.string().min(20).max(2400),
  })).min(2).max(8),
  exercise: z.string().min(10).max(1200),
  questions: z.array(z.object({
    prompt: z.string().min(1).max(300),
    options: z.array(z.string().min(1).max(200)).length(4),
    correct: z.number().int().min(0).max(3),
    explanation: z.string().min(1).max(500),
  })).min(1).max(5),
});
export type Lesson = {
  id: string; topic: string; minutes: number; body: z.infer<typeof lessonSchema>;
  resource_id: string | null; notes: string; bookmarked: boolean; completed_at: string | null;
};

export const topicSchema = z.string().trim().min(2).max(120);

export function relevance(topic: string, resource: Resource) {
  const words = new Set(topic.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  const text = new Set(`${resource.title} ${resource.description}`.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  const matches = [...words].filter(word => text.has(word)).length;
  return words.size ? Math.round(100 * matches / words.size) : 0;
}

export function estimateMicros(inputTokens: number, outputTokens: number, inputRate: number, outputRate: number) {
  return Math.ceil(inputTokens * inputRate + outputTokens * outputRate);
}
