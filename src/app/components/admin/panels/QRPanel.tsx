'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Plus, Printer, Download, Link2, Pencil, Trash2, Check, X, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import type { UITable } from '../types';

interface QRPanelProps {
  tables: UITable[];
  storeSlug: string;
  onAddTable: () => Promise<void>;
  onRenameTable: (realId: string, name: string) => Promise<void>;
  onDeleteTable: (realId: string) => Promise<void>;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getMenuUrl(storeSlug: string, qrToken: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/m/${storeSlug}/${qrToken}`;
}

interface QRCardProps {
  table: UITable;
  storeSlug: string;
  onRename: (realId: string, name: string) => Promise<void>;
  onDelete: (realId: string) => Promise<void>;
}

function QRCard({ table, storeSlug, onRename, onDelete }: QRCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const url = getMenuUrl(storeSlug, table.qrToken);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(table.name || `테이블 ${table.id}`);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // table이 바뀌면 편집/삭제 상태 초기화
  useEffect(() => {
    setIsEditing(false);
    setShowDeleteConfirm(false);
    setEditName(table.name || `테이블 ${table.id}`);
  }, [table.id, table.name]);

  useEffect(() => {
    if (!canvasRef.current || !table.qrToken) return;
    QRCode.toCanvas(canvasRef.current, url, {
      width: 200,
      margin: 2,
      color: { dark: '#18181b', light: '#ffffff' },
    }).catch(() => {});
  }, [url, table.qrToken]);

  const handleDownload = useCallback(() => {
    QRCode.toDataURL(url, { width: 400, margin: 2 }).then((dataUrl) => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `table-${table.id}-qr.png`;
      a.click();
      toast.success(`테이블 ${table.id} QR 다운로드 완료`);
    }).catch(() => toast.error('QR 다운로드 실패'));
  }, [url, table.id]);

  const handlePrint = useCallback(() => {
    const displayName = table.name || `테이블 ${table.id}`;
    QRCode.toDataURL(url, { width: 400, margin: 2 }).then((dataUrl) => {
      const el = document.createElement('div');
      el.id = '__qr_print__';
      el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;font-family:sans-serif"><h1 style="font-size:28px;margin:0 0 8px">${escapeHtml(displayName)}</h1><p style="color:#666;font-size:12px;margin:0 0 24px;word-break:break-all">${escapeHtml(url)}</p><img src="${dataUrl}" style="width:300px;height:300px" /></div>`;
      const style = document.createElement('style');
      style.id = '__qr_print_style__';
      style.textContent = '@media print{body>*:not(#__qr_print__){display:none!important}#__qr_print__{display:block!important}}';
      document.body.appendChild(el);
      document.head.appendChild(style);
      const cleanup = () => {
        el.remove(); style.remove();
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
      setTimeout(() => window.print(), 50);
    }).catch(() => toast.error('QR 인쇄 실패'));
  }, [url, table.id, table.name]);

  const handleSaveName = async () => {
    const trimmed = editName.trim();
    if (!trimmed) {
      toast.error('테이블 이름을 입력하세요.');
      return;
    }
    await onRename(table._realId, trimmed);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditName(table.name || `테이블 ${table.id}`);
    setIsEditing(false);
  };

  const handleConfirmDelete = async () => {
    await onDelete(table._realId);
    setShowDeleteConfirm(false);
  };

  const displayName = table.name || `테이블 ${table.id}`;

  return (
    <div className="relative bg-white rounded-2xl md:rounded-3xl border border-zinc-200 p-4 md:p-6 shadow-sm flex flex-col items-center text-center hover:border-orange-500 transition-colors group">
      {/* Delete confirm overlay */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-10 bg-white/95 rounded-2xl md:rounded-3xl flex flex-col items-center justify-center gap-3 p-4">
          <p className="text-sm font-bold text-zinc-900">이 테이블을 삭제하시겠습니까?</p>
          <p className="text-xs text-zinc-500">삭제 후 복구할 수 없습니다.</p>
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-4 py-2 bg-zinc-100 text-zinc-700 rounded-xl text-xs font-bold hover:bg-zinc-200 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleConfirmDelete}
              className="px-4 py-2 bg-red-500 text-white rounded-xl text-xs font-bold hover:bg-red-600 transition-colors"
            >
              삭제
            </button>
          </div>
        </div>
      )}

      {/* Top-right action buttons */}
      <div className="absolute top-2 right-2 flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => {
            setEditName(table.name || `테이블 ${table.id}`);
            setIsEditing(true);
          }}
          className="p-1.5 rounded-lg bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 transition-colors"
          title="이름 변경"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="p-1.5 rounded-lg bg-zinc-100 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          title="테이블 삭제"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Table name */}
      {isEditing ? (
        <div className="flex items-center gap-1 mb-1 w-full">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveName();
              if (e.key === 'Escape') handleCancelEdit();
            }}
            autoFocus
            className="flex-1 min-w-0 text-center font-black text-lg md:text-xl text-zinc-900 border-b-2 border-orange-500 bg-transparent outline-none px-1"
          />
          <button onClick={handleSaveName} className="p-1 text-green-600 hover:text-green-700">
            <Check className="w-4 h-4" />
          </button>
          <button onClick={handleCancelEdit} className="p-1 text-zinc-400 hover:text-zinc-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <h3 className="font-black text-lg md:text-xl text-zinc-900 mb-1">{displayName}</h3>
      )}

      <p className="text-[10px] md:text-xs font-medium text-zinc-400 mb-4 md:mb-6 flex items-center gap-1">
        <Link2 className="w-3 h-3" /> .../m/{storeSlug}/{table.qrToken?.slice(0, 8)}...
      </p>

      <div className="w-28 h-28 md:w-36 md:h-36 mb-4 md:mb-6 flex items-center justify-center">
        <canvas ref={canvasRef} className="rounded-xl" />
      </div>

      <div className="w-full grid grid-cols-2 gap-2">
        <button onClick={handleDownload} aria-label="QR 저장" className="flex items-center justify-center gap-1.5 py-2 bg-zinc-100 text-zinc-700 rounded-xl text-xs md:text-sm font-bold hover:bg-zinc-200 transition-colors">
          <Download className="w-3.5 h-3.5" /> <span className="hidden md:inline">저장</span>
        </button>
        <button onClick={handlePrint} aria-label="QR 인쇄" className="flex items-center justify-center gap-1.5 py-2 bg-orange-50 text-orange-600 rounded-xl text-xs md:text-sm font-bold hover:bg-orange-100 transition-colors">
          <Printer className="w-3.5 h-3.5" /> <span className="hidden md:inline">인쇄</span>
        </button>
      </div>
    </div>
  );
}

