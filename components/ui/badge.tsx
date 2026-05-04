import * as React from 'react';

type Variant = 'default' | 'success' | 'danger' | 'muted';

function cx(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(' ');
}

export function Badge(props: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  const { className, variant = 'default', ...rest } = props;
  const variants: Record<Variant, string> = {
    default: 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900',
    success: 'bg-emerald-600 text-white',
    danger: 'bg-red-600 text-white',
    muted: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300',
  };
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', variants[variant], className)} {...rest} />;
}

