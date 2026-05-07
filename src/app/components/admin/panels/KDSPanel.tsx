'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Clock, Users, Check, Trash2, CheckCircle2, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';
import type { UIOrder, UITable } from '../types';

interface KDSPanelProps {
  orders: UIOrder[];
  tables: UITable[];
  updateOrderStatus: (id: string, newStatus: string) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  updateOrderPax: (id: string, pax: number) => void;
  fullscreenHref?: string;
}

export default function KDSPanel({
  orders,
  updateOrderStatus,
  deleteOrder,
  updateOrderPax,
  fullscreenHref = '/admin/kds',
}: KDSPanelProps) {
  const pendingOrders = orders.filter(o => o.status === 'pending');
  const preparingOrders = orders.filter(o => o.status === 'preparing');
  const completedOrders = orders.filter(o => o.status === 'completed');
  const servedOrders = orders.filter(o => o.status === 'served');

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'pending' | 'preparing' | 'completed' | 'served'>('pending');

  const handleDeleteConfirm = () => {
    if (deleteTargetId) {
      deleteOrder(deleteTargetId);
      setDeleteTargetId(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="h-full flex flex-col md:overflow-hidden pb-20 md:pb-0">
      <div className="flex items-center justify-between mb-4 md:mb-6 shrink-0">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-zinc-900">주방 KDS</h2>
          <p className="text-xs md:text-sm text-zinc-600 mt-0.5 md:mt-1">주방 작업에 최적화된 큰 글씨와 고대비 UI입니다.</p>
        </div>
        <Link
          href={fullscreenHref}
          target="_blank"
          className="flex items-center gap-1.5 bg-zinc-900 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-zinc-800 transition-colors shadow-sm"
        >
          <Maximize2 className="w-4 h-4" /> 전체화면
        </Link>
      </div>

      {/* 모바일 탭 전환 */}
      <div className="flex md:hidden gap-1 mb-4 p-1 bg-white rounded-2xl border border-zinc-200 shadow-sm shrink-0">
        {([['pending', '신규', pendingOrders.length, 'text-red-500'], ['preparing', '조리중', preparingOrders.length, 'text-orange-500'], ['completed', '서빙대기', completedOrders.length, 'text-green-500'], ['served', '완료', servedOrders.length, 'text-zinc-400']] as const).map(([tab, label, count, color]) => (
          <button key={tab} onClick={() => setMobileTab(tab)} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${mobileTab === tab ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500'}`}>
            {label}
            {count > 0 && <span className={`font-black text-xs ${color}`}>{count}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 md:overflow-hidden pb-4 overflow-y-auto">
        {/* Column 1: Pending */}
        <div className={`${mobileTab === 'pending' ? 'flex' : 'hidden'} md:flex flex-col bg-white rounded-3xl p-4 md:overflow-hidden border border-zinc-200 shadow-[0_10px_30px_rgba(15,23,42,0.16)] min-h-[300px] md:min-h-0 shrink-0`}>
          <div className="flex justify-between items-center mb-4 px-2 shrink-0">
            <h3 className="font-black text-lg text-zinc-800 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> 신규 주문
            </h3>
            <span className="bg-white text-red-600 font-black text-sm px-3 py-1 rounded-xl shadow-sm border border-red-100">{pendingOrders.length}건</span>
          </div>
          <div className="flex-1 md:overflow-y-auto space-y-4 pr-1 scrollbar-hide">
            <AnimatePresence>
              {pendingOrders.map(order => (
                <motion.div data-testid="kds-order-card" layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} key={order.id} className="bg-white rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.04)] border border-red-100 overflow-hidden flex flex-col relative">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-red-500" />
                  <div className="p-5 border-b-2 border-dashed border-zinc-100">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-black text-xl border border-red-100">
                          T{order.table}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-zinc-400">주문번호</p>
                          <p className="text-sm font-black text-zinc-800">#{order.id.slice(0, 8)}</p>
                          <div className="flex items-center gap-1 mt-1">
                            <Users className="w-3.5 h-3.5 text-zinc-400" />
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={order.pax || 0}
                              onChange={(e) => updateOrderPax(order.id, parseInt(e.target.value) || 0)}
                              className="w-12 text-xs font-bold text-zinc-700 bg-zinc-100 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-red-400"
                            />
                            <span className="text-xs font-medium text-zinc-500">명</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <p className="text-sm font-black text-red-600 bg-red-50 px-2.5 py-1 rounded-lg flex items-center gap-1.5"><Clock className="w-3.5 h-3.5"/> {order.time}분 전</p>
                        <button onClick={() => setDeleteTargetId(order.id)} className="text-zinc-400 hover:text-red-500 transition-colors p-1 mt-1" title="주문 삭제">
                            <Trash2 className="w-4 h-4" />
                          </button>
                      </div>
                    </div>
                    <ul className="space-y-4">
                      {order.items.map((item, idx) => (
                        <li key={idx} className="flex gap-4 items-start">
                          <span className="font-black text-xl text-red-500 w-6 text-center">{item.qty}</span>
                          <div>
                            <p className="font-black text-lg text-zinc-900 leading-tight">{item.name}</p>
                            {item.option && <p className="text-sm font-bold text-zinc-500 mt-1">✓ {item.option}</p>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-3 bg-white/80 border-t border-zinc-100/80">
                    <button data-testid="order-action-start" onClick={() => updateOrderStatus(order.id, 'preparing')} className="w-full py-4 bg-zinc-900 text-white font-black text-lg rounded-xl hover:bg-zinc-800 transition-colors shadow-lg active:scale-[0.98]">
                      조리 시작
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {pendingOrders.length === 0 && <div className="text-center py-10 text-zinc-400 text-sm font-bold">신규 주문이 없습니다</div>}
          </div>
        </div>

        {/* Column 2: Preparing */}
        <div className={`${mobileTab === 'preparing' ? 'flex' : 'hidden'} md:flex flex-col bg-white rounded-3xl p-4 md:overflow-hidden border border-zinc-200 shadow-[0_10px_30px_rgba(15,23,42,0.16)] min-h-[300px] md:min-h-0 shrink-0`}>
          <div className="flex justify-between items-center mb-4 px-2 shrink-0">
            <h3 className="font-black text-lg text-zinc-800 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-500"></span> 조리중
            </h3>
            <span className="bg-white text-orange-600 font-black text-sm px-3 py-1 rounded-xl shadow-sm border border-orange-100">{preparingOrders.length}건</span>
          </div>
          <div className="flex-1 md:overflow-y-auto space-y-4 pr-1 scrollbar-hide">
            <AnimatePresence>
              {preparingOrders.map(order => {
                const isUrgent = order.time > 10;
                return (
                  <motion.div data-testid="kds-order-card" layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} key={order.id} className="bg-white rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.04)] border border-orange-100 overflow-hidden flex flex-col relative">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-orange-500" />
                    <div className="p-5 border-b-2 border-dashed border-zinc-100">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-black text-xl border border-orange-100">
                            T{order.table}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-zinc-400">주문번호</p>
                            <p className="text-sm font-black text-zinc-800">#{order.id.slice(0, 8)}</p>
                            <div className="flex items-center gap-1 mt-1">
                              <Users className="w-3.5 h-3.5 text-zinc-400" />
                              <input
                                type="number"
                                min="0"
                                value={order.pax || 0}
                                onChange={(e) => updateOrderPax(order.id, parseInt(e.target.value) || 0)}
                                className="w-12 text-xs font-bold text-zinc-700 bg-zinc-100 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-orange-400"
                              />
                              <span className="text-xs font-medium text-zinc-500">명</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <p className={`text-sm font-black px-2.5 py-1 rounded-lg flex items-center gap-1.5 ${isUrgent ? 'text-red-600 bg-red-50 animate-pulse' : 'text-orange-600 bg-orange-50'}`}>
                            <Clock className="w-3.5 h-3.5"/> {order.time}분 전
                          </p>
                          <button onClick={() => setDeleteTargetId(order.id)} className="text-zinc-400 hover:text-red-500 transition-colors p-1 mt-1" title="주문 삭제">
                              <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                      </div>
                      <ul className="space-y-4">
                        {order.items.map((item, idx) => (
                          <li key={idx} className="flex gap-4 items-start">
                            <span className="font-black text-xl text-orange-500 w-6 text-center">{item.qty}</span>
                            <div>
                              <p className="font-black text-lg text-zinc-900 leading-tight">{item.name}</p>
                              {item.option && <p className="text-sm font-bold text-zinc-500 mt-1">✓ {item.option}</p>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-3 bg-white/80 border-t border-zinc-100/80">
                      <button data-testid="order-action-complete" onClick={() => updateOrderStatus(order.id, 'completed')} className="w-full py-4 bg-orange-500 text-white font-black text-lg rounded-xl hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20 active:scale-[0.98] flex items-center justify-center gap-2">
                        <Check className="w-6 h-6" /> 조리 완료
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {preparingOrders.length === 0 && <div className="text-center py-10 text-zinc-400 text-sm font-bold">조리중인 메뉴가 없습니다</div>}
          </div>
        </div>

        {/* Column 3: Completed/Serving */}
        <div className={`${mobileTab === 'completed' ? 'flex' : 'hidden'} md:flex flex-col bg-white rounded-3xl p-4 md:overflow-hidden border border-zinc-200 shadow-[0_10px_30px_rgba(15,23,42,0.16)] min-h-[300px] md:min-h-0 shrink-0`}>
          <div className="flex justify-between items-center mb-4 px-2 shrink-0">
            <h3 className="font-black text-lg text-zinc-700 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span> 서빙 대기
            </h3>
            <span className="bg-white text-green-600 font-black text-sm px-3 py-1 rounded-xl shadow-sm border border-green-100">{completedOrders.length}건</span>
          </div>
          <div className="flex-1 md:overflow-y-auto space-y-4 pr-1 scrollbar-hide">
            <AnimatePresence>
              {completedOrders.map(order => (
                <motion.div data-testid="kds-order-card" layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} key={order.id} className="bg-white rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.04)] border border-green-100 overflow-hidden flex flex-col relative">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-green-500" />
                  <div className="p-5 border-b-2 border-dashed border-zinc-100">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-green-50 text-green-600 flex items-center justify-center font-black text-xl border border-green-100">
                          T{order.table}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-zinc-400">주문번호</p>
                          <p className="text-sm font-black text-zinc-800">#{order.id.slice(0, 8)}</p>
                          <div className="flex items-center gap-1 mt-1">
                            <Users className="w-3.5 h-3.5 text-zinc-400" />
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={order.pax || 0}
                              onChange={(e) => updateOrderPax(order.id, parseInt(e.target.value) || 0)}
                              className="w-12 text-xs font-bold text-zinc-700 bg-zinc-100 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-green-400"
                            />
                            <span className="text-xs font-medium text-zinc-500">명</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <p className="text-sm font-black text-green-600 bg-green-50 px-2.5 py-1 rounded-lg flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5"/> 서빙 대기</p>
                        <button onClick={() => setDeleteTargetId(order.id)} className="text-zinc-400 hover:text-red-500 transition-colors p-1 mt-1" title="주문 삭제">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <ul className="space-y-4">
                      {order.items.map((item, idx) => (
                        <li key={idx} className="flex gap-4 items-start">
                          <span className="font-black text-xl text-green-500 w-6 text-center">{item.qty}</span>
                          <div>
                            <p className="font-black text-lg text-zinc-900 leading-tight">{item.name}</p>
                            {item.option && <p className="text-sm font-bold text-zinc-500 mt-1">✓ {item.option}</p>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-3 bg-white/80 border-t border-zinc-100/80">
                    <button data-testid="order-action-served" onClick={() => updateOrderStatus(order.id, 'served')} className="w-full py-4 bg-green-500 text-white font-black text-lg rounded-xl hover:bg-green-600 transition-colors shadow-lg shadow-green-500/20 active:scale-[0.98] flex items-center justify-center gap-2">
                      <Check className="w-6 h-6" /> 서빙 완료
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {completedOrders.length === 0 && <div className="text-center py-10 text-zinc-400 text-sm font-bold">대기중인 서빙이 없습니다</div>}
          </div>
        </div>

        {/* Column 4: Served (History) */}
        <div className={`${mobileTab === 'served' ? 'flex' : 'hidden'} md:flex flex-col bg-white rounded-3xl p-4 md:overflow-hidden border border-zinc-200 shadow-[0_10px_30px_rgba(15,23,42,0.12)] min-h-[300px] md:min-h-0 shrink-0`}>
          <div className="flex justify-between items-center mb-4 px-2 shrink-0">
            <h3 className="font-black text-lg text-zinc-600 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-zinc-400"></span> 완료
            </h3>
            <span className="bg-white text-zinc-700 font-black text-sm px-3 py-1 rounded-xl shadow-sm border border-zinc-200">{servedOrders.length}건</span>
          </div>
          <div className="flex-1 md:overflow-y-auto space-y-3 pr-1 scrollbar-hide">
            <AnimatePresence>
              {servedOrders.map(order => (
                <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} key={order.id} className="bg-white rounded-2xl border border-zinc-100 overflow-hidden flex flex-col relative">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-zinc-300" />
                  <div className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-zinc-100 text-zinc-500 flex items-center justify-center font-black text-base border border-zinc-200">
                          T{order.table}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-zinc-400">주문번호</p>
                          <p className="text-sm font-black text-zinc-500">#{order.id.slice(0, 8)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-zinc-400">{order.time}분 전</p>
                        <button onClick={() => setDeleteTargetId(order.id)} className="text-zinc-300 hover:text-red-400 transition-colors p-1" title="주문 삭제">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <ul className="space-y-1">
                      {order.items.map((item, idx) => (
                        <li key={idx} className="flex gap-2 items-start text-zinc-400">
                          <span className="font-black text-sm w-4 text-center">{item.qty}</span>
                          <p className="text-sm font-bold leading-tight">{item.name}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {servedOrders.length === 0 && <div className="text-center py-10 text-zinc-300 text-sm font-bold">완료된 주문이 없습니다</div>}
          </div>
        </div>
      </div>

      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => { if (!open) setDeleteTargetId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>주문 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 주문을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-500 hover:bg-red-600 text-white">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
