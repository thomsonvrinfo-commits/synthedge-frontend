import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 


export const isIframe = window.self !== window.top;

/**
 * Returns the best display name for a user.
 * Priority: user.full_name (first word) → user.email prefix → "Trader"
 */
export function getDisplayName(user, { firstNameOnly = true } = {}) {
  if (!user) return "Trader";
  const name = user.full_name || "";
  if (name.trim()) return firstNameOnly ? name.trim().split(" ")[0] : name.trim();
  if (user.email) return user.email.split("@")[0];
  return "Trader";
}