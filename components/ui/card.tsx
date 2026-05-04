import * as React from 'react';

function cx(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(' ');
}

export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950', props.className)} {...props} />;
}

export function CardHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('flex flex-col space-y-1.5 p-4', props.className)} {...props} />;
}

export function CardTitle(props: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cx('text-sm font-medium leading-none tracking-tight', props.className)} {...props} />;
}

export function CardContent(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('p-4 pt-0', props.className)} {...props} />;
}

