import { type CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js/max'

// The contact's identity is the phone in E.164 (handoff §9), normalized where it enters the
// system. Numbers without `+` are read as Brazilian. `max` metadata checks the digits themselves,
// not only the length (`min` would accept a landline starting with 1 or a number without the area
// code).
export function normalizePhone(raw: string, defaultCountry: CountryCode = 'BR'): string | null {
  const phone = parsePhoneNumberFromString(raw, { defaultCountry, extract: false })
  return phone?.isValid() ? phone.number : null
}
