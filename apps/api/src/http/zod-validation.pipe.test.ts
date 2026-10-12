import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const pipe = new ZodValidationPipe(
  z.object({ steps: z.number().int().nonnegative(), label: z.string() }),
);

const rejectionOf = (value: unknown): BadRequestException => {
  try {
    pipe.transform(value);
  } catch (error) {
    if (error instanceof BadRequestException) return error;
    throw error;
  }
  throw new Error('le pipe aurait dû refuser la valeur');
};

describe('ZodValidationPipe', () => {
  it('renvoie la valeur validée (et typée) quand elle respecte le schéma', () => {
    expect(pipe.transform({ steps: 42, label: 'ok' })).toEqual({ steps: 42, label: 'ok' });
  });

  it('refuse une valeur invalide avec 400 et la liste des champs en erreur', () => {
    const rejection = rejectionOf({ steps: -1 });

    expect(rejection.getStatus()).toBe(400);
    expect(rejection.getResponse()).toMatchObject({
      errors: [
        { path: 'steps', message: expect.any(String) as string },
        { path: 'label', message: expect.any(String) as string },
      ],
    });
  });

  it('refuse un corps qui n’est pas un objet', () => {
    expect(rejectionOf('pas un objet').getStatus()).toBe(400);
  });
});
