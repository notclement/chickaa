import { Link } from 'react-router';

export function NotFoundScreen() {
  return (
    <div className="py-16 text-center">
      <div className="text-5xl" aria-hidden>
        🐣
      </div>
      <h1 className="mt-4 text-2xl font-extrabold">Nothing to see here</h1>
      <p className="mt-2 text-ink-700">This page doesn’t exist (yet).</p>
      <Link to="/" className="mt-6 inline-block rounded-2xl bg-tangerine-500 px-6 py-3 font-bold text-white">
        Back home
      </Link>
    </div>
  );
}
