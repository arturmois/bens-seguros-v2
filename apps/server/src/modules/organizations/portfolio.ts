import type { Transaction } from '../../infrastructure/database.ts'

// Later phases append a move per table that stores `salespersonId` (AD-009). Empty until then.
export type PortfolioMove = (
  tx: Transaction,
  fromUserId: string,
  toUserId: string,
) => Promise<number>

export const portfolioMoves: PortfolioMove[] = []
