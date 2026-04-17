export type LeadInput = {
  name: string;
  phone: string;
  email: string;
  address: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  selectedColourId?: string;
  selectedColourName?: string;
  bestTime?: string;
  notes?: string;
  /** Honeypot — must be empty. */
  company?: string;
};

export type ValidationError = { field: keyof LeadInput; message: string };

const NAME_RE = /^[\p{L}\p{M}'\-\s.]{2,80}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// AU phone: allow +61 or 0, 8–14 digits with common separators.
const PHONE_RE = /^(\+?61|0)[\s\-()]?[2-47-9](?:[\s\-()]?\d){7,10}$/;

export function validateLead(
  input: Partial<LeadInput>
): { ok: true; value: LeadInput } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  const name = (input.name ?? "").trim();
  const phone = (input.phone ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();
  const address = (input.address ?? "").trim();

  if (!NAME_RE.test(name)) {
    errors.push({ field: "name", message: "Please enter your full name" });
  }
  if (!PHONE_RE.test(phone.replace(/\s/g, ""))) {
    errors.push({
      field: "phone",
      message: "Please enter a valid Australian phone number",
    });
  }
  if (!EMAIL_RE.test(email)) {
    errors.push({ field: "email", message: "Please enter a valid email" });
  }
  if (address.length < 5) {
    errors.push({ field: "address", message: "Missing address" });
  }
  if (input.company && input.company.length > 0) {
    // Honeypot tripped — treat as invalid without revealing why.
    errors.push({ field: "company", message: "Invalid submission" });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name,
      phone,
      email,
      address,
      lat: typeof input.lat === "number" ? input.lat : undefined,
      lng: typeof input.lng === "number" ? input.lng : undefined,
      placeId: input.placeId?.trim() || undefined,
      selectedColourId: input.selectedColourId?.trim() || undefined,
      selectedColourName: input.selectedColourName?.trim() || undefined,
      bestTime: input.bestTime?.trim() || undefined,
      notes: input.notes?.trim().slice(0, 2000) || undefined,
    },
  };
}
