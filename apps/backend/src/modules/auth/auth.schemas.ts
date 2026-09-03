import { z } from "zod";

const emailSchema = z.string().trim().email().max(254).transform((email) => email.toLowerCase());
const passwordSchema = z.string().min(8).max(128);

export const registerSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(100),
  password: passwordSchema
});

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(32).max(512)
});

export const logoutSchema = refreshSchema;
