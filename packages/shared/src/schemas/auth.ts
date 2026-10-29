import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export type AuthUser = {
  id: string;
  riadId: string;
  name: string;
  email: string;
  role: { id: string; key: string; nameFr: string; nameAr: string };
  permissions: string[];
  riad: { id: string; name: string; logoVersion: string | null };
};
