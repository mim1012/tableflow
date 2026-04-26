'use client';

import React from 'react';
import { Search, Settings, PenSquare, UserPlus, X, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

export interface Customer {
  id: string;
  name: string;
  profileImage?: string | null;
  phone?: string | null;
  kakaoFriend?: boolean;
  points: number;
  visitCount: number;
  lastVisitedAt?: string | null;
}

interface CustomersPanelProps {
  storeId: string;
  customers: Customer[];
  onEditCustomer: (customer: Customer) => void;
  onAddCustomer: (name: string, phone: string) => Promise<void>;
  pointRate: number;
  onEditPointPolicy: () => void;
  isLoading?: boolean;
}

export default function CustomersPanel({
  storeId,
  customers,
  onEditCustomer,
  onAddCustomer,
  onEditPointPolicy,
  isLoading,
}: CustomersPanelProps) {
  const [search, setSearch] = React.useState('');
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [addName, setAddName] = React.useState('');
  const [addPhone, setAddPhone] = React.useState('');
  const [isAdding, setIsAdding] = React.useState(false);
  const [isBroadcastOpen, setIsBroadcastOpen] = React.useState(false);
  const [broadcastMsg, setBroadcastMsg] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);

  const kakaoFriends = React.useMemo(() => customers.filter((c) => c.kakaoFriend && c.phone), [customers]);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMsg.trim() || kakaoFriends.length === 0) return;
    setIsSending(true);
    try {
      const { broadcastPromotion } = await import('@/lib/api/alimtalk');
      const { sent, failed } = await broadcastPromotion(
        storeId,
        kakaoFriends.map((c) => ({ id: c.id, phone: c.phone ?? null, name: c.name })),
        broadcastMsg.trim(),
      );
      setBroadcastMsg('');
      setIsBroadcastOpen(false);
      if (failed === 0) {
        toast.success(`${sent}명에게 발송 완료`);
      } else {
        toast.success(`발송 완료: ${sent}명 성공 / ${failed}명 실패`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '발송에 실패했습니다.');
    } finally {
      setIsSending(false);
    }
  };

  const filtered = React.useMemo(
    () => search.trim()
      ? customers.filter(
          (c) =>
            c.name.includes(search.trim()) ||
            (c.phone ?? '').replace(/-/g, '').includes(search.trim().replace(/-/g, '')),
        )
      : customers,
    [customers, search],
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim() || !addPhone.trim()) return;
    setIsAdding(true);
    try {
      await onAddCustomer(addName.trim(), addPhone.trim());
      setAddName('');
      setAddPhone('');
      setIsAddOpen(false);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-zinc-900">고객/포인트 관리</h2>
          <p className="text-xs md:text-sm text-zinc-500 mt-0.5 md:mt-1">고객 전화번호 등록 및 포인트를 관리합니다.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="flex-1 md:w-64 bg-white border border-zinc-200 px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm flex items-center gap-2">
            <Search className="w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="이름 또는 전화번호"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent border-none outline-none text-zinc-800 placeholder:text-zinc-400 w-full"
            />
          </div>
          <button
            onClick={() => setIsAddOpen(true)}
            className="bg-orange-500 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-orange-600 transition-colors shadow-sm flex items-center justify-center gap-2 shrink-0"
          >
            <UserPlus className="w-4 h-4" /> 고객 추가
          </button>
          {kakaoFriends.length > 0 && (
            <button
              onClick={() => setIsBroadcastOpen(true)}
              className="bg-yellow-400 text-yellow-900 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-yellow-500 transition-colors shadow-sm flex items-center justify-center gap-2 shrink-0"
            >
              <Send className="w-4 h-4" /> 홍보 발송 ({kakaoFriends.length})
            </button>
          )}
          <button
            onClick={onEditPointPolicy}
            className="bg-zinc-900 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-zinc-800 transition-colors shadow-sm flex items-center justify-center gap-2 shrink-0"
          >
            <Settings className="w-4 h-4" /> 이벤트
          </button>
        </div>
      </div>

      {/* 고객 추가 모달 */}
      <AnimatePresence>
        {isAddOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm"
              onClick={() => setIsAddOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 40 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 40 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white rounded-[32px] z-[70] shadow-2xl p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-extrabold text-zinc-900">고객 추가</h2>
                <button onClick={() => setIsAddOpen(false)} className="p-2 text-zinc-400 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAdd} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-1.5">이름 *</label>
                  <input
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    required
                    placeholder="홍길동"
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 font-bold text-zinc-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-1.5">전화번호 *</label>
                  <input
                    value={addPhone}
                    onChange={(e) => setAddPhone(e.target.value)}
                    required
                    placeholder="010-1234-5678"
                    type="tel"
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 font-bold text-zinc-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsAddOpen(false)} className="flex-1 py-4 bg-zinc-100 text-zinc-700 font-bold rounded-2xl hover:bg-zinc-200 transition-colors">
                    취소
                  </button>
                  <button type="submit" disabled={isAdding} className="flex-[2] py-4 bg-zinc-900 text-white font-bold rounded-2xl hover:bg-zinc-800 transition-all shadow-md disabled:opacity-50">
                    {isAdding ? '추가 중...' : '고객 추가'}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 홍보 메시지 발송 모달 */}
      <AnimatePresence>
        {isBroadcastOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm"
              onClick={() => setIsBroadcastOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 40 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 40 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white rounded-[32px] z-[70] shadow-2xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-extrabold text-zinc-900">카카오 홍보 메시지</h2>
                  <p className="text-sm text-zinc-500 mt-0.5">카카오 채널 친구 {kakaoFriends.length}명에게 발송됩니다.</p>
                </div>
                <button onClick={() => setIsBroadcastOpen(false)} className="p-2 text-zinc-400 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleBroadcast} className="space-y-4">
                <textarea
                  value={broadcastMsg}
                  onChange={(e) => setBroadcastMsg(e.target.value)}
                  required
                  rows={4}
                  placeholder="예) 이번 주말 특별 할인! 방문하시면 500P 추가 적립해드립니다."
                  className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm font-medium text-zinc-900 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 transition-all resize-none"
                />
                <div className="flex gap-3">
                  <button type="button" onClick={() => setIsBroadcastOpen(false)} className="flex-1 py-4 bg-zinc-100 text-zinc-700 font-bold rounded-2xl hover:bg-zinc-200 transition-colors">
                    취소
                  </button>
                  <button type="submit" disabled={isSending} className="flex-[2] py-4 bg-yellow-400 text-yellow-900 font-bold rounded-2xl hover:bg-yellow-500 transition-all shadow-md disabled:opacity-50">
                    {isSending ? '발송 중...' : `${kakaoFriends.length}명에게 발송`}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-zinc-400 font-bold">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-2">
          <span className="font-extrabold text-base">아직 등록된 고객이 없습니다</span>
          <span className="text-sm font-medium">위의 고객 추가 버튼으로 전화번호를 등록하세요.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {filtered.map(customer => (
            <div key={customer.id} className="bg-white rounded-3xl p-5 border border-zinc-200 shadow-[0_2px_10px_rgb(0,0,0,0.02)] flex flex-col hover:border-orange-300 transition-all relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-orange-500/5 to-transparent rounded-bl-full pointer-events-none" />
              <div className="flex justify-between items-start mb-5 relative z-10">
                <div className="flex items-center gap-3">
                  {customer.profileImage ? (
                    <img src={customer.profileImage} alt={customer.name} className="w-10 h-10 rounded-full object-cover border border-zinc-100" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 font-black text-sm">
                      {customer.name[0]}
                    </div>
                  )}
                  <div>
                    <h3 className="font-extrabold text-zinc-900 text-lg flex items-center gap-2 mb-0.5">
                      {customer.name}
                      {customer.visitCount >= 10 && <span className="bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-md shadow-sm">VIP</span>}
                      {customer.kakaoFriend && (
                        <span className="bg-yellow-400 text-yellow-900 text-[10px] px-2 py-0.5 rounded-md shadow-sm font-bold">카카오</span>
                      )}
                    </h3>
                    <p className="text-xs font-bold text-zinc-400">{customer.phone ?? '전화번호 없음'}</p>
                  </div>
                </div>
                <button
                  onClick={() => onEditCustomer(customer)}
                  className="text-zinc-400 hover:text-orange-600 bg-zinc-50 hover:bg-orange-50 p-2 rounded-xl transition-colors"
                >
                  <PenSquare className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mb-4 flex justify-between items-center relative z-10">
                <span className="text-orange-800 text-xs font-bold">보유 포인트</span>
                <div className="text-orange-600 font-black text-xl tracking-tight">
                  {customer.points.toLocaleString()} <span className="text-sm font-bold ml-0.5">P</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-auto relative z-10">
                <div className="bg-zinc-50 rounded-2xl p-3.5 border border-zinc-100">
                  <p className="text-[10px] font-bold text-zinc-400 mb-1">총 방문 횟수</p>
                  <p className="font-black text-zinc-800 text-sm">{customer.visitCount}회</p>
                </div>
                <div className="bg-zinc-50 rounded-2xl p-3.5 border border-zinc-100">
                  <p className="text-[10px] font-bold text-zinc-400 mb-1">최근 방문일</p>
                  <p className="font-black text-zinc-800 text-sm">
                    {customer.lastVisitedAt
                      ? new Date(customer.lastVisitedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
                      : '-'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
