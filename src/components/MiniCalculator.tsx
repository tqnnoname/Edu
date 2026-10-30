import React, { useState } from 'react';
import { X, Delete, Calculator as CalcIcon, RotateCcw } from 'lucide-react';

interface MiniCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MiniCalculator: React.FC<MiniCalculatorProps> = ({ isOpen, onClose }) => {
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');
  const [waitingForOperand, setWaitingForOperand] = useState(false);

  if (!isOpen) return null;

  const handleDigit = (digit: string) => {
    if (display === '0' || waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay(display + digit);
    }
  };

  const handleDecimal = () => {
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const handleOperator = (op: string) => {
    setEquation(`${display} ${op} `);
    setWaitingForOperand(true);
  };

  const handleClear = () => {
    setDisplay('0');
    setEquation('');
    setWaitingForOperand(false);
  };

  const handleBackspace = () => {
    if (display.length > 1) {
      setDisplay(display.slice(0, -1));
    } else {
      setDisplay('0');
    }
  };

  const handleScientific = (func: string) => {
    const val = parseFloat(display);
    if (isNaN(val)) return;

    let res = 0;
    let label = '';

    switch (func) {
      case 'sqrt':
        if (val < 0) {
          setDisplay('Lỗi căn số âm');
          setWaitingForOperand(true);
          return;
        }
        res = Math.sqrt(val);
        label = `√(${display})`;
        break;
      case 'cbrt':
        res = Math.cbrt(val);
        label = `∛(${display})`;
        break;
      case 'sqr':
        res = val * val;
        label = `sqr(${display})`;
        break;
      case 'cube':
        res = val * val * val;
        label = `cube(${display})`;
        break;
      case 'sin':
        res = Math.sin((val * Math.PI) / 180);
        label = `sin(${display}°)`;
        break;
      case 'cos':
        res = Math.cos((val * Math.PI) / 180);
        label = `cos(${display}°)`;
        break;
      case 'tan':
        res = Math.tan((val * Math.PI) / 180);
        label = `tan(${display}°)`;
        break;
      case 'log':
        if (val <= 0) {
          setDisplay('Lỗi log');
          setWaitingForOperand(true);
          return;
        }
        res = Math.log10(val);
        label = `log(${display})`;
        break;
      case 'ln':
        if (val <= 0) {
          setDisplay('Lỗi ln');
          setWaitingForOperand(true);
          return;
        }
        res = Math.log(val);
        label = `ln(${display})`;
        break;
      case 'inv':
        if (val === 0) {
          setDisplay('Không chia được cho 0');
          setWaitingForOperand(true);
          return;
        }
        res = 1 / val;
        label = `1/(${display})`;
        break;
      case 'pi':
        setDisplay(Number(Math.PI.toFixed(8)).toString());
        setWaitingForOperand(true);
        return;
      case 'e':
        setDisplay(Number(Math.E.toFixed(8)).toString());
        setWaitingForOperand(true);
        return;
      case 'neg':
        res = -val;
        break;
      default:
        return;
    }

    if (label) {
      setEquation(label + ' =');
    }
    setDisplay(Number(res.toFixed(8)).toString());
    setWaitingForOperand(true);
  };

  const handleCalculate = () => {
    try {
      const fullExpr = equation.endsWith('=') ? display : equation + display;
      // Sanitize equation to only allow safe arithmetic
      const sanitized = fullExpr.replace(/[^-()\d/*+.]/g, '');
      // Evaluate basic arithmetic
      // eslint-disable-next-line no-new-func
      const result = Function(`'use strict'; return (${sanitized})`)();
      setDisplay(Number(Number(result).toFixed(8)).toString());
      setEquation(fullExpr + ' =');
      setWaitingForOperand(true);
    } catch {
      setDisplay('Lỗi biểu thức');
      setWaitingForOperand(true);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 w-84 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden font-sans">
      {/* Title Bar */}
      <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalcIcon className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold tracking-wide uppercase">Máy tính thi cử (FX Mini Pro)</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-white rounded-md transition-colors cursor-pointer"
          title="Đóng máy tính"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Screen */}
      <div className="bg-slate-50 p-4 border-b border-slate-200 text-right">
        <div className="text-xs text-slate-400 h-5 font-mono overflow-hidden">
          {equation || '\u00A0'}
        </div>
        <div className="text-2xl font-bold font-mono tracking-tight text-slate-800 truncate">
          {display}
        </div>
      </div>

      {/* Scientific Keys Row with explicit Roots & Powers */}
      <div className="p-2 bg-slate-100 border-b border-slate-200 space-y-1">
        {/* Row 1: Radicals (Căn thức) & Powers (Lũy thừa) */}
        <div className="grid grid-cols-5 gap-1 text-xs">
          <button
            onClick={() => handleScientific('sqrt')}
            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 rounded font-bold transition-colors cursor-pointer flex items-center justify-center gap-0.5"
            title="Căn bậc 2 (√x)"
          >
            <span className="text-sm leading-none">√x</span>
          </button>
          <button
            onClick={() => handleScientific('cbrt')}
            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 rounded font-bold transition-colors cursor-pointer flex items-center justify-center gap-0.5"
            title="Căn bậc 3 (∛x)"
          >
            <span className="text-sm leading-none">∛x</span>
          </button>
          <button
            onClick={() => handleScientific('sqr')}
            className="p-1.5 bg-white hover:bg-slate-200 border border-slate-200 rounded font-semibold text-slate-700 transition-colors cursor-pointer"
            title="Bình phương (x²)"
          >
            x²
          </button>
          <button
            onClick={() => handleScientific('cube')}
            className="p-1.5 bg-white hover:bg-slate-200 border border-slate-200 rounded font-semibold text-slate-700 transition-colors cursor-pointer"
            title="Lập phương (x³)"
          >
            x³
          </button>
          <button
            onClick={() => handleScientific('inv')}
            className="p-1.5 bg-white hover:bg-slate-200 border border-slate-200 rounded font-semibold text-slate-700 transition-colors cursor-pointer"
            title="Nghịch đảo (1/x)"
          >
            1/x
          </button>
        </div>

        {/* Row 2: Trigonometry & Constants */}
        <div className="grid grid-cols-5 gap-1 text-xs">
          <button onClick={() => handleScientific('sin')} className="p-1.5 bg-white hover:bg-slate-200 border border-slate-200 rounded font-medium text-slate-700 cursor-pointer">sin</button>
          <button onClick={() => handleScientific('cos')} className="p-1.5 bg-white hover:bg-slate-200 border border-slate-200 rounded font-medium text-slate-700 cursor-pointer">cos</button>
          <button onClick={() => handleScientific('tan')} className="p-1.5 bg-white hover:bg-slate-200 border border-slate-200 rounded font-medium text-slate-700 cursor-pointer">tan</button>
          <button onClick={() => handleScientific('log')} className="p-1.5 bg-white hover:bg-slate-200 border border-slate-200 rounded font-medium text-slate-700 cursor-pointer">log</button>
          <button onClick={() => handleScientific('ln')} className="p-1.5 bg-white hover:bg-slate-200 border border-slate-200 rounded font-medium text-slate-700 cursor-pointer">ln</button>
        </div>

        {/* Row 3: Constants & Signs */}
        <div className="grid grid-cols-5 gap-1 text-xs">
          <button onClick={() => handleScientific('pi')} className="p-1.5 bg-white hover:bg-slate-200 border border-slate-200 rounded font-semibold text-slate-700 cursor-pointer">π</button>
          <button onClick={() => handleScientific('e')} className="p-1.5 bg-white hover:bg-slate-200 border border-slate-200 rounded font-semibold text-slate-700 cursor-pointer">e</button>
          <button onClick={() => handleScientific('neg')} className="p-1.5 bg-white hover:bg-slate-200 border border-slate-200 rounded font-semibold text-slate-700 cursor-pointer">±</button>
          <button onClick={() => handleOperator('(')} className="p-1.5 bg-white hover:bg-slate-200 border border-slate-200 rounded font-semibold text-slate-700 cursor-pointer">(</button>
          <button onClick={() => handleOperator(')')} className="p-1.5 bg-white hover:bg-slate-200 border border-slate-200 rounded font-semibold text-slate-700 cursor-pointer">)</button>
        </div>
      </div>

      {/* Main Keypad */}
      <div className="grid grid-cols-4 gap-1.5 p-3 bg-white">
        <button onClick={handleClear} className="p-2.5 bg-rose-50 text-rose-700 font-semibold rounded-lg hover:bg-rose-100 transition-colors cursor-pointer">AC</button>
        <button onClick={handleBackspace} className="p-2.5 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 transition-colors flex items-center justify-center cursor-pointer">
          <Delete className="w-4 h-4" />
        </button>
        <button onClick={() => handleOperator('/')} className="p-2.5 bg-slate-100 text-slate-800 font-semibold rounded-lg hover:bg-slate-200 transition-colors cursor-pointer">÷</button>
        <button onClick={() => handleOperator('*')} className="p-2.5 bg-slate-100 text-slate-800 font-semibold rounded-lg hover:bg-slate-200 transition-colors cursor-pointer">×</button>

        <button onClick={() => handleDigit('7')} className="p-3 bg-slate-50 text-slate-800 font-semibold rounded-lg hover:bg-slate-100 text-base cursor-pointer">7</button>
        <button onClick={() => handleDigit('8')} className="p-3 bg-slate-50 text-slate-800 font-semibold rounded-lg hover:bg-slate-100 text-base cursor-pointer">8</button>
        <button onClick={() => handleDigit('9')} className="p-3 bg-slate-50 text-slate-800 font-semibold rounded-lg hover:bg-slate-100 text-base cursor-pointer">9</button>
        <button onClick={() => handleOperator('-')} className="p-2.5 bg-slate-100 text-slate-800 font-semibold rounded-lg hover:bg-slate-200 transition-colors cursor-pointer">−</button>

        <button onClick={() => handleDigit('4')} className="p-3 bg-slate-50 text-slate-800 font-semibold rounded-lg hover:bg-slate-100 text-base cursor-pointer">4</button>
        <button onClick={() => handleDigit('5')} className="p-3 bg-slate-50 text-slate-800 font-semibold rounded-lg hover:bg-slate-100 text-base cursor-pointer">5</button>
        <button onClick={() => handleDigit('6')} className="p-3 bg-slate-50 text-slate-800 font-semibold rounded-lg hover:bg-slate-100 text-base cursor-pointer">6</button>
        <button onClick={() => handleOperator('+')} className="p-2.5 bg-slate-100 text-slate-800 font-semibold rounded-lg hover:bg-slate-200 transition-colors cursor-pointer">+</button>

        <button onClick={() => handleDigit('1')} className="p-3 bg-slate-50 text-slate-800 font-semibold rounded-lg hover:bg-slate-100 text-base cursor-pointer">1</button>
        <button onClick={() => handleDigit('2')} className="p-3 bg-slate-50 text-slate-800 font-semibold rounded-lg hover:bg-slate-100 text-base cursor-pointer">2</button>
        <button onClick={() => handleDigit('3')} className="p-3 bg-slate-50 text-slate-800 font-semibold rounded-lg hover:bg-slate-100 text-base cursor-pointer">3</button>
        <button onClick={handleCalculate} className="row-span-2 p-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center text-lg shadow-sm cursor-pointer">
          =
        </button>

        <button onClick={() => handleDigit('0')} className="col-span-2 p-3 bg-slate-50 text-slate-800 font-semibold rounded-lg hover:bg-slate-100 text-base cursor-pointer">0</button>
        <button onClick={handleDecimal} className="p-3 bg-slate-50 text-slate-800 font-semibold rounded-lg hover:bg-slate-100 text-base cursor-pointer">.</button>
      </div>
    </div>
  );
};
