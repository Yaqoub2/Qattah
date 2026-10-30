import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Type-only cast so server actions can be used as <form action>. Do not wrap at runtime. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ServerFormAction = (formData: FormData) => Promise<any>;

