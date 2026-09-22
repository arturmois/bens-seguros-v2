import { z } from 'zod'

const email = z.email('Informe um e-mail válido.')
const password = z
  .string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres.')
  .max(128, 'A senha pode ter no máximo 128 caracteres.')

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Informe a senha.'),
})

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Informe seu nome.'),
  email,
  password,
})

export const forgotPasswordSchema = z.object({ email })

export const resetPasswordSchema = z
  .object({ password, confirmation: z.string() })
  .refine((values) => values.password === values.confirmation, {
    message: 'As senhas não conferem.',
    path: ['confirmation'],
  })

export const codeSchema = z.object({ code: z.string().trim().min(1, 'Informe o código.') })

export const passwordSchema = z.object({ password: z.string().min(1, 'Informe a senha.') })
