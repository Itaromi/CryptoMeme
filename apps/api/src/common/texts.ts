import type { Prisma } from '@prisma/client';
import { param, type TextParam, type TextParams } from '@cryptomeme/shared';

/**
 * Colonnes Prisma d'un texte traduisible (MarketEvent, MiningLog, Notification) : la clé des messages du site
 * et ses paramètres. Le texte français est toujours stocké à côté : c'est le repli des anciennes lignes et des
 * clés que le site ne connaît pas.
 */
export const textColumns = (key: string, params: TextParams = {}) => ({ textKey: key, textParams: params });

/** Texte traduisible tel que renvoyé au site (null pour les lignes antérieures aux clés). */
export const textView = (row: { textKey: string | null; textParams: Prisma.JsonValue }) =>
  row.textKey ? { key: row.textKey, params: (row.textParams ?? {}) as TextParams } : null;

// Paramètres qui désignent un élément du catalogue : le site affiche sa traduction (par slug), sinon le nom stocké.

/** Nom d'un type de local (« Garage », « Cave humide »…). */
export const facilityName = (t: { slug: string; name: string }): TextParam => param.t(`catalog.facilities.${t.slug}.name`, t.name);

/** Nom par défaut du local offert à l'inscription. */
export const DEFAULT_ROOM_NAME = 'Ma chambre';

/** Nom d'un local du joueur : traduit s'il porte encore un nom par défaut, tel quel s'il a été choisi. */
export function facilityLabel(f: { name: string; type: { slug: string; name: string } }): TextParam {
  if (f.name === DEFAULT_ROOM_NAME) return param.t('catalog.myRoom', f.name);
  return f.name === f.type.name ? facilityName(f.type) : f.name;
}

/** Nom d'un succès. */
export const achievementName = (a: { slug: string; name: string }): TextParam => param.t(`catalog.achievements.${a.slug}.name`, a.name);

/** Nom d'un cosmétique. */
export const cosmeticName = (c: { slug: string; name: string }): TextParam => param.t(`catalog.cosmetics.${c.slug}.name`, c.name);

/** Titre d'un événement (game.events.<slug>.title, avec les paramètres de l'événement). */
export const eventTitle = (e: { slug: string; title: string }, params?: Record<string, string | number>): TextParam =>
  param.t(`game.events.${e.slug}.title`, e.title, params);
