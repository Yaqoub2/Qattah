import "server-only";
import { groupLedger } from "@/lib/ledger";
import { ledgerMembers, listActivities, listEntries, paymentTotals, type LoadedGroup } from "./queries";

/**
 * The one place a group's balances are computed: 3 queries, then pure math.
 * The group (members) is awaited alongside them, so this costs no extra round trip after the access check.
 */
export async function computeGroupLedger(groupId: string, group: LoadedGroup | Promise<LoadedGroup | null>) {
  const [g, activities, entries, payments] = await Promise.all([
    group,
    listActivities(groupId),
    listEntries(groupId),
    paymentTotals(groupId),
  ]);
  if (!g) return null;
  return { activities, ...groupLedger({ members: ledgerMembers(g), activities, entries, payments }) };
}
