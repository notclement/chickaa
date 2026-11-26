/** What being a 💛 Supporter gives you. Keep in step with docs/FEATURES.md. */
const PERKS: { emoji: string; title: string; detail: string; soon: boolean }[] = [
  { emoji: '💛', title: 'Supporter badge', detail: 'Shown next to your name.', soon: false },
  { emoji: '📄', title: 'Export trips', detail: 'Download any trip as a PDF summary or a CSV spreadsheet.', soon: true },
  { emoji: '📊', title: 'Trip recap', detail: 'Charts of spending by category, person and day, plus fun stats.', soon: true },
  { emoji: '🧾', title: 'Receipt photos', detail: 'Attach a photo of the receipt to any expense.', soon: true },
  { emoji: '✨', title: 'Early access', detail: 'Try new features before everyone else.', soon: true },
];

export function SupporterPerks() {
  return (
    <div data-testid="supporter-perks">
      <h2 className="font-bold">What Supporters get</h2>
      <ul className="mt-3 space-y-3">
        {PERKS.map((p) => (
          <li key={p.title} className="flex gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sun-300/40 text-lg" aria-hidden>
              {p.emoji}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {p.title}
                {p.soon ? (
                  <span className="rounded-full bg-ink-900/5 px-2 py-0.5 text-[11px] font-bold text-ink-500">Coming soon</span>
                ) : (
                  <span className="rounded-full bg-owed/15 px-2 py-0.5 text-[11px] font-bold text-owed">Now</span>
                )}
              </div>
              <p className="text-sm text-ink-700">{p.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-500">
        Everything you use today (trips, expenses, balances, settling up) stays free for everyone, with no limits. Supporters keep the extras for as long as
        they’re a Supporter; lifetime Supporters keep them for good.
      </p>
    </div>
  );
}
