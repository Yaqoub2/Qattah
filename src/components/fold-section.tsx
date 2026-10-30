"use client";

export function FoldSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="rounded-[1.25rem] border border-line bg-white/60">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink/65 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="fold-arrow me-2 inline-block text-ink/35 transition-transform">▸</span>
        {title}
      </summary>
      <div className="space-y-3 px-3 pb-3">{children}</div>
    </details>
  );
}
