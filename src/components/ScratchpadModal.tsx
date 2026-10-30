import React, { useState } from 'react';
import { X, Trash2, Copy, Check, Sparkles } from 'lucide-react';

interface ScratchpadProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ScratchpadModal: React.FC<ScratchpadProps> = ({ isOpen, onClose }) => {
  const [note, setNote] = useState(() => {
    return localStorage.getItem('edutest_scratchpad_notes') || '';
  });
  const [copied, setCopied] = useState(false);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNote(val);
    localStorage.setItem('edutest_scratchpad_notes', val);
  };

  const handleInsertMath = (text: string) => {
    const updated = note + (note && !note.endsWith(' ') ? ' ' : '') + text;
    setNote(updated);
    localStorage.setItem('edutest_scratchpad_notes', updated);
  };

  const handleClear = () => {
    if (!isConfirmingClear) {
      setIsConfirmingClear(true);
      setTimeout(() => setIsConfirmingClear(false), 3000);
      return;
    }
    setNote('');
    localStorage.removeItem('edutest_scratchpad_notes');
    setIsConfirmingClear(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(note);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const quickMathSymbols = [
    { label: '√x', text: '√(', title: 'Căn bậc hai' },
    { label: '∛x', text: '∛(', title: 'Căn bậc ba' },
    { label: 'ⁿ√', text: 'ⁿ√(', title: 'Căn bậc n' },
    { label: 'u⃗', text: '\\vec{u}', title: 'Vectơ u (mũi tên phải trên chữ)' },
    { label: 'AB→', text: '\\overrightarrow{AB}', title: 'Vectơ đoạn thẳng AB' },
    { label: 'x²', text: '²', title: 'Bình phương' },
    { label: 'x³', text: '³', title: 'Lập phương' },
    { label: 'π', text: 'π', title: 'Số Pi' },
    { label: 'Δ', text: 'Δ', title: 'Delta' },
    { label: '±', text: '±', title: 'Cộng trừ' },
    { label: '≠', text: '≠', title: 'Khác' },
    { label: '≤', text: '≤', title: 'Nhỏ hơn hoặc bằng' },
    { label: '≥', text: '≥', title: 'Lớn hơn hoặc bằng' },
    { label: '∞', text: '∞', title: 'Vô cực' },
    { label: '∫', text: '∫', title: 'Tích phân' },
  ];

  return (
    <div className="fixed bottom-6 left-6 z-50 w-96 max-w-[calc(100vw-3rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden font-sans">
      <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          <span className="text-xs font-semibold tracking-wide uppercase">Bảng nháp bài thi (Scratchpad)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopy}
            className="p-1 text-slate-400 hover:text-white rounded transition-colors text-xs flex items-center gap-1 cursor-pointer"
            title="Sao chép nội dung"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleClear}
            className={`px-2 py-1 text-xs rounded transition-all cursor-pointer flex items-center gap-1 ${
              isConfirmingClear
                ? 'bg-rose-600 text-white font-bold animate-pulse'
                : 'text-slate-400 hover:text-rose-400 hover:bg-slate-800'
            }`}
            title={isConfirmingClear ? 'Nhấn lần nữa để xóa sạch' : 'Xóa toàn bộ nháp'}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {isConfirmingClear && <span>Xác nhận xóa?</span>}
          </button>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick math symbol bar with roots */}
      <div className="bg-amber-100/60 border-b border-amber-200/80 px-3 py-1.5 flex items-center gap-1 overflow-x-auto text-xs">
        <span className="text-[10px] font-bold text-amber-900 shrink-0 mr-1 flex items-center gap-0.5">
          <Sparkles className="w-3 h-3 text-amber-600" />
          <span>Chèn nhanh:</span>
        </span>
        {quickMathSymbols.map((item, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleInsertMath(item.text)}
            className={`px-1.5 py-0.5 rounded text-xs font-mono font-semibold transition-colors cursor-pointer shrink-0 ${
              item.label.includes('√')
                ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs'
                : 'bg-white hover:bg-amber-200 text-slate-800 border border-amber-300'
            }`}
            title={item.title}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="p-3 bg-amber-50/40">
        <textarea
          value={note}
          onChange={handleChange}
          placeholder="Viết nháp công thức, lập luận hoặc tính toán tạm thời tại đây... Nhấp nút chèn căn (√x, ∛x) phía trên để nhập nhanh."
          rows={9}
          className="w-full p-2.5 text-sm font-mono text-slate-800 bg-white border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none placeholder:text-slate-400"
        />
        <div className="flex justify-between items-center mt-2 text-xs text-slate-500">
          <span>{note.length} ký tự</span>
          <span className="text-amber-800 font-medium">Tự động lưu vào bộ nhớ máy</span>
        </div>
      </div>
    </div>
  );
};
