import "server-only";

/** Columns for a new expense or payment: approved when an admin creates it, pending otherwise. */
export const approvalFor = (admin: boolean, userId: string) =>
  admin ? { approvedAt: new Date(), approvedById: userId } : { approvedAt: null, approvedById: null };
