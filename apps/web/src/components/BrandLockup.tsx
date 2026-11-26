import { Logo } from './Logo.tsx';

export const TAGLINE = 'split bills with friends';

/**
 * Brand hierarchy (SPEC §4): English name is primary; 别鸡较 sits underneath,
 * clearly smaller and secondary. Never the same size.
 */
export function BrandLockup({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  const lg = size === 'lg';
  return (
    <div className={`flex items-center ${lg ? 'gap-4' : 'gap-2.5'}`}>
      <Logo className={lg ? 'size-16 drop-shadow-sm' : 'size-9'} />
      <div className="leading-none">
        <div className={`font-extrabold tracking-tight text-ink-900 ${lg ? 'text-3xl' : 'text-lg'}`}>
          Chick<span className="text-tangerine-600">AA</span>
        </div>
        <div className={`mt-1 text-ink-500 ${lg ? 'text-sm' : 'text-[10px]'}`}>
          <span lang="zh-Hans" className="tracking-[0.3em]">别鸡较</span>
          <span>· {TAGLINE}</span>
        </div>
      </div>
    </div>
  );
}
