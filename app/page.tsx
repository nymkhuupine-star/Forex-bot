export default function Home() {
  return (
    <div className="flex min-h-full items-center justify-center bg-zinc-50 p-8 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <div className="w-full max-w-xl rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold">XM (MT5) Bot</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Dashboard is available at:</p>
        <a className="mt-3 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900" href="/dashboard">
          Open Dashboard
        </a>
      </div>
    </div>
  );
}
