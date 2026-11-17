'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Lock } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useMe, usePortfolio } from '@/lib/hooks';
import { useFormat } from '@/lib/format';
import { type CosmeticKind, type Equipped, type Look, RARITY_CLS, type ShopItem, useShop, withItem } from '@/lib/meta';
import { useApiMutation } from '@/lib/mutation';
import { useTexts } from '@/lib/texts';
import { queryKeys } from '@/lib/queryKeys';
import { Avatar, Name } from '@/components/PlayerTag';
import { Glyph } from '@/lib/icons';

const KINDS: CosmeticKind[] = ['FRAME', 'BANNER', 'TITLE', 'BADGE', 'NAME_EFFECT'];
const SLOT: Record<Exclude<CosmeticKind, 'BADGE'>, 'frame' | 'banner' | 'title' | 'nameEffect'> = {
  FRAME: 'frame',
  BANNER: 'banner',
  TITLE: 'title',
  NAME_EFFECT: 'nameEffect',
};

/** Changement d'apparence ; `slug` : objet concerné, pour afficher l'erreur sous sa vignette. */
interface EquipVars {
  json: Partial<Equipped>;
  slug?: string;
}

export default function ShopPage() {
  const texts = useTexts();
  const errorMessage = texts.error;
  const t = useTranslations('shop');
  const tc = useTranslations('common.actions');
  const f = useFormat();
  const { data } = useShop();
  const { data: me } = useMe();
  const { data: pf } = usePortfolio(!!me);
  const [kind, setKind] = useState<CosmeticKind>('FRAME');
  const [preview, setPreview] = useState<ShopItem | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const bySlug = useMemo(() => new Map((data?.items ?? []).map((i) => [i.slug, i])), [data]);
  const eq = data?.equipped;
  const look: Look = useMemo(() => lookOf(eq, bySlug), [eq, bySlug]);
  const shown = preview ? withItem(look, preview) : look;
  const items = (data?.items ?? []).filter((i) => i.kind === kind);
  const cash = Number(pf?.cash ?? 0);
  const you = me?.username ?? t('you');

  // Un achat se paie en cash : patrimoine, classement et profil changent aussi
  const buy = useApiMutation({
    mutationFn: (i: ShopItem) => api('/shop/buy', { method: 'POST', json: { slug: i.slug } }),
    invalidate: [queryKeys.shop, queryKeys.portfolio, queryKeys.leaderboard.all, queryKeys.profile.all],
    onSuccess: () => setConfirm(null),
  });
  // L'apparence s'affiche aussi sur le profil et dans le classement
  const equip = useApiMutation({
    mutationFn: ({ json }: EquipVars) => api('/me/look', { method: 'PATCH', json }),
    invalidate: [queryKeys.shop, queryKeys.profile.all, queryKeys.leaderboard.all],
  });

  const isEquipped = (i: ShopItem) => (i.kind === 'BADGE' ? !!eq?.badges.includes(i.slug) : eq?.[SLOT[i.kind]] === i.slug);
  function toggle(i: ShopItem) {
    if (i.kind === 'BADGE') {
      const cur = eq?.badges ?? [];
      const next = cur.includes(i.slug) ? cur.filter((b) => b !== i.slug) : [...cur, i.slug].slice(-3);
      return equip.mutate({ json: { badges: next }, slug: i.slug });
    }
    return equip.mutate({ json: { [SLOT[i.kind]]: isEquipped(i) ? null : i.slug }, slug: i.slug });
  }

  /** Retour de la dernière action sur cet objet (achat réussi, ou erreur d'achat / d'équipement). */
  function feedback(i: ShopItem): { ok: boolean; text: string } | null {
    if (equip.isError && equip.variables?.slug === i.slug) return { ok: false, text: errorMessage(equip.error) };
    if (buy.variables?.slug !== i.slug) return null;
    if (buy.isSuccess) return { ok: true, text: t('bought') };
    if (buy.isError) return { ok: false, text: errorMessage(buy.error) };
    return null;
  }

  return (
    <div className="rise grid gap-12 lg:grid-cols-[340px_1fr]">
      {/* Carte de visite : aperçu en direct de ce que tu survoles */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <h1 className="display mb-2 text-6xl font-extrabold">{t('title')}</h1>
        <p className="mb-6 text-ink-2">{t('intro')}</p>
        <div className="border-2 border-ink">
          <div className={`banner h-24 ${shown.banner ? `banner-${shown.banner}` : ''}`} />
          <div className="-mt-10 px-5 pb-5">
            <Avatar look={shown} size="lg" />
            <p className="display mt-3 text-3xl font-bold">
              <Name username={you} look={shown} />
              <span className="ml-2 inline-flex gap-1 align-middle text-xl">{shown.badges.map((b) => <Glyph key={b.name} name={b.icon} />)}</span>
            </p>
            <p className="text-sm uppercase tracking-widest text-ink-2">{texts.lookTitle(shown) ?? t('noTitle')}</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-3">{preview ? t('previewing', { name: texts.cosmetic(preview) }) : t('hoverHint')}</p>

        {me && data && (
          <div className="mt-8">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-widest">{t('avatars')}</h2>
            <div className="flex flex-wrap gap-1">
              {data.avatars.map((a) => (
                <button
                  key={a}
                  onClick={() => equip.mutate({ json: { avatar: a } })}
                  aria-pressed={eq?.avatar === a}
                  className={`grid size-10 place-items-center text-xl ${eq?.avatar === a ? 'bg-ink' : 'hover:bg-paper-2'}`}
                >
                  <Glyph name={a} className={eq?.avatar === a ? 'text-paper' : ''} />
                </button>
              ))}
            </div>
            <Link href="/achievements" className="mt-6 inline-block font-semibold underline">{t('achievementsLink')}</Link>
          </div>
        )}
        {!me && (
          <p className="mt-6">{t.rich('loginCta', { link: (c) => <Link href="/login" className="font-semibold underline">{c}</Link> })}</p>
        )}
      </aside>

      <div className="min-w-0">
        <div className="mb-6 flex flex-wrap gap-1 text-sm font-semibold" role="tablist">
          {KINDS.map((k) => (
            <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={`px-3 py-1.5 ${kind === k ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}>
              {t(`kinds.${k}`)}
            </button>
          ))}
        </div>
        {kind === 'BADGE' && <p className="mb-4 text-sm text-ink-2">{t('badgeHint')}</p>}

        <ul className="grid gap-x-8 gap-y-10 sm:grid-cols-2 2xl:grid-cols-3">
          {items.map((i) => {
            const equipped = isEquipped(i);
            const tooPoor = !!i.price && cash < Number(i.price);
            const msg = feedback(i);
            return (
              <li key={i.slug} className="flex flex-col" onMouseEnter={() => setPreview(i)} onMouseLeave={() => setPreview(null)} onFocus={() => setPreview(i)}>
                <Preview item={i} base={look} username={you} />
                <div className="mt-3 flex items-baseline justify-between gap-2">
                  <h3 className="text-lg font-bold">{texts.cosmetic(i)}</h3>
                  <span className={`px-1.5 text-xs font-bold uppercase tracking-wider ${RARITY_CLS[i.rarity]}`}>{t(`rarity.${i.rarity}`)}</span>
                </div>
                <p className="flex-1 text-sm text-ink-2">{texts.catalog(`cosmetics.${i.slug}.description`, i.description)}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {i.owned ? (
                    <button className={`btn py-1.5 text-sm ${equipped ? 'bg-ink text-paper' : 'bg-paper'}`} disabled={equip.isPending} onClick={() => toggle(i)}>
                      {equipped ? <><Check weight="bold" /> {t('equipped')}</> : t('equip')}
                    </button>
                  ) : !i.price ? (
                    // ni possédé ni en vente : se débloque par un succès
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                      <Lock weight="bold" /> {t('unlockedBy', { achievement: i.unlockedBy ? texts.catalog(`achievements.${i.unlockedBy.slug}.name`, i.unlockedBy.name) : t('secret') })}
                    </span>
                  ) : confirm === i.slug ? (
                    <>
                      <button className="btn bg-acid py-1.5 text-sm" disabled={buy.isPending} onClick={() => buy.mutate(i)}>
                        {t('pay', { price: f.money(i.price) })}
                      </button>
                      <button className="text-sm underline" onClick={() => setConfirm(null)}>{tc('cancel')}</button>
                    </>
                  ) : (
                    <button className="btn bg-paper py-1.5 text-sm" disabled={!me || tooPoor} onClick={() => setConfirm(i.slug)}>
                      <span className="num">{f.money(i.price)}</span>
                    </button>
                  )}
                  {tooPoor && !i.owned && me && <span className="text-xs text-down">{t('tooPoor')}</span>}
                </div>
                {msg && <p className={`mt-2 text-sm font-semibold ${msg.ok ? 'text-up' : 'text-down'}`}>{msg.text}</p>}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function lookOf(eq: Equipped | null | undefined, bySlug: Map<string, ShopItem>): Look {
  const get = (s: string | null | undefined) => (s ? bySlug.get(s) : undefined);
  return {
    avatar: eq?.avatar ?? 'Smiley',
    frame: get(eq?.frame)?.data.style ?? null,
    banner: get(eq?.banner)?.data.style ?? null,
    title: get(eq?.title)?.data.text ?? null,
    titleSlug: eq?.title ?? null,
    nameEffect: get(eq?.nameEffect)?.data.style ?? null,
    badges: (eq?.badges ?? []).flatMap((b) => {
      const i = get(b);
      return i ? [{ slug: i.slug, icon: i.data.icon ?? '', name: i.name }] : [];
    }),
  };
}

/** Vignette d'aperçu, adaptée au type d'objet. */
function Preview({ item, base, username }: { item: ShopItem; base: Look; username: string }) {
  const t = useTranslations('shop');
  const look = withItem({ ...base, badges: [] }, item);
  const box = 'grid h-32 place-items-center border-2 border-ink';
  switch (item.kind) {
    case 'FRAME':
      return <div className={`${box} bg-paper`}><Avatar look={look} size="lg" /></div>;
    case 'BANNER':
      return <div className={`h-32 border-2 border-ink banner banner-${item.data.style}`} />;
    case 'TITLE':
      return <div className={`${box} bg-paper-2`}><span className="display px-4 text-center text-3xl font-bold">{t('quotedTitle', { text: item.data.text ?? '' })}</span></div>;
    case 'BADGE':
      return <div className={`${box} bg-paper`}><span className="text-6xl"><Glyph name={item.data.icon} /></span></div>;
    case 'NAME_EFFECT':
      return <div className={`${box} bg-paper`}><span className="display text-4xl font-extrabold"><Name username={username} look={look} /></span></div>;
  }
}
