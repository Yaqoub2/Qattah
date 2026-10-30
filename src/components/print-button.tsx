"use client";

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="btn btn-ghost no-print text-sm" onClick={() => window.print()}>
      {label}
    </button>
  );
}
