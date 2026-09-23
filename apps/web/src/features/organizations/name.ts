import { z } from 'zod'

export const brokerageName = z
  .string()
  .trim()
  .min(2, 'O nome precisa ter entre 2 e 80 caracteres.')
  .max(80, 'O nome precisa ter entre 2 e 80 caracteres.')

export const brokerageNameSchema = z.object({ name: brokerageName })
