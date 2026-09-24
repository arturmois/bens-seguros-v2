import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import {
  useCreateInvitation,
  useListInvitations,
  useListMembers,
  useRevokeInvitation,
  useTransferPortfolio,
  useUpdateMember,
} from '@/api/endpoints'
import type { ListInvitations200ItemsItem, ListMembers200ItemsItem } from '@/api/model'
import { Button } from '@/components/ui/button'
import { Field } from '@/features/auth/components/field'
import { FormAlert } from '@/features/auth/components/form-alert'
import { ASSIGNABLE_ROLES, roleLabel } from '@/features/organizations/labels'
import { useMe } from '@/hooks/use-me'
import { ApiError } from '@/lib/http'

export const Route = createFileRoute('/_app/settings/members')({
  component: Members,
})

const inviteSchema = z.object({
  email: z.email('Informe um e-mail válido.'),
  role: z.enum(ASSIGNABLE_ROLES),
})

type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

type Confirm =
  | { kind: 'revoke'; id: string; email: string }
  | { kind: 'deactivate'; id: string; name: string }
  | { kind: 'transfer'; id: string; name: string; toMemberId: string }

function Members() {
  const me = useMe()
  if (!me.permissions.includes('member:update')) {
    return (
      <section className="mx-auto flex max-w-3xl flex-col gap-6">
        <h1 className="font-semibold text-2xl tracking-tight">Equipe</h1>
        <p>Você não gerencia a equipe desta corretora.</p>
      </section>
    )
  }
  return <Team />
}

function Team() {
  const members = useListMembers()
  const invitations = useListInvitations()
  const update = useUpdateMember()
  const [confirm, setConfirm] = useState<Confirm>()
  const [notice, setNotice] = useState<string>()
  const [failure, setFailure] = useState<string>()

  if (members.isPending || invitations.isPending) {
    return (
      <section className="mx-auto flex max-w-3xl flex-col gap-6">
        <h1 className="font-semibold text-2xl tracking-tight">Equipe</h1>
        <p>Carregando a equipe…</p>
      </section>
    )
  }

  if (members.isError || invitations.isError || !members.data || !invitations.data) {
    return (
      <section className="mx-auto flex max-w-3xl flex-col gap-6">
        <h1 className="font-semibold text-2xl tracking-tight">Equipe</h1>
        <p>Não foi possível carregar a equipe.</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void members.refetch()
            void invitations.refetch()
          }}
        >
          Tentar de novo
        </Button>
      </section>
    )
  }

  const people = members.data.items
  const pending = invitations.data.items

  async function refresh() {
    await Promise.all([members.refetch(), invitations.refetch()])
  }

  async function changeRole(id: string, role: AssignableRole) {
    setFailure(undefined)
    try {
      await update.mutateAsync({ id, data: { role } })
      await refresh()
    } catch (error) {
      setFailure(
        error instanceof ApiError ? error.message : 'Não foi possível concluir. Tente de novo.',
      )
    }
  }

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-8">
      <h1 className="font-semibold text-2xl tracking-tight">Equipe</h1>
      {notice ? <FormAlert tone="info">{notice}</FormAlert> : null}
      {failure && !confirm ? <FormAlert>{failure}</FormAlert> : null}
      <ul className="flex flex-col gap-3">
        {people.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            onDeactivate={() =>
              setConfirm({ kind: 'deactivate', id: member.id, name: member.name })
            }
            onRole={(role) => changeRole(member.id, role)}
            onTransfer={() => {
              const target = people.find((person) => person.id !== member.id && person.active)
              if (!target) return
              setConfirm({
                kind: 'transfer',
                id: member.id,
                name: member.name,
                toMemberId: target.id,
              })
            }}
          />
        ))}
      </ul>
      <InviteForm
        onSent={async () => {
          setFailure(undefined)
          await refresh()
        }}
      />
      <div className="flex flex-col gap-2">
        <h2 className="font-medium">Convites</h2>
        {pending.length === 0 ? <p>Nenhum convite pendente.</p> : null}
        <ul className="flex flex-col gap-2">
          {pending.map((invitation) => (
            <InvitationRow
              key={invitation.id}
              invitation={invitation}
              onRevoke={() =>
                setConfirm({ kind: 'revoke', id: invitation.id, email: invitation.email })
              }
            />
          ))}
        </ul>
      </div>
      {confirm ? (
        <ConfirmDialog
          confirm={confirm}
          people={people}
          failure={failure ?? ''}
          onChangeTarget={(toMemberId) => {
            if (confirm.kind === 'transfer') setConfirm({ ...confirm, toMemberId })
          }}
          onClose={() => {
            setConfirm(undefined)
            setFailure(undefined)
          }}
          onFailure={setFailure}
          onDone={async (message) => {
            setConfirm(undefined)
            setFailure(undefined)
            setNotice(message)
            await refresh()
          }}
        />
      ) : null}
    </section>
  )
}

