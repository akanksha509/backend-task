export const normalizeEmail = (email: string | null | undefined): string | null => {
  // if not a string, treat as absent
  if (typeof email !== "string") return null;
  // trim spaces and lowercase for consistency
  const trimmed = email.trim().toLowerCase();
  // empty string becomes null
  return trimmed === "" ? null : trimmed;
};

export const normalizePhone = (phone: string | null | undefined): string | null => {
  // treat null/undefined as absent
  if (phone == null) return null;
  // strip every non-digit character
  const digits = phone.toString().replace(/\D/g, "");
  // return null if nothing left
  return digits === "" ? null : digits;
};

