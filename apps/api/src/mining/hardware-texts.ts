/**
 * Descriptions du catalogue de matériel (prisma/catalog.ts) et leur clé de traduction (catalog.hardware.<id>).
 * Le seed génère ~400 modèles qui partagent une poignée de descriptions : l'API retrouve la clé par le texte,
 * et le site retombe sur la description stockée si elle a été modifiée en admin. À garder synchronisé avec le seed.
 */
const HARDWARE_DESCRIPTIONS: Record<string, string> = {
  rgb: 'Plus de RGB que de hashrate.',
  blower: 'Turbine bruyante. Chauffe comme un grille-pain.',
  oldGpu: 'Rescapée du minage de 2017. Sent le cramé.',
  kidney: 'Coûte un rein. Le gauche.',
  degradation: 'Dégradation incluse sans supplément.',
  asic: 'Fait le bruit d’un avion au décollage. Ne fait qu’une seule chose, mais la fait bien.',
  cheapPsu: 'Certifiée « ça devrait aller ». Extincteur non fourni.',
  miningBoard: 'Plein de slots PCIe x1, zéro RGB. Une vraie carte de mineur.',
  window: 'Gratuit. Ta mère n’est pas d’accord.',
  fryer: 'Odeur de frites garantie dans tout le quartier.',
  woodCrate: 'Trouvée derrière un supermarché.',
  kallax: 'Montage : 3 h et une dispute.',
  hotAisle: 'Allée chaude / allée froide. Très sérieux.',
  container: 'Un conteneur maritime bourré de rigs. Classique.',
};
const BY_TEXT = new Map(Object.entries(HARDWARE_DESCRIPTIONS).map(([id, text]) => [text, id]));

/** Clé de traduction d'une description de matériel (null si elle ne vient pas du catalogue). */
export function hardwareDescriptionKey(description: string | null): string | null {
  const id = description ? BY_TEXT.get(description) : undefined;
  return id ? `catalog.hardware.${id}` : null;
}