function MemberRow({
  member,
  onDeactivate,
  onRole,
  onTransfer,
}: {
  member: ListMembers200ItemsItem
  onDeactivate: () => void
  onRole: (role: AssignableRole) => void
  onTransfer: () => void
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b py-3">
      <span>{member.name}</span>
      <span>{member.email}</span>
      <span>{roleLabel(member.role)}</span>
      <span>{member.active ? 'Ativo' : 'Inativo'}</span>
      <select
        aria-label={`Papel de ${member.email}`}
        value={member.role}
        onChange={(event) => {
          const role = event.target.value
          if (isAssignable(role)) onRole(role)
        }}
      >
        {ASSIGNABLE_ROLES.map((role) => (
          <option key={role} value={role}>
            {roleLabel(role)}
          </option>
        ))}
      </select>
      <Button type="button" variant="outline" onClick={onDeactivate}>
        Desativar
      </Button>
      {!member.active ? null : (
        <Button type="button" variant="outline" onClick={onTransfer}>
          Transferir carteira
        </Button>
      )}
    </li>
  )
}

function isAssignable(role: string): role is AssignableRole {
  return ASSIGNABLE_ROLES.some((item) => item === role)
}

function InvitationRow({
  invitation,
  onRevoke,
}: {
  invitation: ListInvitations200ItemsItem
  onRevoke: () => void
}) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span>{invitation.email}</span>
      <span>{roleLabel(invitation.role)}</span>
      <Button type="button" variant="outline" onClick={onRevoke}>
        Revogar
      </Button>
    </li>
  )
}

function InviteForm({ onSent }: { onSent: () => Promise<void> }) {
  const create = useCreateInvitation()
  const [failure, setFailure] = useState<string>()
  const form = useForm({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'ADMIN' as AssignableRole },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(undefined)
    try {
      await create.mutateAsync({ data: values })
      form.reset({ email: '', role: values.role })
      await onSent()
    } catch (error) {
      setFailure(
        error instanceof ApiError ? error.message : 'Não foi possível concluir. Tente de novo.',
      )
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <h2 className="font-medium">Convidar</h2>
      {failure ? <FormAlert>{failure}</FormAlert> : null}
      <Field
        id="invite-email"
        label="E-mail"
        type="email"
        error={errors.email?.message}
        {...form.register('email')}
      />
      <label className="flex flex-col gap-1.5 text-sm" htmlFor="invite-role">
        Papel
        <select id="invite-role" {...form.register('role')}>
          {ASSIGNABLE_ROLES.map((role) => (
            <option key={role} value={role}>
              {roleLabel(role)}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Aguarde…' : 'Enviar convite'}
      </Button>
    </form>
  )
}

function ConfirmDialog({
  confirm,
  people,
  failure,
  onChangeTarget,
  onClose,
  onFailure,
  onDone,
}: {
  confirm: Confirm
  people: ListMembers200ItemsItem[]
  failure: string
  onChangeTarget: (toMemberId: string) => void
  onClose: () => void
  onFailure: (message: string) => void
  onDone: (message: string) => Promise<void>
}) {
  const revoke = useRevokeInvitation()
  const update = useUpdateMember()
  const transfer = useTransferPortfolio()
  const pending = revoke.isPending || update.isPending || transfer.isPending
  const title = dialogTitle(confirm, people)
  const destination =
    confirm.kind === 'transfer'
      ? people.find((person) => person.id === confirm.toMemberId)
      : undefined

  async function run() {
    try {
      if (confirm.kind === 'revoke') {
        await revoke.mutateAsync({ id: confirm.id })
        await onDone('')
        return
      }
      if (confirm.kind === 'deactivate') {
        await update.mutateAsync({ id: confirm.id, data: { active: false } })
        await onDone('')
        return
      }
      const result = await transfer.mutateAsync({
        id: confirm.id,
        data: { toMemberId: confirm.toMemberId },
      })
      await onDone(`Transferidos: ${result.transferred}.`)
    } catch (error) {
      onFailure(
        error instanceof ApiError ? error.message : 'Não foi possível concluir. Tente de novo.',
      )
    }
  }

  return (
    <div
      role="dialog"
      aria-labelledby="confirm-title"
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id="confirm-title" className="font-medium">
        {title}
      </h2>
      {confirm.kind === 'transfer' ? (
        <label className="flex flex-col gap-1.5 text-sm" htmlFor="transfer-target">
          Destino
          <select
            id="transfer-target"
            value={confirm.toMemberId}
            onChange={(event) => onChangeTarget(event.target.value)}
          >
            {people
              .filter((person) => person.id !== confirm.id && person.active)
              .map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
          </select>
        </label>
      ) : null}
      {failure ? <FormAlert>{failure}</FormAlert> : null}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={() => void run()}
          disabled={pending || (confirm.kind === 'transfer' && !destination)}
        >
          {confirm.kind === 'revoke'
            ? 'Revogar'
            : confirm.kind === 'deactivate'
              ? 'Desativar'
              : 'Transferir'}
        </Button>
      </div>
    </div>
  )
}

function dialogTitle(confirm: Confirm, people: ListMembers200ItemsItem[]) {
  if (confirm.kind === 'revoke') return `Revogar o convite para ${confirm.email}?`
  if (confirm.kind === 'deactivate') return `Desativar ${confirm.name}?`
  const destination = people.find((person) => person.id === confirm.toMemberId)
  return `Transferir a carteira de ${confirm.name} para ${destination?.name ?? ''}?`
}
