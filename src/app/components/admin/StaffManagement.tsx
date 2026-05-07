import React, { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Trash2,
  Copy,
  Check,
  Users,
  ShieldCheck,
  UserCheck,
  Pencil,
  Eye,
  EyeOff,
  Lock,
  Power,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'motion/react'
import {
  createStaffMember,
  getStaffMembers,
  updateStaffMember,
  deleteStaffMember,
  setStaffMemberActive,
  resetStaffPassword,
} from '@/lib/api/staffAdmin'
import type { MemberRole } from '@/types/database'
import type { StaffMemberSummary } from '@/lib/api/staffAdmin'

interface Props {
  storeId: string
  currentUserId: string
}

interface KnownPassword {
  password: string
  revealed: boolean
}

const ROLE_LABEL: Record<MemberRole, string> = {
  owner: '최고관리자',
  manager: '매니저',
  staff: '직원',
}

const ROLE_BADGE_CLASS: Record<MemberRole, string> = {
  owner: 'bg-orange-100 text-orange-700',
  manager: 'bg-blue-100 text-blue-700',
  staff: 'bg-zinc-100 text-zinc-600',
}

const EMPTY_FORM = {
  email: '',
  password: '',
  name: '',
  role: 'staff' as 'manager' | 'staff',
}

export function StaffManagement({ storeId, currentUserId }: Props) {
  const [members, setMembers] = useState<StaffMemberSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<StaffMemberSummary | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [knownPasswords, setKnownPasswords] = useState<Record<string, KnownPassword>>({})

  const [formEmail, setFormEmail] = useState(EMPTY_FORM.email)
  const [formPassword, setFormPassword] = useState(EMPTY_FORM.password)
  const [formName, setFormName] = useState(EMPTY_FORM.name)
  const [formRole, setFormRole] = useState<'manager' | 'staff'>(EMPTY_FORM.role)

  const loadMembers = useCallback(async () => {
    try {
      setLoading(true)
      const data = await getStaffMembers(storeId)
      setMembers(data)
    } catch {
      toast.error('직원 목록을 불러오는 데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    void loadMembers()
  }, [loadMembers])

  function resetForm() {
    setFormEmail(EMPTY_FORM.email)
    setFormPassword(EMPTY_FORM.password)
    setFormName(EMPTY_FORM.name)
    setFormRole(EMPTY_FORM.role)
  }

  function openCreateModal() {
    resetForm()
    setEditingMember(null)
    setIsCreateModalOpen(true)
  }

  function openEditModal(member: StaffMemberSummary) {
    setEditingMember(member)
    setFormEmail(member.email)
    setFormPassword('')
    setFormName(member.name)
    setFormRole(member.role === 'manager' ? 'manager' : 'staff')
    setIsCreateModalOpen(true)
  }

  function closeModal() {
    if (submitting) return
    setIsCreateModalOpen(false)
    setEditingMember(null)
    resetForm()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)

    try {
      if (editingMember) {
        const updated = await updateStaffMember({
          storeId,
          memberId: editingMember.id,
          userId: editingMember.userId,
          email: formEmail,
          name: formName,
          role: formRole,
        })
        setMembers((prev) => prev.map((member) => (member.id === updated.id ? updated : member)))
        toast.success('직원 정보가 수정됐습니다.')
      } else {
        const created = await createStaffMember(storeId, formEmail, formPassword, formName, formRole)
        await loadMembers()
        setKnownPasswords((prev) => ({
          ...prev,
          [created.userId]: { password: formPassword, revealed: true },
        }))
        toast.success('직원 계정이 생성됐습니다.')
      }

      closeModal()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '직원 저장에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(member: StaffMemberSummary) {
    if (member.userId === currentUserId) {
      toast.error('자기 자신은 삭제할 수 없습니다.')
      return
    }
    if (!confirm(`${member.name} 계정을 완전히 삭제하시겠습니까?`)) return

    try {
      await deleteStaffMember({ storeId, memberId: member.id, userId: member.userId })
      setMembers((prev) => prev.filter((m) => m.id !== member.id))
      setKnownPasswords((prev) => {
        const next = { ...prev }
        delete next[member.userId]
        return next
      })
      toast.success('직원 계정이 삭제됐습니다.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '직원 삭제에 실패했습니다.')
    }
  }

  async function handleToggleActive(member: StaffMemberSummary) {
    if (member.userId === currentUserId) {
      toast.error('자기 자신은 비활성화할 수 없습니다.')
      return
    }

    const nextActive = !member.isActive
    const actionLabel = nextActive ? '재활성화' : '비활성화'
    if (!confirm(`${member.name} 계정을 ${actionLabel}하시겠습니까?`)) return

    try {
      const updated = await setStaffMemberActive({
        storeId,
        memberId: member.id,
        isActive: nextActive,
      })
      setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      toast.success(`직원 계정이 ${actionLabel}됐습니다.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `직원 ${actionLabel}에 실패했습니다.`)
    }
  }

  async function handleResetPassword(member: StaffMemberSummary) {
    if (!confirm(`${member.name}의 비밀번호를 새 임시 비밀번호로 초기화할까요?`)) return

    try {
      const { tempPassword } = await resetStaffPassword(member.userId, storeId)
      setKnownPasswords((prev) => ({
        ...prev,
        [member.userId]: { password: tempPassword, revealed: true },
      }))
      toast.success('임시 비밀번호를 새로 발급했습니다.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '비밀번호 초기화에 실패했습니다.')
    }
  }

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
      toast.success('복사되었습니다.')
    } catch {
      toast.error('복사에 실패했습니다.')
    }
  }

  function togglePasswordReveal(userId: string) {
    setKnownPasswords((prev) => {
      const current = prev[userId]
      if (!current) return prev
      return {
        ...prev,
        [userId]: {
          ...current,
          revealed: !current.revealed,
        },
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-zinc-900">직원 관리</h2>
          <p className="text-sm font-medium text-zinc-500 mt-1">직원 계정 생성, 수정, 비활성화, 삭제를 한 화면에서 관리합니다.</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 text-white rounded-2xl font-bold text-sm hover:bg-zinc-800 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          직원 추가
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-zinc-200/80 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-zinc-400 font-bold">불러오는 중...</div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-400">
            <Users className="w-10 h-10" />
            <p className="font-bold">등록된 직원이 없습니다.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/50">
                <th className="text-left text-xs font-black text-zinc-500 uppercase tracking-wider px-6 py-4">이름</th>
                <th className="text-left text-xs font-black text-zinc-500 uppercase tracking-wider px-6 py-4">이메일</th>
                <th className="text-left text-xs font-black text-zinc-500 uppercase tracking-wider px-6 py-4">역할</th>
                <th className="text-left text-xs font-black text-zinc-500 uppercase tracking-wider px-6 py-4">임시 비밀번호</th>
                <th className="text-left text-xs font-black text-zinc-500 uppercase tracking-wider px-6 py-4">상태</th>
                <th className="px-6 py-4 text-right text-xs font-black text-zinc-500 uppercase tracking-wider">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {members.map((member) => {
                const passwordState = knownPasswords[member.userId]
                const isSelf = member.userId === currentUserId
                return (
                  <tr key={member.id} className="hover:bg-zinc-50/50 transition-colors align-top">
                    <td className="px-6 py-4">
                      <div className="font-bold text-zinc-900">{member.name || '이름 없음'}</div>
                      <div className="text-xs text-zinc-400 mt-1">생성 {new Date(member.createdAt).toLocaleDateString('ko-KR')}</div>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-zinc-700">{member.email || '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black ${ROLE_BADGE_CLASS[member.role]}`}>
                        {member.role === 'owner' && <ShieldCheck className="w-3 h-3" />}
                        {member.role === 'manager' && <UserCheck className="w-3 h-3" />}
                        {ROLE_LABEL[member.role]}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {passwordState ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="px-2.5 py-1.5 rounded-xl bg-zinc-100 text-xs font-bold text-zinc-800">
                            {passwordState.revealed ? passwordState.password : '••••••••'}
                          </code>
                          <button
                            type="button"
                            aria-label={passwordState.revealed ? '비밀번호 숨기기' : '비밀번호 보기'}
                            onClick={() => togglePasswordReveal(member.userId)}
                            className="p-2 rounded-xl bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors"
                          >
                            {passwordState.revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                          <button
                            type="button"
                            aria-label="비밀번호 복사"
                            onClick={() => copyToClipboard(passwordState.password, member.userId)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-xs font-black text-zinc-700 transition-colors"
                          >
                            {copiedId === member.userId ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                            {copiedId === member.userId ? '복사됨' : '복사'}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          aria-label="비밀번호 초기화"
                          onClick={() => void handleResetPassword(member)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-xl text-xs font-black hover:bg-amber-100 transition-colors"
                        >
                          <Lock className="w-3.5 h-3.5" /> 비밀번호 초기화
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-start gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black border ${
                            member.isActive
                              ? 'bg-green-50 text-green-700 border-green-200/50'
                              : 'bg-zinc-100 text-zinc-500 border-zinc-200'
                          }`}
                        >
                          {member.isActive ? '활성' : '비활성'}
                        </span>
                        {member.isFirstLogin && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-black border border-amber-200/50">
                            첫 로그인 전
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        <button
                          type="button"
                          aria-label="수정"
                          onClick={() => openEditModal(member)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-100 text-zinc-700 text-xs font-black hover:bg-zinc-200 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" /> 수정
                        </button>
                        <button
                          type="button"
                          aria-label={member.isActive ? '비활성화' : '재활성화'}
                          onClick={() => void handleToggleActive(member)}
                          disabled={isSelf || member.role === 'owner'}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-100 text-zinc-700 text-xs font-black hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {member.isActive ? <Power className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
                          {member.isActive ? '비활성화' : '재활성화'}
                        </button>
                        <button
                          type="button"
                          aria-label="삭제"
                          onClick={() => void handleDelete(member)}
                          disabled={isSelf || member.role === 'owner'}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-black hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> 삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <AnimatePresence>
        {isCreateModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm"
              onClick={closeModal}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 40 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white rounded-[32px] z-[70] shadow-2xl overflow-hidden flex flex-col p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-extrabold text-zinc-900">{editingMember ? '직원 수정' : '직원 추가'}</h2>
                  <p className="text-sm font-medium text-zinc-500 mt-0.5">
                    {editingMember ? '이름, 이메일, 역할을 수정합니다.' : '새 직원 계정을 생성합니다.'}
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  className="p-2 text-zinc-400 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100 rounded-full transition-colors"
                >
                  <Plus className="w-5 h-5 rotate-45" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-zinc-900 mb-1.5">이름</label>
                  <input
                    required
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="홍길동"
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm font-medium text-zinc-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-zinc-900 mb-1.5">이메일</label>
                  <input
                    required
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="staff@example.com"
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm font-medium text-zinc-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
                  />
                </div>

                {!editingMember && (
                  <div>
                    <label className="block text-sm font-bold text-zinc-900 mb-1.5">임시 비밀번호</label>
                    <input
                      required
                      type="text"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      placeholder="특수문자 포함 8자 이상"
                      className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm font-medium text-zinc-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
                    />
                    <p className="text-xs text-zinc-400 font-medium mt-1.5">직원이 첫 로그인 후 비밀번호를 변경해야 합니다.</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-bold text-zinc-900 mb-1.5">역할</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['staff', 'manager'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        data-testid={`role-${r}`}
                        onClick={() => setFormRole(r)}
                        className={`py-3 rounded-xl text-sm font-black border-2 transition-all ${
                          formRole === r
                            ? 'border-orange-500 bg-orange-50 text-orange-600'
                            : 'border-zinc-200 text-zinc-500 hover:border-zinc-300'
                        }`}
                      >
                        {ROLE_LABEL[r]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 py-4 bg-zinc-100 text-zinc-700 font-bold rounded-2xl hover:bg-zinc-200 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-[2] py-4 bg-zinc-900 text-white font-bold rounded-2xl hover:bg-zinc-800 transition-all shadow-[0_8px_30px_rgb(0,0,0,0.12)] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting ? '저장 중...' : editingMember ? '수정 저장' : '직원 추가'}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
