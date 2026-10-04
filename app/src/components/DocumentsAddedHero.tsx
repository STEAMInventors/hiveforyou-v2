type DocumentsAddedHeroProps = {
  compact?: boolean;
};

export function DocumentsAddedHero({ compact = false }: DocumentsAddedHeroProps) {
  if (compact) {
    return (
      <header className="mb-4 w-full text-center sm:mb-5">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-hive-soft-sky/70 px-3 py-1 text-hive-blue">
          <span className="h-2 w-2 rounded-full bg-hive-sage" aria-hidden />
          <span className="font-mono text-xs font-medium text-hive-blue">Collection staged</span>
        </div>
        <h1 className="mb-2 font-serif text-2xl font-bold tracking-tight text-hive-navy sm:text-3xl">
          Your documents are ready.
        </h1>
        <p className="mx-auto max-w-xl font-sans text-sm leading-relaxed text-hive-blue sm:text-base">
          Review your selection, add anything else, then let Hive understand how your documents fit
          together.
        </p>
      </header>
    );
  }

  return (
    <header className="mb-8 w-full text-center">
      <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-hive-soft-sky/70 px-3 py-1 text-hive-blue">
        <span className="h-2 w-2 rounded-full bg-hive-sage" aria-hidden />
        <span className="font-mono text-xs font-medium text-hive-blue sm:text-sm">
          Collection staged
        </span>
      </div>
      <h1 className="mb-3 font-serif text-3xl font-bold tracking-tight text-hive-navy sm:text-4xl">
        Your documents are ready.
      </h1>
      <p className="mx-auto max-w-2xl font-sans text-base leading-relaxed text-hive-blue sm:text-lg">
        Review what you&apos;ve selected, add anything else you have, and let Hive begin
        understanding how your documents fit together.
      </p>
    </header>
  );
}
