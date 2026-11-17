import { useTranslations } from 'next-intl';

const REPO = 'https://github.com/Itaromi/CryptoMeme';

/** Liens d'aide et de contribution : tout passe par le dépôt GitHub (issues, Discussions, code). */
const LINKS = [
  { key: 'bug', href: `${REPO}/issues/new?template=bug.yml` },
  { key: 'idea', href: `${REPO}/discussions/categories/propositions` },
  { key: 'question', href: `${REPO}/discussions/categories/questions-aide` },
  { key: 'contribute', href: `${REPO}/blob/main/CONTRIBUTING.md` },
  { key: 'security', href: `${REPO}/security/advisories/new` },
] as const;

export function SiteFooter() {
  const t = useTranslations('common.footer');
  return (
    <footer className="border-t-2 border-ink bg-paper-2 px-4 py-8 sm:px-8 2xl:px-12">
      <div className="grid gap-6">
        <div>
          <p className="display text-3xl font-extrabold">{t('title')}</p>
          <p className="mt-2 max-w-xl text-ink-2">
            {t.rich('intro', {
              repo: (chunks) => (
                <a href={REPO} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline decoration-2 underline-offset-4 hover:bg-acid">
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>
        {/* Mobile : liens empilés, larges cibles ; grand écran : en ligne sous le texte */}
        <ul className="grid gap-2 text-sm font-semibold sm:grid-cols-2 lg:flex lg:flex-wrap">
          {LINKS.map((l) => (
            <li key={l.key}>
              <a
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center justify-between gap-3 border-2 border-ink bg-paper px-3 py-2 hover:bg-acid lg:justify-start"
              >
                {t(`links.${l.key}`)}
                <span aria-hidden>↗</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-6 text-xs text-ink-3">{t('disclaimer')}</p>
    </footer>
  );
}
