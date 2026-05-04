import * as React from 'react';

type Variant = 'default' | 'outline' | 'destructive';

function cx(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(' ');
}

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' },
) {
  const { className, variant = 'default', size = 'md', ...rest } = props;
  const base =
    'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:pointer-events-none disabled:opacity-50';
  const sizes = size === 'sm' ? 'h-9 px-3' : 'h-10 px-4';
  const variants: Record<Variant, string> = {
    default: 'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200',
    outline:
      'border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800',
    destructive: 'bg-red-600 text-white hover:bg-red-700',
  };

  return <button className={cx(base, sizes, variants[variant], className)} {...rest} />;
}

