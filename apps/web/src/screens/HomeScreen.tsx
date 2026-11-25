import { AppStatusCard } from '../components/AppStatusCard.tsx';
import { InstallCard } from '../components/InstallCard.tsx';
import { Logo } from '../components/Logo.tsx';

export function HomeScreen() {
  return (
    <div className="space-y-4 pt-2">
      <section className="relative overflow-hidden rounded-3xl bg-tangerine-500 px-6 pb-7 pt-8 text-white shadow-sm">
        <Logo className="pointer-events-none absolute -bottom-10 -right-8 size-32 rotate-12 opacity-20" title="" />
        <p className="text-sm font-semibold uppercase tracking-widest text-white/80">Hello, traveller</p>
        <h1 className="mt-2 text-3xl font-extrabold leading-tight">
          Travel together.
          <br />
          Don’t sweat the split.
        </h1>
        <p className="mt-3 max-w-xs text-white/90">
          Log what everyone pays, in any currency. At the end we work out the fewest bank transfers to square up.
        </p>
      </section>

      <InstallCard />

      <section className="rounded-3xl border-2 border-dashed border-ink-900/10 p-6 text-center">
        <div className="text-3xl" aria-hidden>
          🧳
        </div>
        <h2 className="mt-2 font-bold">Your trips will live here</h2>
        <p className="mt-1 text-sm text-ink-700">Sign-up, trips and invites arrive in the next update.</p>
      </section>

      <AppStatusCard />
    </div>
  );
}
