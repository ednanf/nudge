import { z } from 'zod';
const path = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (v) => v.startsWith('/') && !v.startsWith('//') && !/[\\\r\n#]/.test(v),
    'Use an absolute API path, such as /api/login',
  );
const field = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/)
  .refine((v) => !['constructor', 'prototype', '__proto__'].includes(v));
const json = z
  .record(z.string(), z.unknown())
  .refine((v) => JSON.stringify(v).length <= 8192, 'JSON body must be at most 8 KB');
export const configSchema = z
  .object({
    baseUrl: z
      .url()
      .max(512)
      .refine((v) => {
        const u = new URL(v);
        return (
          u.protocol === 'https:' &&
          !u.username &&
          !u.password &&
          !u.search &&
          !u.hash &&
          (u.pathname === '/' || u.pathname === '') &&
          (!u.port || u.port === '443')
        );
      }, 'Use an HTTPS origin without a path, credentials or query'),
    authPath: path,
    authMethod: z.enum(['POST', 'PUT']).default('POST'),
    usernameField: field.default('email'),
    passwordField: field.default('password'),
    authMode: z.enum(['bearer', 'cookie']).default('bearer'),
    tokenPath: z
      .string()
      .regex(/^[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*$/)
      .max(128)
      .default('token'),
    keepAlivePath: path,
    keepAliveMethod: z.enum(['GET', 'POST']).default('GET'),
    keepAliveBody: json.nullable().default(null),
  })
  .strict()
  .refine((v) => v.usernameField !== v.passwordField, 'Credential field names must differ');
export const projectSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    enabled: z.boolean().default(true),
    config: configSchema,
    username: z.string().min(1).max(320).optional(),
    password: z.string().min(1).max(1024).optional(),
    authBody: json.optional(),
  })
  .strict();
export type ProjectConfig = z.infer<typeof configSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
export type Secrets = { username: string; password: string; authBody: Record<string, unknown> };
