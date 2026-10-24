export function gaMeasurementId(): string | null {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";
  return /^G-[A-Z0-9]+$/.test(id) ? id : null;
}
