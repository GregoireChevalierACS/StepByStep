import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * Valide une entrée HTTP (corps, paramètres) avec un schéma zod : renvoie la valeur validée
 * et typée, ou une 400 qui liste tous les champs en erreur. Une seule bibliothèque de
 * validation dans l'API (déjà utilisée pour la configuration), le type est déduit du schéma.
 */
export class ZodValidationPipe<Schema extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: Schema) {}

  transform(value: unknown): z.infer<Schema> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const errors: ValidationIssue[] = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw new BadRequestException({ message: 'Requête invalide', errors });
  }
}
