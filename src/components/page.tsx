import { BottomNav, GroupTabs } from "./shell";
import { Link } from "@/i18n/routing";

/** Mobile column with the bottom nav. */
export function Page({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="mx-auto min-h-[calc(100dvh-4rem)] max-w-lg px-4 pb-8 pt-5">{children}</main>
      <BottomNav />
    </>
  );
}

export function GroupPage({ group, children }: { group: { id: string; name: string }; children: React.ReactNode }) {
  return (
    <Page>
      <Link href={`/groups/${group.id}`} className="text-xl font-bold">
        {group.name}
      </Link>
      <GroupTabs groupId={group.id} />
      <div className="mt-5 space-y-5">{children}</div>
    </Page>
  );
}

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="card p-4 text-sm text-ink/50">{children}</p>;
}

/** Collapsible form block, keeps screens short on mobile. */
export function Fold({ label, children, open }: { label: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="card p-4" open={open}>
      <summary className="cursor-pointer text-sm font-semibold text-teal">{label}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
