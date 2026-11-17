import { BadRequestException, PipeTransform } from '@nestjs/common';
import { z } from 'zod';

/** Valide (et transforme) un corps de requête, des paramètres de requête… avec un schéma Zod. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}
  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        message: r.error.issues[0]?.message ?? 'Requête invalide',
        issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return r.data;
  }
}

/** Paramètre de requête (?clé=) facultatif : une chaîne vide vaut « absent ». */
export const optionalParam = <S extends z.ZodType>(schema: S) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

/** Numéro de page (?page=), 1 par défaut. */
export const pageParam = z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).max(100_000).default(1));
