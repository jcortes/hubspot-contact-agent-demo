import { readFile } from "node:fs/promises";
import { z } from "zod";

const SubmissionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.email(),
  company: z.string().optional(),
  message: z.string().min(1),
  submittedAt: z.iso.date(),
});

export type Submission = z.infer<typeof SubmissionSchema>;

export async function loadCases(path: string): Promise<Submission[]> {
  const raw = JSON.parse(await readFile(path, "utf8"));
  return z.array(SubmissionSchema).parse(raw);
}
