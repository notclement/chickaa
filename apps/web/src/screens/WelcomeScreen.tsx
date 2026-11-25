import { InstallCard } from '../components/InstallCard.tsx';
import { Logo } from '../components/Logo.tsx';
import { ButtonLink } from '../ui/index.tsx';

/** Signed-out home. */
export function WelcomeScreen() {
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
      <div className="grid gap-2">
        <ButtonLink to="/register" block>
          Create account
        </ButtonLink>
        <ButtonLink to="/login" variant="secondary" block>
          Log in
        </ButtonLink>
      </div>
      <InstallCard />
    </div>
  );
}
