'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMe, usePortfolio } from '@/lib/hooks';
import { money } from '@/lib/format';
import { CosmeticKind, Equipped, KIND_LABEL, Look, RARITY, ShopItem, useShop, withItem } from '@/lib/meta';
import { Avatar, Name } from '@/components/PlayerTag';
import { Glyph } from '@/lib/icons';
import { Check, Lock } from '@phosphor-icons/react';

const KINDS: CosmeticKind[] = ['FRAME', 'BANNER', 'TITLE', 'BADGE', 'NAME_EFFECT'];
const SLOT: Record<Exclude<CosmeticKind, 'BADGE'>, 'frame' | 'banner' | 'title' | 'nameEffect'> = {
  FRAME: 'frame',
  BANNER: 'banner',
  TITLE: 'title',
  NAME_EFFECT: 'nameEffect',
};

export default function ShopPage() {
  const { data } = useShop();
  const { data: me } = useMe();
  const { data: pf } = usePortfolio(!!me);
  const qc = useQueryClient();
  const [kind, setKind] = useState<CosmeticKind>('FRAME');
  const [preview, setPreview] = useState<ShopItem | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ slug: string; ok: boolean; text: string } | null>(null);

  const bySlug = useMemo(() => new Map((data?.items ?? []).map((i) => [i.slug, i])), [data]);
  const eq = data?.equipped;
  const look: Look = useMemo(() => lookOf(eq, bySlug), [eq, bySlug]);
  const shown = preview ? withItem(look, preview) : look;
  const items = (data?.items ?? []).filter((i) => i.kind === kind);
  const cash = Number(pf?.cash ?? 0);

  const refresh = () => qc.invalidateQueries({ queryKey: ['shop'] });

  async function buy(i: ShopItem) {
    setMsg(null);
    try {
      await api('/shop/buy', { method: 'POST', json: { slug: i.slug } });
      setConfirm(null);
      setMsg({ slug: i.slug, ok: true, text: 'À toi. Pense à l’équiper.' });
      refresh();
      qc.invalidateQueries({ queryKey: ['portfolio'] });
    } catch (e) {
      setMsg({ slug: i.slug, ok: false, text: (e as Error).message });
    }
  }

  async function equip(json: Partial<Equipped>, slug?: string) {
    try {
      await api('/me/look', { method: 'PATCH', json });
      refresh();
      qc.invalidateQueries({ queryKey: ['profile'] });
    } catch (e) {
      if (slug) setMsg({ slug, ok: false, text: (e as Error).message });
    }
  }

  const isEquipped = (i: ShopItem) => (i.kind === 'BADGE' ? !!eq?.badges.includes(i.slug) : eq?.[SLOT[i.kind]] === i.slug);
  function toggle(i: ShopItem) {
    if (i.kind === 'BADGE') {
      const cur = eq?.badges ?? [];
      const next = cur.includes(i.slug) ? cur.filter((b) => b !== i.slug) : [...cur, i.slug].slice(-3);
      return equip({ badges: next }, i.slug);
    }
    return equip({ [SLOT[i.kind]]: isEquipped(i) ? null : i.slug }, i.slug);
  }

  return (
    <div className="rise grid gap-12 lg:grid-cols-[340px_1fr]">
      {/* Carte de visite : aperçu en direct de ce que tu survoles */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <h1 className="display mb-2 text-6xl font-extrabold">La boutique</h1>
        <p className="mb-6 text-ink-2">
          Payée avec le cash de ta saison : chaque achat fait baisser ton patrimoine. Mais les cosmétiques, eux, restent d’une saison à l’autre.
        </p>
        <div className="border-2 border-ink">
          <div className={`banner h-24 ${shown.banner ? `banner-${shown.banner}` : ''}`} />
          <div className="-mt-10 px-5 pb-5">
            <Avatar look={shown} size="lg" />
            <p className="display mt-3 text-3xl font-bold">
              <Name username={me?.username ?? 'toi'} look={shown} />
              <span className="ml-2 inline-flex gap-1 align-middle text-xl">{shown.badges.map((b) => <Glyph key={b.name} name={b.icon} />)}</span>
            </p>
            <p className="text-sm uppercase tracking-widest text-ink-2">{shown.title ?? 'Sans titre'}</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-3">{preview ? `Aperçu : ${preview.name}` : 'Survole un objet pour l’essayer.'}</p>

        {me && data && (
          <div className="mt-8">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-widest">Avatar (gratuit)</h2>
            <div className="flex flex-wrap gap-1">
              {data.avatars.map((a) => (
                <button
                  key={a}
                  onClick={() => equip({ avatar: a })}
                  aria-pressed={eq?.avatar === a}
                  className={`grid size-10 place-items-center text-xl ${eq?.avatar === a ? 'bg-ink' : 'hover:bg-paper-2'}`}
                >
                  <Glyph name={a} className={eq?.avatar === a ? 'text-paper' : ''} />
                </button>
              ))}
            </div>
            <Link href="/achievements" className="mt-6 inline-block font-semibold underline">Voir les succès et leurs récompenses →</Link>
          </div>
        )}
        {!me && (
          <p className="mt-6">
            <Link href="/login" className="font-semibold underline">Connecte-toi</Link> pour acheter et personnaliser ton profil.
          </p>
        )}
      </aside>

      <div className="min-w-0">
        <div className="mb-6 flex flex-wrap gap-1 text-sm font-semibold" role="tablist">
          {KINDS.map((k) => (
            <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={`px-3 py-1.5 ${kind === k ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        {kind === 'BADGE' && <p className="mb-4 text-sm text-ink-2">Jusqu’à 3 badges affichés à côté de ton pseudo.</p>}

        <ul className="grid gap-x-8 gap-y-10 sm:grid-cols-2 2xl:grid-cols-3">
          {items.map((i) => {
            const equipped = isEquipped(i);
            const locked = !i.owned && !i.price;
            const tooPoor = !!i.price && cash < Number(i.price);
            return (
              <li key={i.slug} className="flex flex-col" onMouseEnter={() => setPreview(i)} onMouseLeave={() => setPreview(null)} onFocus={() => setPreview(i)}>
                <Preview item={i} base={look} username={me?.username ?? 'toi'} />
                <div className="mt-3 flex items-baseline justify-between gap-2">
                  <h3 className="text-lg font-bold">{i.name}</h3>
                  <span className={`px-1.5 text-xs font-bold uppercase tracking-wider ${RARITY[i.rarity].cls}`}>{RARITY[i.rarity].label}</span>
                </div>
                <p className="flex-1 text-sm text-ink-2">{i.description}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {i.owned ? (
                    <button className={`btn py-1.5 text-sm ${equipped ? 'bg-ink text-paper' : 'bg-paper'}`} onClick={() => toggle(i)}>
                      {equipped ? <><Check weight="bold" /> Équipé</> : 'Équiper'}
                    </button>
                  ) : locked ? (
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold"><Lock weight="bold" /> Succès : {i.unlockedBy ?? 'secret'}</span>
                  ) : confirm === i.slug ? (
                    <>
                      <button className="btn bg-acid py-1.5 text-sm" onClick={() => buy(i)}>Payer {money(i.price!)}</button>
                      <button className="text-sm underline" onClick={() => setConfirm(null)}>Annuler</button>
                    </>
                  ) : (
                    <button className="btn bg-paper py-1.5 text-sm" disabled={!me || tooPoor} onClick={() => setConfirm(i.slug)}>
                      <span className="num">{money(i.price!)}</span>
                    </button>
                  )}
                  {tooPoor && !i.owned && !locked && me && <span className="text-xs text-down">Cash insuffisant</span>}
                </div>
                {msg?.slug === i.slug && <p className={`mt-2 text-sm font-semibold ${msg.ok ? 'text-up' : 'text-down'}`}>{msg.text}</p>}
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
    nameEffect: get(eq?.nameEffect)?.data.style ?? null,
    badges: (eq?.badges ?? []).flatMap((b) => {
      const i = get(b);
      return i ? [{ icon: i.data.icon ?? '', name: i.name }] : [];
    }),
  };
}

/** Vignette d'aperçu, adaptée au type d'objet. */
function Preview({ item, base, username }: { item: ShopItem; base: Look; username: string }) {
  const look = withItem({ ...base, badges: [] }, item);
  const box = 'grid h-32 place-items-center border-2 border-ink';
  switch (item.kind) {
    case 'FRAME':
      return <div className={`${box} bg-paper`}><Avatar look={look} size="lg" /></div>;
    case 'BANNER':
      return <div className={`h-32 border-2 border-ink banner banner-${item.data.style}`} />;
    case 'TITLE':
      return <div className={`${box} bg-paper-2`}><span className="display px-4 text-center text-3xl font-bold">« {item.data.text} »</span></div>;
    case 'BADGE':
      return <div className={`${box} bg-paper`}><span className="text-6xl"><Glyph name={item.data.icon} /></span></div>;
    case 'NAME_EFFECT':
      return <div className={`${box} bg-paper`}><span className="display text-4xl font-extrabold"><Name username={username} look={look} /></span></div>;
  }
}
