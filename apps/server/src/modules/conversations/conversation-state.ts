import type { ConversationHandler, ConversationStatus } from '../../generated/prisma/client.ts'

// ADR-013: the conversation's state and who conducts it are two independent dimensions, and every
// rule about them is a pure function here. Use cases apply the result with a conditional update.

export type Status = ConversationStatus
export type Handler = ConversationHandler

export const FORBIDDEN_TRANSITION = { error: 'FORBIDDEN_TRANSITION' } as const
export type Forbidden = typeof FORBIDDEN_TRANSITION

// A message from the customer always leaves the conversation open, reopening a closed one (§17).
export function onInbound(_status: Status): Status {
  return 'OPEN'
}

// WAITING = waiting for the customer: the last message was ours.
export function onOutbound(status: Status): Status | Forbidden {
  return status === 'CLOSED' ? FORBIDDEN_TRANSITION : 'WAITING'
}

// Closing is a human action (F3); closing twice is not a transition.
export function close(status: Status): Status | Forbidden {
  return status === 'CLOSED' ? FORBIDDEN_TRANSITION : 'CLOSED'
}

export type HandlerEvent =
  | 'requestHuman' // the AI asks for a human (F4)
  | 'aiFailure' // the AI failed for good (F4)
  | 'aiLimit' // the usage limit was reached (F4)
  | 'take' // a human takes the conversation (F3/F5)
  | 'assign' // ADMIN/MANAGER assign it (F5)
  | 'returnToQueue' // the human gives it back to the queue (F5)
  | 'returnToAi' // the human hands it back to the AI, only explicitly (§20)

const HANDLER_TRANSITIONS: Record<Handler, Partial<Record<HandlerEvent, Handler>>> = {
  AI: {
    requestHuman: 'QUEUE',
    aiFailure: 'QUEUE',
    aiLimit: 'QUEUE',
    take: 'HUMAN',
    assign: 'HUMAN',
  },
  QUEUE: { take: 'HUMAN', assign: 'HUMAN' },
  // Nothing automatic leaves a human conversation; only the human sends it back (§19, §20).
  HUMAN: { returnToQueue: 'QUEUE', returnToAi: 'AI' },
}

export function handlerAfter(handler: Handler, event: HandlerEvent): Handler | Forbidden {
  return HANDLER_TRANSITIONS[handler][event] ?? FORBIDDEN_TRANSITION
}

// A new or reopened conversation goes to the AI when it can answer, else to the queue; never back to
// the previous human (ADR-013).
export function reopenHandler(input: { aiAvailable: boolean }): 'AI' | 'QUEUE' {
  return input.aiAvailable ? 'AI' : 'QUEUE'
}

// F4 replaces this with the organization and channel flags and the usage limit.
export function aiAvailable(): boolean {
  return false
}

export type Sender =
  | { author: 'CONTACT' }
  | { author: 'AI' }
  | { author: 'HUMAN'; userId: string }
  | { author: 'SYSTEM' }

// Who may write an outbound message: the AI while it handles the conversation, the assigned human,
// and the system with any handler. Nobody on a closed conversation; the customer only writes inbound.
export function canSend(
  conversation: { status: Status; handler: Handler; assigneeId: string | null },
  sender: Sender,
): boolean {
  if (conversation.status === 'CLOSED') return false
  switch (sender.author) {
    case 'CONTACT':
      return false
    case 'AI':
      return conversation.handler === 'AI'
    case 'HUMAN':
      return conversation.handler === 'HUMAN' && conversation.assigneeId === sender.userId
    case 'SYSTEM':
      return true
  }
}
