import { Logo } from './Logo.tsx';

/**
 * Brand hierarchy (SPEC §4): English name is primary; 别计较 sits underneath,
 * clearly smaller and secondary. Never the same size.
 */
export function BrandLockup({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  const lg = size === 'lg';
  return (
    <div className={`flex items-center ${lg ? 'gap-4' : 'gap-2.5'}`}>
      <Logo className={lg ? 'size-16 drop-shadow-sm' : 'size-9'} />
      <div className="leading-none">
        <div className={`font-extrabold tracking-tight text-ink-900 ${lg ? 'text-3xl' : 'text-lg'}`}>
          No<span className="text-tangerine-600">Chicken</span>Call
        </div>
        <div lang="zh-Hans" className={`mt-1 tracking-[0.3em] text-ink-500 ${lg ? 'text-sm' : 'text-[10px]'}`}>
          别计较
        </div>
      </div>
    </div>
  );
}
