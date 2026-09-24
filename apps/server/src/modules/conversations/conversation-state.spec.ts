import { describe, expect, it } from 'vitest'
import {
  aiAvailable,
  canSend,
  close,
  FORBIDDEN_TRANSITION,
  type Handler,
  type HandlerEvent,
  handlerAfter,
  onInbound,
  onOutbound,
  reopenHandler,
  type Sender,
  type Status,
} from './conversation-state.ts'

const STATUSES: Status[] = ['OPEN', 'WAITING', 'CLOSED']
const HANDLERS: Handler[] = ['AI', 'QUEUE', 'HUMAN']
const EVENTS: HandlerEvent[] = [
  'requestHuman',
  'aiFailure',
  'aiLimit',
  'take',
  'assign',
  'returnToQueue',
  'returnToAi',
]
const F = FORBIDDEN_TRANSITION

describe('conversation status', () => {
  it('maps every status transition', () => {
    const expected: Record<Status, [Status, Status | typeof F, Status | typeof F]> = {
      // [inbound, outbound, close]
      OPEN: ['OPEN', 'WAITING', 'CLOSED'],
      WAITING: ['OPEN', 'WAITING', 'CLOSED'],
      CLOSED: ['OPEN', F, F],
    }
    for (const status of STATUSES) {
      expect([onInbound(status), onOutbound(status), close(status)], status).toEqual(
        expected[status],
      )
    }
  })
})

describe('conversation handler', () => {
  it('maps every handler transition', () => {
    const expected: Record<Handler, Record<HandlerEvent, Handler | typeof F>> = {
      AI: {
        requestHuman: 'QUEUE',
        aiFailure: 'QUEUE',
        aiLimit: 'QUEUE',
        take: 'HUMAN',
        assign: 'HUMAN',
        returnToQueue: F,
        returnToAi: F,
      },
      QUEUE: {
        requestHuman: F,
        aiFailure: F,
        aiLimit: F,
        take: 'HUMAN',
        assign: 'HUMAN',
        returnToQueue: F,
        returnToAi: F,
      },
      HUMAN: {
        requestHuman: F,
        aiFailure: F,
        aiLimit: F,
        take: F,
        assign: F,
        returnToQueue: 'QUEUE',
        returnToAi: 'AI',
      },
    }
    let cases = 0
    for (const handler of HANDLERS) {
      for (const event of EVENTS) {
        expect(handlerAfter(handler, event), `${handler} + ${event}`).toEqual(
          expected[handler][event],
        )
        cases++
      }
    }
    expect(cases).toBe(21)
  })

  it('never hands a queued or human conversation to the ai automatically', () => {
    const automatic: HandlerEvent[] = ['requestHuman', 'aiFailure', 'aiLimit']
    for (const handler of ['QUEUE', 'HUMAN'] as const) {
      for (const event of automatic) {
        expect(handlerAfter(handler, event), `${handler} + ${event}`).not.toBe('AI')
      }
    }
    expect(reopenHandler({ aiAvailable: false })).not.toBe('AI')
  })

  it('reopens to the ai only when it is available', () => {
    expect(reopenHandler({ aiAvailable: true })).toBe('AI')
    expect(reopenHandler({ aiAvailable: false })).toBe('QUEUE')
  })

  it('has no ai before F4', () => {
    expect(aiAvailable()).toBe(false)
  })
})

describe('canSend', () => {
  it('decides who may send', () => {
    const senders: [string, Sender][] = [
      ['CONTACT', { author: 'CONTACT' }],
      ['AI', { author: 'AI' }],
      ['HUMAN assignee', { author: 'HUMAN', userId: 'x' }],
      ['HUMAN other', { author: 'HUMAN', userId: 'y' }],
      ['SYSTEM', { author: 'SYSTEM' }],
    ]
    // Allowed on an open conversation, per sender and handler; nobody sends on a closed one.
    const allowedWhenOpen: Record<string, Handler[]> = {
      CONTACT: [],
      AI: ['AI'],
      'HUMAN assignee': ['HUMAN'],
      'HUMAN other': [],
      SYSTEM: ['AI', 'QUEUE', 'HUMAN'],
    }
    let cases = 0
    for (const [name, sender] of senders) {
      for (const handler of HANDLERS) {
        for (const status of ['OPEN', 'CLOSED'] as const) {
          const conversation = {
            status,
            handler,
            assigneeId: handler === 'HUMAN' ? 'x' : null,
          }
          const expected = status === 'OPEN' && (allowedWhenOpen[name] ?? []).includes(handler)
          expect(canSend(conversation, sender), `${name} ${handler} ${status}`).toBe(expected)
          cases++
        }
      }
    }
    expect(cases).toBe(30)
  })
})
