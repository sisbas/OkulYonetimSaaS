import { z } from "zod";

export const taskRequestSchema = z.object({
  task: z.string().trim().min(10, "Görev en az 10 karakter olmalı.").max(1500),
});

export type TaskRequest = z.infer<typeof taskRequestSchema>;
