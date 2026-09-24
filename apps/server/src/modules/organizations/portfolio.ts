import type { Transaction } from '../../infrastructure/database.ts'

// A module that stores an owner moves its rows in the portfolio transfer (AD-014) and returns how
// many moved. `app.ts` hands the list to `memberRoutes`: organizations imports no module that owns
// such a table, so no import cycle forms when those modules get routes of their own (AD-017).
export type PortfolioMove = (
  tx: Transaction,
  fromUserId: string,
  toUserId: string,
) => Promise<number>

// A step that every new organization needs from another module (its default Web Chat), run inside
// the onboarding transaction. Wired by `app.ts`, like the portfolio moves.
export type OrganizationSetup = (tx: Transaction) => Promise<void>
