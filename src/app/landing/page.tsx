'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Smartphone, MonitorPlay, ArrowRight, Utensils, BarChart3, Clock, Menu, X, Users, CheckCircle2, ChevronRight, Star, Phone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Home() {
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] bg-zinc-50 flex flex-col font-sans selection:bg-orange-500 selection:text-white">
      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-zinc-200 fixed w-full z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 md:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 md:w-8 md:h-8 bg-orange-600 rounded-lg flex items-center justify-center">
              <Utensils className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <span className="text-lg md:text-xl font-bold tracking-tight text-zinc-900">TableFlow</span>
          </div>

          {/* PC Nav */}
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-600">
            <div className="flex items-center gap-2 text-zinc-900 font-bold bg-zinc-100 px-4 py-2 rounded-full">
              <Phone className="w-4 h-4" /> 010-6866-7176
            </div>
            <button
              onClick={() => document.getElementById('contact-form')?.focus()}
              className="bg-zinc-900 text-white px-5 py-2.5 rounded-full hover:bg-zinc-800 transition-all font-bold"
            >
              도입 문의하기
            </button>
          </div>

          {/* Mobile Hamburger */}
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="md:hidden p-2 -mr-2 text-zinc-600 hover:bg-zinc-100 rounded-xl"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm md:hidden"
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-[80%] max-w-sm bg-white z-50 shadow-2xl flex flex-col md:hidden"
            >
              <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-100">
                <span className="font-bold text-zinc-900">메뉴</span>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 -mr-2 text-zinc-500 hover:bg-zinc-100 rounded-xl">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-4 flex flex-col gap-2">
                <div className="p-4 font-bold text-zinc-800 rounded-xl bg-zinc-50 flex items-center justify-center gap-2">
                  <Phone className="w-5 h-5 text-orange-600" /> 010-6866-7176
                </div>
              </div>
              <div className="mt-auto p-4 border-t border-zinc-100">
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setTimeout(() => document.getElementById('contact-form')?.focus(), 300);
                  }}
                  className="w-full bg-zinc-900 text-white py-4 rounded-xl font-bold hover:bg-zinc-800 transition-colors"
                >
                  도입 문의하기
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 pt-20 md:pt-32 pb-10 md:pb-20 relative overflow-hidden">
        {/* Background Decorative Elements */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full pointer-events-none -z-10">
          <div className="absolute -top-10 -left-10 w-64 h-64 md:w-96 md:h-96 bg-orange-300/30 rounded-full blur-[80px] opacity-60"></div>
          <div className="absolute top-40 right-0 w-72 h-72 md:w-[30rem] md:h-[30rem] bg-rose-300/30 rounded-full blur-[80px] opacity-60"></div>
        </div>

        <div className="max-w-7xl w-full flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-8 mb-16 md:mb-24 mt-4 md:mt-8 relative z-10">
          <div className="flex-1 text-center lg:text-left">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-1.5 md:gap-2 px-3 py-1.5 bg-white shadow-sm text-orange-600 rounded-full text-[11px] md:text-sm font-bold mb-5 md:mb-8 border border-orange-100/80">
              <span className="flex h-1.5 w-1.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-orange-500"></span>
              </span>
              스마트 매장의 완성, TableFlow V2
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-[32px] leading-[1.25] sm:text-5xl md:text-6xl xl:text-7xl font-black text-zinc-900 tracking-tight md:leading-[1.15] mb-5 md:mb-8 break-keep">
              가장 완벽한 <br className="hidden lg:block"/> 매장 관리 <br className="lg:hidden"/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-rose-500">TableFlow 하나로 끝</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-[13px] sm:text-base md:text-xl text-zinc-600 mb-8 md:mb-12 max-w-2xl mx-auto lg:mx-0 leading-relaxed break-keep font-medium">
              복잡한 포스기, 잦은 주문 실수, 비효율적인 웨이팅은 이제 그만. <br className="hidden md:block"/>
              테이블 주문부터 KDS, 매출 분석까지 100% 연동됩니다.
            </motion.p>

            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 md:gap-4 w-full md:w-auto">
              <button
                onClick={() => document.getElementById('contact-form')?.focus()}
                className="w-full sm:w-auto bg-zinc-900 text-white px-6 py-3.5 md:px-8 md:py-4 rounded-2xl font-black text-base md:text-lg hover:bg-zinc-800 shadow-xl shadow-zinc-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                도입 문의하기 <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
              </button>
              <div className="w-full sm:w-auto bg-white text-zinc-800 px-6 py-3.5 md:px-8 md:py-4 rounded-2xl font-bold text-base md:text-lg border border-zinc-200 shadow-sm flex items-center justify-center gap-2">
                <Phone className="w-5 h-5 text-orange-600" /> 010-6866-7176
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-6 md:p-8 border border-zinc-100"
          >
            <div className="mb-6">
              <h3 className="text-xl md:text-2xl font-black text-zinc-900 mb-2">도입 문의하기</h3>
              <p className="text-sm font-medium text-zinc-500">정보를 남겨주시면 담당자가 빠르게 연락드리겠습니다.</p>
            </div>

            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); alert('문의가 접수되었습니다.'); }}>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">매장명 (상호명)</label>
                <input id="contact-form" type="text" required placeholder="예: 맛있는 식당" className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-medium text-zinc-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all" />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">담당자 성함</label>
                <input type="text" required placeholder="홍길동" className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-medium text-zinc-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all" />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">연락처</label>
                <input type="tel" required placeholder="010-0000-0000" className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-medium text-zinc-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all" />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">문의 내용 (선택)</label>
                <textarea rows={3} placeholder="궁금하신 점을 남겨주세요." className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-medium text-zinc-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all resize-none"></textarea>
              </div>
              <button type="submit" className="w-full bg-orange-600 text-white py-4 rounded-xl font-black text-base shadow-lg shadow-orange-500/30 hover:bg-orange-700 active:scale-[0.98] transition-all mt-2">
                도입 문의 접수하기
              </button>
            </form>
          </motion.div>
        </div>

        {/* Product Images Showcase (Mobile Optimized) */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="w-full max-w-7xl mx-auto mb-16 md:mb-32 relative px-4 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
            {/* Dashboard Image */}
            <div className="aspect-[4/3] sm:aspect-[4/5] lg:aspect-[4/5] bg-zinc-100 rounded-[2rem] overflow-hidden relative shadow-lg group cursor-pointer" onClick={() => router.push('/admin')}>
              <img src="https://images.unsplash.com/photo-1742238621804-62e3b4947d62?w=800&q=80" alt="Admin POS Dashboard" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex flex-col justify-end p-6 lg:p-8">
                <span className="bg-blue-500 text-white text-[11px] lg:text-xs font-black px-2.5 py-1 rounded-md w-max mb-2.5 shadow-md">관리자 POS</span>
                <h3 className="text-white text-lg sm:text-xl lg:text-2xl font-black mb-1.5 lg:mb-2 leading-tight">실시간 통합 대시보드</h3>
                <p className="text-zinc-200 text-[13px] lg:text-sm font-medium">어디서든 매출, 주문, 테이블을 관리하세요.</p>
              </div>
            </div>

            {/* QR Order Image */}
            <div className="aspect-[4/3] sm:aspect-[4/5] lg:aspect-[4/5] bg-zinc-100 rounded-[2rem] overflow-hidden relative shadow-lg group cursor-pointer" onClick={() => router.push('/table/5')}>
              <img src="https://images.unsplash.com/photo-1566665812752-7c00cca1aa95?w=800&q=80" alt="Mobile QR Order" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex flex-col justify-end p-6 lg:p-8">
                <span className="bg-orange-500 text-white text-[11px] lg:text-xs font-black px-2.5 py-1 rounded-md w-max mb-2.5 shadow-md">고객 화면</span>
                <h3 className="text-white text-lg sm:text-xl lg:text-2xl font-black mb-1.5 lg:mb-2 leading-tight">QR 스마트 오더</h3>
                <p className="text-zinc-200 text-[13px] lg:text-sm font-medium">테이블에서 앱 설치 없이 바로 주문합니다.</p>
              </div>
            </div>

            {/* Waiting System Image */}
            <div className="aspect-[4/3] sm:aspect-[4/5] lg:aspect-[4/5] sm:col-span-2 md:col-span-1 bg-zinc-100 rounded-[2rem] overflow-hidden relative shadow-lg group cursor-pointer" onClick={() => router.push('/admin')}>
              <img src="https://images.unsplash.com/photo-1760594308373-3e9b009aeae8?w=800&q=80" alt="Waiting System" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex flex-col justify-end p-6 lg:p-8">
                <span className="bg-purple-500 text-white text-[11px] lg:text-xs font-black px-2.5 py-1 rounded-md w-max mb-2.5 shadow-md">POS 기능</span>
                <h3 className="text-white text-lg sm:text-xl lg:text-2xl font-black mb-1.5 lg:mb-2 leading-tight">스마트 대기/웨이팅</h3>
                <p className="text-zinc-200 text-[13px] lg:text-sm font-medium">매장 입구에서 대기 순번을 등록하고<br/>고객을 효율적으로 관리하세요.</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Demo Selection Cards (Tablet & Mobile Optimized) */}
        <div className="max-w-7xl w-full mx-auto mb-16 md:mb-24 px-4 sm:px-6">
          <div className="text-center mb-8 md:mb-12">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-black text-zinc-900 mb-2.5">직접 체험해보세요</h2>
            <p className="text-zinc-500 text-sm md:text-base font-medium">실제 동작하는 데모 화면을 기기별로 확인하실 수 있습니다.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
            <button
              onClick={() => router.push('/table/5')}
              className="group text-left bg-white p-5 lg:p-8 rounded-[1.5rem] md:rounded-3xl border border-zinc-200/80 shadow-sm hover:border-orange-500 hover:shadow-xl transition-all duration-300 flex flex-row md:flex-col items-center md:items-start gap-4 md:gap-0"
            >
              <div className="w-12 h-12 lg:w-14 lg:h-14 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center shrink-0 md:mb-5 lg:mb-6 group-hover:bg-orange-100 group-hover:scale-110 transition-transform">
                <Smartphone className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base sm:text-lg lg:text-xl font-black text-zinc-900 mb-1 md:mb-2 lg:mb-3">QR 스마트 주문</h3>
                <p className="hidden md:block text-zinc-500 text-[13px] lg:text-sm mb-6 lg:mb-8 leading-relaxed break-keep">
                  앱 설치 없이 테이블에서 바로 메뉴를 주문하는 모바일 화면입니다.
                </p>
                <div className="flex items-center text-orange-600 font-bold text-xs lg:text-sm group-hover:gap-1.5 transition-all">
                  모바일 데모 보기 <ArrowRight className="w-3.5 h-3.5 lg:w-4 lg:h-4 ml-1" />
                </div>
              </div>
            </button>

            <button
              onClick={() => router.push('/admin')}
              className="group text-left bg-white p-5 lg:p-8 rounded-[1.5rem] md:rounded-3xl border border-zinc-200/80 shadow-sm hover:border-blue-500 hover:shadow-xl transition-all duration-300 flex flex-row md:flex-col items-center md:items-start gap-4 md:gap-0"
            >
              <div className="w-12 h-12 lg:w-14 lg:h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0 md:mb-5 lg:mb-6 group-hover:bg-blue-100 group-hover:scale-110 transition-transform">
                <MonitorPlay className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base sm:text-lg lg:text-xl font-black text-zinc-900 mb-1 md:mb-2 lg:mb-3">관리자 통합 POS</h3>
                <p className="hidden md:block text-zinc-500 text-[13px] lg:text-sm mb-6 lg:mb-8 leading-relaxed break-keep">
                  매출 통계, 주방 KDS, 메뉴 관리, 홀 현황까지 통제하는 대시보드입니다.
                </p>
                <div className="flex items-center text-blue-600 font-bold text-xs lg:text-sm group-hover:gap-1.5 transition-all">
                  PC/패드 데모 보기 <ArrowRight className="w-3.5 h-3.5 lg:w-4 lg:h-4 ml-1" />
                </div>
              </div>
            </button>

            <button
              onClick={() => router.push('/admin')}
              className="group text-left bg-white p-5 lg:p-8 rounded-[1.5rem] md:rounded-3xl border border-zinc-200/80 shadow-sm hover:border-purple-500 hover:shadow-xl transition-all duration-300 flex flex-row md:flex-col items-center md:items-start gap-4 md:gap-0 sm:col-span-2 md:col-span-1"
            >
              <div className="w-12 h-12 lg:w-14 lg:h-14 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center shrink-0 md:mb-5 lg:mb-6 group-hover:bg-purple-100 group-hover:scale-110 transition-transform">
                <Users className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base sm:text-lg lg:text-xl font-black text-zinc-900 mb-1 md:mb-2 lg:mb-3">대기/웨이팅 시스템</h3>
                <p className="hidden md:block text-zinc-500 text-[13px] lg:text-sm mb-6 lg:mb-8 leading-relaxed break-keep">
                  매장 입구에서 대기 순번을 등록하고 고객을 효율적으로 관리하는 시스템입니다.
                </p>
                <div className="flex items-center text-purple-600 font-bold text-xs lg:text-sm group-hover:gap-1.5 transition-all">
                  관리자 POS에서 확인 <ArrowRight className="w-3.5 h-3.5 lg:w-4 lg:h-4 ml-1" />
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Feature Highlights (Tablet & Mobile Optimized) */}
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6">
          <div className="bg-zinc-900 rounded-[2rem] lg:rounded-[3rem] py-12 lg:py-20 px-6 sm:px-10 text-white text-center shadow-xl">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black mb-10 lg:mb-16 tracking-tight">매장 운영의 패러다임이 바뀝니다</h2>
            <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
              <div className="flex flex-col items-center">
                <div className="w-14 h-14 lg:w-16 lg:h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mb-4 lg:mb-6 text-orange-400">
                  <Clock className="w-7 h-7 lg:w-8 lg:h-8" />
                </div>
                <h4 className="text-lg lg:text-xl font-black mb-2 lg:mb-3">인건비 절감 & 회전율 UP</h4>
                <p className="text-zinc-400 text-[13px] lg:text-base break-keep leading-relaxed font-medium">홀 직원의 주문 동선이 사라져 최소 인력으로도 피크타임 운영이 가능해집니다.</p>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-14 h-14 lg:w-16 lg:h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mb-4 lg:mb-6 text-orange-400">
                  <Utensils className="w-7 h-7 lg:w-8 lg:h-8" />
                </div>
                <h4 className="text-lg lg:text-xl font-black mb-2 lg:mb-3">주문 오류 0% 달성</h4>
                <p className="text-zinc-400 text-[13px] lg:text-base break-keep leading-relaxed font-medium">고객이 직접 선택한 옵션이 주방 KDS로 정확하게 전달되어 클레임을 원천 차단합니다.</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-zinc-200 py-6 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <span>© 2026 TableFlow. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-zinc-900 transition-colors">개인정보처리방침</Link>
            <span className="text-zinc-300">|</span>
            <Link href="/terms" className="hover:text-zinc-900 transition-colors">이용약관</Link>
          </div>
        </div>
      </footer>

      {/* Mobile Sticky Bottom CTA */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-zinc-200 z-40 pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.08)]">
        <button
          onClick={() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(() => document.getElementById('contact-form')?.focus(), 500);
          }}
          className="w-full bg-orange-600 text-white py-4 rounded-2xl font-black text-base shadow-lg shadow-orange-500/30 active:scale-[0.98] transition-transform"
        >
          도입 문의하기
        </button>
      </div>
    </div>
  );
}