function WaitingQRCard({ storeSlug }: { storeSlug: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const url = typeof window !== 'undefined'
    ? `${window.location.origin}/waiting/${storeSlug}`
    : `/waiting/${storeSlug}`;

  useEffect(() => {
    if (!canvasRef.current || !storeSlug) return;
    QRCode.toCanvas(canvasRef.current, url, {
      width: 200, margin: 2,
      color: { dark: '#18181b', light: '#ffffff' },
    }).catch(() => {});
  }, [url, storeSlug]);

  const handleDownload = useCallback(() => {
    QRCode.toDataURL(url, { width: 400, margin: 2 }).then((dataUrl) => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `waiting-${storeSlug}-qr.png`;
      a.click();
      toast.success('웨이팅 QR 다운로드 완료');
    }).catch(() => toast.error('QR 다운로드 실패'));
  }, [url, storeSlug]);

  const handlePrint = useCallback(() => {
    QRCode.toDataURL(url, { width: 400, margin: 2 }).then((dataUrl) => {
      const el = document.createElement('div');
      el.id = '__qr_print__';
      el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;font-family:sans-serif"><h1 style="font-size:28px;margin:0 0 8px">대기 접수</h1><p style="color:#666;font-size:14px;margin:0 0 24px">${escapeHtml(storeSlug)}</p><img src="${dataUrl}" style="width:300px;height:300px" /><p style="color:#888;font-size:11px;margin-top:16px;word-break:break-all">${escapeHtml(url)}</p></div>`;
      const style = document.createElement('style');
      style.id = '__qr_print_style__';
      style.textContent = '@media print{body>*:not(#__qr_print__){display:none!important}#__qr_print__{display:block!important}}';
      document.body.appendChild(el);
      document.head.appendChild(style);
      const cleanup = () => { el.remove(); style.remove(); window.removeEventListener('afterprint', cleanup); };
      window.addEventListener('afterprint', cleanup);
      setTimeout(() => window.print(), 50);
    }).catch(() => toast.error('QR 인쇄 실패'));
  }, [url, storeSlug]);

  return (
    <div className="border-t border-zinc-200 pt-6 mt-2">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-orange-500" />
        <h3 className="text-lg font-extrabold text-zinc-900">웨이팅 접수 QR</h3>
        <span className="text-xs font-bold text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full">매장 입구에 부착</span>
      </div>
      <div className="flex items-center gap-6 bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm w-fit">
        <div className="w-28 h-28 md:w-36 md:h-36 bg-white rounded-xl border border-zinc-100 flex items-center justify-center shrink-0">
          <canvas ref={canvasRef} className="rounded-xl" style={{ imageRendering: 'pixelated' }} />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-bold text-zinc-900">고객이 스캔하면 대기 등록</p>
          <p className="text-xs text-zinc-400 font-medium break-all max-w-[200px]">/waiting/{storeSlug}</p>
          <div className="flex gap-2 pt-1">
            <button onClick={handleDownload} aria-label="웨이팅 QR 저장" className="flex items-center gap-1.5 px-3 py-2 bg-zinc-100 text-zinc-700 rounded-xl text-xs font-bold hover:bg-zinc-200 transition-colors">
              <Download className="w-3.5 h-3.5" /> 저장
            </button>
            <button onClick={handlePrint} aria-label="웨이팅 QR 인쇄" className="flex items-center gap-1.5 px-3 py-2 bg-orange-50 text-orange-600 rounded-xl text-xs font-bold hover:bg-orange-100 transition-colors">
              <Printer className="w-3.5 h-3.5" /> 인쇄
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QRPanel({ tables, storeSlug, onAddTable, onRenameTable, onDeleteTable }: QRPanelProps) {
  const handlePrintAll = useCallback(async () => {
    const waitingUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/waiting/${storeSlug}`
      : `/waiting/${storeSlug}`;

    const qrImages = await Promise.all([
      ...tables.map(async (t) => {
        const u = getMenuUrl(storeSlug, t.qrToken);
        const dataUrl = await QRCode.toDataURL(u, { width: 400, margin: 2 });
        const displayName = t.name || `테이블 ${t.id}`;
        return { displayName, url: u, dataUrl, accent: '#18181b' };
      }),
      (async () => ({
        displayName: '대기 접수',
        url: waitingUrl,
        dataUrl: await QRCode.toDataURL(waitingUrl, { width: 400, margin: 2 }),
        accent: '#f97316',
      }))(),
    ]);

    const el = document.createElement('div');
    el.id = '__qr_print_all__';
    el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:20px;padding:24px;font-family:sans-serif">${
      qrImages.map(q => `<div style="display:flex;flex-direction:column;align-items:center;border:1px solid #e4e4e7;border-radius:16px;padding:20px;break-inside:avoid"><h2 style="font-size:20px;margin:0 0 4px;color:${q.accent}">${escapeHtml(q.displayName)}</h2><p style="font-size:11px;color:#666;margin:0 0 12px;word-break:break-all;text-align:center">${escapeHtml(q.url)}</p><img src="${q.dataUrl}" style="width:200px;height:200px" /></div>`).join('')
    }</div>`;
    const style = document.createElement('style');
    style.id = '__qr_print_all_style__';
    style.textContent = '@media print{body>*:not(#__qr_print_all__){display:none!important}#__qr_print_all__{display:block!important}}';
    document.body.appendChild(el);
    document.head.appendChild(style);
    const cleanup = () => {
      el.remove(); style.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => window.print(), 50);
  }, [tables, storeSlug]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-zinc-900">고정 QR 코드 관리</h2>
          <p className="text-xs md:text-sm text-zinc-500 mt-0.5 md:mt-1">테이블별 고유 QR 코드를 생성하고 출력하여 부착하세요.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrintAll} className="flex-1 md:flex-none bg-white border border-zinc-200 text-zinc-700 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-zinc-50 transition-colors shadow-sm flex items-center justify-center gap-2">
            <Printer className="w-4 h-4" /> 전체 인쇄
          </button>
          <button onClick={onAddTable} className="flex-1 md:flex-none bg-zinc-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-zinc-800 transition-colors shadow-sm flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> 테이블 추가
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-6">
        {tables.map(table => (
          <QRCard
            key={table.id}
            table={table}
            storeSlug={storeSlug}
            onRename={onRenameTable}
            onDelete={onDeleteTable}
          />
        ))}
      </div>

      {/* 웨이팅 접수 QR */}
      <WaitingQRCard storeSlug={storeSlug} />
    </motion.div>
  );
}
