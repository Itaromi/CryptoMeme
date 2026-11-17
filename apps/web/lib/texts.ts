'use client';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { type GameText, issueError, type TextParam, type TextParams } from '@cryptomeme/shared';
import { ApiError } from './api';
import { useFormat } from './format';

/*
 * Textes venus de l'API. L'API ne fabrique plus de phrases : elle renvoie des clés absolues des messages
 * (« game.notif.dividend », « errors.INSUFFICIENT_CASH », « catalog.banks.<slug>.description »…) et leurs
 * paramètres, à côté du texte français stocké. On traduit si la clé existe, sinon on affiche le texte stocké :
 * les anciennes lignes (sans clé) et les contenus modifiés en admin ou créés par les joueurs restent lisibles.
 */

type Values = Record<string, string | number>;

/** Nom donné par l'API au local offert à l'inscription. */
const DEFAULT_ROOM_NAME = 'Ma chambre';

/** Traducteur sans typage des clés : ces clés viennent de l'API, elles sont vérifiées avec `has` avant usage. */
interface LooseTranslator {
  (key: string, values?: Values): string;
  has(key: string): boolean;
}

/** Traducteur des textes de l'API, lié à la langue courante. */
export function useTexts() {
  const t = useTranslations() as unknown as LooseTranslator;
  const f = useFormat();
  return useMemo(() => {
    /** Clé absolue → texte, ou `fallback` si la clé est inconnue (ou si un paramètre manque). */
    const tr = (key: string, values: Values | undefined, fallback: string) => {
      if (!t.has(key)) return fallback;
      const out = t(key, values);
      // next-intl renvoie la clé elle-même quand la mise en forme échoue
      return out === key ? fallback : out;
    };
    const value = (p: TextParam): string | number => {
      if (typeof p === 'string' || typeof p === 'number') return p;
      if ('money' in p) return f.money(p.money);
      if ('price' in p) return f.price(p.price);
      if ('qty' in p) return f.qty(p.qty);
      if ('pct' in p) return f.pct(p.pct);
      return tr(p.t, p.params, p.fallback);
    };
    const values = (params: TextParams = {}): Values => Object.fromEntries(Object.entries(params).map(([k, v]) => [k, value(v)]));

    return {
      /** Traduit une clé absolue avec des paramètres de l'API (repli : `fallback`). */
      translate: (key: string, params: TextParams | undefined, fallback: string) => tr(key, values(params), fallback),
      /**
       * Texte traduisible stocké par l'API (null : ligne antérieure aux clés). `part` désigne un sous-texte de
       * l'objet pointé par la clé (« title », « body » d'une notification, « description » d'un événement).
       */
      text: (text: GameText | null | undefined, fallback: string, part?: string) =>
        text ? tr(part ? `${text.key}.${part}` : text.key, values(text.params), fallback) : fallback,
      /** Paramètre isolé mis en forme (montant, sous-texte traduit…). */
      param: (p: TextParam) => String(value(p)),
      /** Contenu du catalogue (`catalog.<chemin>`, traduit par slug), sinon le texte stocké. */
      catalog: (path: string, fallback: string) => tr(`catalog.${path}`, undefined, fallback),
      /** Secteur d'une entreprise (les secteurs sont identifiés par leur nom français). */
      sector: (sector: string) => tr(`catalog.sectors.${sector}`, undefined, sector),
      /** Nom d'un local du joueur : traduit s'il porte encore un nom par défaut, tel quel s'il a été choisi. */
      facility: (f: { name: string; type: { slug: string; name: string } }) => {
        if (f.name === DEFAULT_ROOM_NAME) return tr('catalog.myRoom', undefined, f.name);
        return f.name === f.type.name ? tr(`catalog.facilities.${f.type.slug}.name`, undefined, f.name) : f.name;
      },
      /** Titre équipé d'un joueur (traduit par slug, sinon le texte stocké). */
      lookTitle: (look: { title: string | null; titleSlug?: string | null } | null | undefined) =>
        look?.title ? (look.titleSlug ? tr(`catalog.cosmetics.${look.titleSlug}.name`, undefined, look.title) : look.title) : null,
      /** Nom d'un cosmétique (badge, cadre…). */
      cosmetic: (c: { slug?: string; name: string }) => (c.slug ? tr(`catalog.cosmetics.${c.slug}.name`, undefined, c.name) : c.name),
      /** Titre de résultats trimestriels, reconstruit à partir des chiffres du rapport (`headline` en repli). */
      headline: (r: { quarter: number; actual: number; consensus: number; verdict: string; headline: string }) =>
        tr(
          'game.headline',
          values({ quarter: r.quarter, actual: { price: r.actual }, consensus: { price: r.consensus }, verdict: { t: `game.verdict.${r.verdict}`, fallback: r.verdict } }),
          r.headline,
        ),
      /** Message d'une erreur : code de l'API traduit (espace `errors`), sinon son message. */
      error: (e: unknown) => {
        if (e instanceof ApiError && e.code) return tr(`errors.${e.code}`, values(e.params), e.message);
        return e instanceof Error ? e.message : String(e);
      },
      /** Message d'un problème de validation Zod (schémas partagés, validés avant envoi). */
      issue: (i: Parameters<typeof issueError>[0]) => {
        const { code, params } = issueError(i);
        return tr(`errors.${code}`, values(params), i.message);
      },
    };
  }, [t, f]);
}

export type Texts = ReturnType<typeof useTexts>;

/** Message d'erreur à afficher (code de l'API traduit, sinon le message de l'exception). */
export function useErrorMessage() {
  return useTexts().error;
}
