import React, { useState } from 'react';
import { Exam, Question, QuestionType, SubjectType, TrueFalseItem, ExamVisibility, ExamStatus } from '../types/exam';
import { 
  Plus, 
  Trash2, 
  Save, 
  FileText, 
  Code, 
  Download, 
  Upload, 
  AlertCircle, 
  CheckCircle2, 
  ArrowLeft,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Shuffle,
  BookOpen,
  HelpCircle,
  Globe,
  Lock,
  Layers,
  Calendar,
  ShieldAlert,
  X
} from 'lucide-react';
import { MathToolbar } from './MathToolbar';
import { RichContentRenderer } from './RichContentRenderer';

interface CustomExamCreatorProps {
  initialExam?: Exam | null;
  onSave: (exam: Exam) => void;
  onCancel: () => void;
}

export const CustomExamCreator: React.FC<CustomExamCreatorProps> = ({
  initialExam,
  onSave,
  onCancel,
}) => {
  const isEditing = Boolean(initialExam);
  const [title, setTitle] = useState(initialExam?.title || '');
  const [subject, setSubject] = useState<SubjectType>(initialExam?.subject || 'math');
  const [grade, setGrade] = useState(initialExam?.grade || 'Lớp 12 / THPT Quốc Gia');
  const [durationMinutes, setDurationMinutes] = useState(initialExam?.durationMinutes || 45);
  const [description, setDescription] = useState(initialExam?.description || '');
  const [instructions, setInstructions] = useState(
    initialExam?.instructions ||
    'Thí sinh đọc kỹ đề bài trước khi làm. Được sử dụng máy tính bỏ túi và bảng nháp. Đối với câu trắc nghiệm Đúng/Sai, mỗi ý đúng được tính điểm riêng.'
  );
  const [shuffleQuestions, setShuffleQuestions] = useState(
    Boolean(initialExam?.settings?.shuffleQuestions)
  );
  const [shuffleOptions, setShuffleOptions] = useState(
    Boolean(initialExam?.settings?.shuffleOptions)
  );

  // New features: Visibility, Status, Scheduling, Limits
  const [visibility, setVisibility] = useState<ExamVisibility>(initialExam?.visibility || 'public');
  const [status, setStatus] = useState<ExamStatus>(initialExam?.status || 'open');
  const [openTime, setOpenTime] = useState(initialExam?.openTime || '');
  const [closeTime, setCloseTime] = useState(initialExam?.closeTime || '');
  const [maxAttempts, setMaxAttempts] = useState<number>(initialExam?.maxAttempts ?? 0);
  const [maxTabSwitches, setMaxTabSwitches] = useState<number>(initialExam?.maxTabSwitches ?? 0);

  // Active option image editor toggle (which question index & option index is open for image editing)
  const [activeOptImgEdit, setActiveOptImgEdit] = useState<{ qIdx: number; optIdx: number } | null>(null);

  const [activeTab, setActiveTab] = useState<'manual' | 'quickImport' | 'json'>('manual');

  // Manual questions list
  const [questions, setQuestions] = useState<Question[]>(() => {
    if (initialExam?.questions && initialExam.questions.length > 0) {
      return JSON.parse(JSON.stringify(initialExam.questions));
    }
    return [
      {
        id: 'q1',
        type: 'single_choice',
        points: 1.0,
        question: 'Cho hàm số $y = f(x)$ có đạo hàm $f\'(x) = x(x - 2)^2$. Số điểm cực trị của hàm số đã cho là:',
        options: ['1', '2', '3', '0'],
        correctAnswer: 0,
        explanation: 'Ta có $f\'(x) = 0 \\iff x = 0$ hoặc $x = 2$. Do $x = 2$ là nghiệm bội chẵn nên $f\'(x)$ không đổi dấu khi qua $x = 2$. Đạo hàm chỉ đổi dấu khi qua nghiệm đơn $x = 0$. Vậy hàm số có đúng 1 điểm cực trị.',
        topic: 'Hàm số & Cực trị',
        difficulty: 'easy',
      },
    ];
  });

  const [previewMap, setPreviewMap] = useState<{ [qId: string]: boolean }>({});
  const [jsonText, setJsonText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  const [rawText, setRawText] = useState(
`Câu 1: Cho hàm số y = f(x). Điểm cực đại của hàm số là gì?
A. x = 1
B. x = 2
C. x = 3
D. x = 4
Đáp án: A
Lời giải: Dựa vào bảng biến thiên, hàm số đạt cực đại tại x = 1.

Câu 2: Các mệnh đề sau Đúng hay Sai?
a) 1 là số nguyên tố
b) 2 là số nguyên tố chẵn duy nhất
Đáp án: a: S, b: Đ
Lời giải: 1 không phải là số nguyên tố. 2 là số nguyên tố chẵn duy nhất.`
  );

  const handleTogglePreview = (id: string) => {
    setPreviewMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleInsertSnippet = (qIndex: number, snippet: string) => {
    setQuestions((prev) => {
      const next = [...prev];
      const cur = next[qIndex].question;
      next[qIndex] = {
        ...next[qIndex],
        question: cur ? `${cur}\n${snippet}` : snippet,
      };
      return next;
    });
  };

  // Add empty manual question
  const handleAddQuestion = (type: QuestionType = 'single_choice') => {
    const newId = 'q_' + Date.now() + Math.random().toString(36).substring(2, 5);
    let newQ: Question = {
      id: newId,
      type,
      points: 1.0,
      question: '',
      explanation: '',
      topic: 'Tổng quát',
      difficulty: 'medium',
    };

    if (type === 'single_choice') {
      newQ.options = ['', '', '', ''];
      newQ.correctAnswer = 0;
    } else if (type === 'true_false') {
      newQ.tfItems = [
        { id: newId + '_a', statement: '', isCorrect: true },
        { id: newId + '_b', statement: '', isCorrect: false },
        { id: newId + '_c', statement: '', isCorrect: true },
        { id: newId + '_d', statement: '', isCorrect: false },
      ];
    } else if (type === 'text_input') {
      newQ.acceptedAnswers = [''];
    } else if (type === 'grouped') {
      newQ.subQuestions = [
        {
          id: newId + '_sub1',
          type: 'single_choice',
          points: 0.5,
          question: '',
          options: ['', '', '', ''],
          correctAnswer: 0,
          explanation: '',
        },
      ];
    }

    setQuestions([...questions, newQ]);
  };

  const handleUpdateQuestion = (index: number, updated: Partial<Question>) => {
    setQuestions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updated };
      return next;
    });
  };

  // Options helpers for single_choice
  const handleAddOption = (qIdx: number) => {
    const q = questions[qIdx];
    const opts = [...(q.options || []), ''];
    const imgs = q.optionImages ? [...q.optionImages, undefined] : undefined;
    handleUpdateQuestion(qIdx, { options: opts, optionImages: imgs });
  };

  const handleRemoveOption = (qIdx: number, optIdx: number) => {
    const q = questions[qIdx];
    if ((q.options || []).length <= 2) {
      setErrorMessage('Câu trắc nghiệm cần có ít nhất 2 phương án lựa chọn (A, B)!');
      return;
    }
    setErrorMessage('');
    const opts = (q.options || []).filter((_, i) => i !== optIdx);
    const imgs = q.optionImages ? q.optionImages.filter((_, i) => i !== optIdx) : undefined;
    let corr = q.correctAnswer || 0;
    if (corr >= opts.length) corr = opts.length - 1;
    handleUpdateQuestion(qIdx, { options: opts, optionImages: imgs, correctAnswer: corr });
  };

  const handleUpdateOption = (qIndex: number, optIndex: number, value: string) => {
    setQuestions((prev) => {
      const next = [...prev];
      const opts = [...(next[qIndex].options || [])];
      opts[optIndex] = value;
      next[qIndex] = { ...next[qIndex], options: opts };
      return next;
    });
  };

  const handleUpdateOptionImage = (qIndex: number, optIndex: number, url: string) => {
    setQuestions((prev) => {
      const next = [...prev];
      const q = { ...next[qIndex] };
      const imgs = q.optionImages ? [...q.optionImages] : [];
      while (imgs.length <= optIndex) {
        imgs.push(undefined);
      }
      imgs[optIndex] = url.trim() || undefined;
      q.optionImages = imgs;
      next[qIndex] = q;
      return next;
    });
  };

  const handleFileUploadOptionImage = (qIndex: number, optIndex: number, file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        handleUpdateOptionImage(qIndex, optIndex, dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  // True/False helpers
  const handleAddTfItem = (qIdx: number) => {
    const q = questions[qIdx];
    const items = [
      ...(q.tfItems || []),
      {
        id: 'tf_' + Date.now() + Math.random().toString(36).substring(2, 4),
        statement: '',
        isCorrect: true,
      },
    ];
    handleUpdateQuestion(qIdx, { tfItems: items });
  };

  const handleRemoveTfItem = (qIdx: number, itemIdx: number) => {
    const q = questions[qIdx];
    if ((q.tfItems || []).length <= 1) {
      setErrorMessage('Câu trắc nghiệm Đúng/Sai cần có ít nhất 1 ý mệnh đề!');
      return;
    }
    setErrorMessage('');
    const items = (q.tfItems || []).filter((_, i) => i !== itemIdx);
    handleUpdateQuestion(qIdx, { tfItems: items });
  };

  const handleUpdateTfItem = (qIdx: number, itemIdx: number, updated: Partial<TrueFalseItem>) => {
    const q = questions[qIdx];
    const items = [...(q.tfItems || [])];
    items[itemIdx] = { ...items[itemIdx], ...updated };
    handleUpdateQuestion(qIdx, { tfItems: items });
  };

  // Subquestions helpers for grouped
  const handleAddSubQuestion = (qIdx: number) => {
    const q = questions[qIdx];
    const subId = 'sub_' + Date.now();
    const subs = [
      ...(q.subQuestions || []),
      {
        id: subId,
        type: 'single_choice' as QuestionType,
        points: 0.5,
        question: '',
        options: ['', '', '', ''],
        correctAnswer: 0,
        explanation: '',
      },
    ];
    handleUpdateQuestion(qIdx, { subQuestions: subs });
  };

  const handleRemoveSubQuestion = (qIdx: number, subIdx: number) => {
    const q = questions[qIdx];
    const subs = (q.subQuestions || []).filter((_, i) => i !== subIdx);
    handleUpdateQuestion(qIdx, { subQuestions: subs });
  };

  const handleDeleteQuestion = (index: number) => {
    if (questions.length <= 1) {
      // If only 1 question remains, reset it to blank rather than blocking
      setQuestions([
        {
          id: 'q_' + Date.now(),
          type: 'single_choice',
          points: 1.0,
          question: '',
          options: ['', '', '', ''],
          correctAnswer: 0,
          explanation: '',
        },
      ]);
      setErrorMessage('Đã xóa trắng nội dung câu hỏi.');
      return;
    }
    setErrorMessage('');
    setQuestions(questions.filter((_, idx) => idx !== index));
  };

  // Parse raw text
  const handleParseRawText = () => {
    try {
      const text = rawText.trim();
      if (!text) {
        setErrorMessage('Vui lòng nhập văn bản đề thi để phân tích!');
        return;
      }

      const blocks = text.split(/(?=Câu\s+\d+[\s:.-])/gi).filter((b) => b.trim());
      const parsed: Question[] = [];

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i].trim();
        const newId = 'q_imp_' + Date.now() + '_' + i;

        // Check if True/False pattern (e.g. contains a) b) c) and "Đáp án: a: Đ, b: S")
        const isTf = /[a-d]\)\s/i.test(block) && /đáp\s*án\s*[:=\-]?\s*[a-d]\s*[:=\-]/i.test(block);

        if (isTf) {
          const qTextMatch = block.match(/^(?:Câu\s+\d+[\s:.-]+)([\s\S]*?)(?=[a-d]\))/i);
          const qText = qTextMatch ? qTextMatch[1].trim() : 'Xét tính Đúng/Sai của các mệnh đề sau:';

          const tfLines = block.match(/[a-d]\)\s*([^\n]+)/gi) || [];
          const tfItems: TrueFalseItem[] = tfLines.map((line, lIdx) => {
            const letter = line[0].toLowerCase();
            const statement = line.replace(/^[a-d]\)\s*/i, '').trim();
            const ansRegex = new RegExp(`${letter}\\s*[:=\\-]\\s*([đds])`, 'i');
            const match = block.match(ansRegex);
            const isCorrect = match ? ['đ', 'd', 't', 'true'].includes(match[1].toLowerCase()) : true;
            return {
              id: `${newId}_${letter}`,
              statement,
              isCorrect,
            };
          });

          parsed.push({
            id: newId,
            type: 'true_false',
            points: 1.0,
            question: qText,
            tfItems,
            explanation: 'Xem lại lý thuyết và các mệnh đề.',
            topic: 'Đúng / Sai',
            difficulty: 'medium',
          });
        } else {
          // Standard Single Choice
          const qMatch = block.match(/^(?:Câu\s+\d+[\s:.-]+)([\s\S]*?)(?=(?:[A-D]\.|\bĐáp án:))/i);
          const qText = qMatch ? qMatch[1].trim() : block.split('\n')[0].replace(/^Câu\s+\d+[\s:.-]*/i, '').trim();

          const optA = block.match(/[A][\s.:)\-]+([^\n]+)/i)?.[1]?.trim() || 'Phương án A';
          const optB = block.match(/[B][\s.:)\-]+([^\n]+)/i)?.[1]?.trim() || 'Phương án B';
          const optC = block.match(/[C][\s.:)\-]+([^\n]+)/i)?.[1]?.trim() || 'Phương án C';
          const optD = block.match(/[D][\s.:)\-]+([^\n]+)/i)?.[1]?.trim() || 'Phương án D';

          const ansMatch = block.match(/Đáp\s*án\s*[:=\-]?\s*([A-D])/i);
          let correctIdx = 0;
          if (ansMatch) {
            const letter = ansMatch[1].toUpperCase();
            if (letter === 'B') correctIdx = 1;
            else if (letter === 'C') correctIdx = 2;
            else if (letter === 'D') correctIdx = 3;
          }

          const expMatch = block.match(/(?:Lời giải|Giải thích|HD|Hướng dẫn giải)\s*[:=\-]?\s*([\s\S]*)$/i);
          const explanation = expMatch ? expMatch[1].trim() : 'Xem lại kiến thức trọng tâm.';

          parsed.push({
            id: newId,
            type: 'single_choice',
            points: 1.0,
            question: qText || `Câu hỏi ${i + 1}`,
            options: [optA, optB, optC, optD],
            correctAnswer: correctIdx,
            explanation,
            topic: 'Trắc nghiệm đơn',
            difficulty: 'medium',
          });
        }
      }

      if (parsed.length === 0) {
        setErrorMessage('Không nhận diện được câu hỏi nào. Vui lòng kiểm tra lại định dạng!');
        return;
      }

      setQuestions(parsed);
      setActiveTab('manual');
      setErrorMessage('');
      setSuccessNotice(`Đã nạp thành công ${parsed.length} câu hỏi vào đề!`);
      setTimeout(() => setSuccessNotice(''), 4000);
    } catch (err) {
      setErrorMessage('Lỗi khi phân tích: ' + String(err));
    }
  };

  const handleFinalSave = () => {
    if (!title.trim()) {
      setErrorMessage('Vui lòng nhập tên đề thi!');
      return;
    }
    if (questions.length === 0) {
      setErrorMessage('Đề thi phải có ít nhất 1 câu hỏi!');
      return;
    }

    // Calculate total points
    const totalPts = questions.reduce((acc, q) => acc + (q.points || 1.0), 0);

    const newExam: Exam = {
      id: initialExam?.id || ('custom-' + Date.now()),
      title: title.trim(),
      subject,
      grade,
      durationMinutes: Number(durationMinutes) || 45,
      description: description.trim() || `Đề thi trắc nghiệm gồm ${questions.length} câu hỏi.`,
      instructions: instructions.trim(),
      settings: {
        shuffleQuestions,
        shuffleOptions,
      },
      questions,
      totalQuestions: questions.length,
      totalPoints: Number(totalPts.toFixed(2)),
      createdAt: initialExam?.createdAt || new Date().toISOString().split('T')[0],
      isCustom: true,
      visibility,
      status,
      openTime: openTime ? openTime : undefined,
      closeTime: closeTime ? closeTime : undefined,
      maxAttempts: maxAttempts > 0 ? Number(maxAttempts) : undefined,
      maxTabSwitches: maxTabSwitches > 0 ? Number(maxTabSwitches) : undefined,
    };

    onSave(newExam);
  };

  const totalCalculatedPoints = questions.reduce((acc, q) => acc + (q.points || 1.0), 0);

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 font-sans">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-6 border-b border-slate-200 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="p-2 text-slate-500 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Quay lại"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span>{isEditing ? 'Chỉnh sửa đề thi & câu hỏi' : 'Soạn thảo đề thi mới'}</span>
              {isEditing && (
                <span className="text-xs font-mono font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Chế độ sửa
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {isEditing
                ? 'Bạn có toàn quyền viết thêm, sửa đổi nội dung, công thức, đáp án hoặc xóa bớt câu hỏi.'
                : 'Hỗ trợ trắc nghiệm đơn, Đúng/Sai từng ý, điền ô chữ/số, câu hỏi chùm, điểm câu & điểm ý'}
            </p>
          </div>
        </div>

        <button
          onClick={handleFinalSave}
          className="py-2.5 px-5 text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{isEditing ? 'Lưu thay đổi đề thi' : 'Lưu & Xuất bản đề thi'}</span>
        </button>
      </div>

      {/* Notices */}
      {errorMessage && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs sm:text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}
      {successNotice && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs sm:text-sm flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
          <span>{successNotice}</span>
        </div>
      )}

      {/* General Settings Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
            Thông tin chung & Cài đặt phòng thi
          </h2>
          <div className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-md border border-blue-200">
            Tổng điểm đề: {totalCalculatedPoints.toFixed(2)} điểm
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tiêu đề đề thi <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Đề kiểm tra Toán 12 - Khảo sát hàm số & Tích phân"
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Môn học
            </label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value as SubjectType)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="math">Toán học</option>
              <option value="english">Tiếng Anh</option>
              <option value="physics">Vật lý</option>
              <option value="chemistry">Hóa học</option>
              <option value="history">Lịch sử</option>
              <option value="it">Tin học & CNTT</option>
              <option value="biology">Sinh học</option>
              <option value="general">Tổng hợp</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Khối lớp / Đối tượng
            </label>
            <input
              type="text"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="VD: Lớp 12, Đại học, Khảo sát năng lực"
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Thời gian làm bài (Phút)
            </label>
            <input
              type="number"
              min="5"
              max="180"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mô tả ngắn
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="VD: Đề thi cấu trúc mới gồm đầy đủ các dạng câu..."
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {/* Instructions Box */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-blue-600" />
              <span>Hướng dẫn làm bài thi (Hiển thị cho thí sinh trước và trong khi thi):</span>
            </label>
            <textarea
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Ghi rõ quy chế thi, lưu ý điền số thập phân, quy định chấm điểm..."
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 leading-relaxed"
            />
          </div>

          {/* Shuffle Checkboxes */}
          <div className="md:col-span-2 pt-2 border-t border-slate-100 flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={shuffleQuestions}
                onChange={(e) => setShuffleQuestions(e.target.checked)}
                className="w-4 h-4 text-slate-900 rounded border-slate-300 focus:ring-slate-900"
              />
              <span className="flex items-center gap-1">
                <Shuffle className="w-3.5 h-3.5 text-slate-500" />
                Đảo ngẫu nhiên thứ tự câu hỏi khi thí sinh vào thi
              </span>
            </label>

            <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={shuffleOptions}
                onChange={(e) => setShuffleOptions(e.target.checked)}
                className="w-4 h-4 text-slate-900 rounded border-slate-300 focus:ring-slate-900"
              />
              <span className="flex items-center gap-1">
                <Shuffle className="w-3.5 h-3.5 text-slate-500" />
                Đảo ngẫu nhiên thứ tự các phương án lựa chọn (A, B, C, D...)
              </span>
            </label>
          </div>

          {/* Visibility & Status Section */}
          <div className="md:col-span-2 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Visibility */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-blue-600" />
                <span>Phạm vi hiển thị đề thi:</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setVisibility('public')}
                  className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    visibility === 'public'
                      ? 'bg-blue-50/80 border-blue-500 text-blue-950 font-bold ring-1 ring-blue-500'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1 text-xs">
                    <Globe className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Công khai web</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-normal mt-1 leading-tight">
                    Mọi người đều thấy và tự do thi/luyện tập
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setVisibility('exam_only')}
                  className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    visibility === 'exam_only'
                      ? 'bg-purple-50/80 border-purple-500 text-purple-950 font-bold ring-1 ring-purple-500'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1 text-xs">
                    <Layers className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span>Giới hạn kỳ thi</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-normal mt-1 leading-tight">
                    Chỉ làm khi nằm trong tổ hợp kỳ thi
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setVisibility('private')}
                  className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    visibility === 'private'
                      ? 'bg-rose-50/80 border-rose-500 text-rose-950 font-bold ring-1 ring-rose-500'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1 text-xs">
                    <Lock className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>Riêng người ra đề</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-normal mt-1 leading-tight">
                    Chỉ giáo viên tạo đề nhìn thấy
                  </p>
                </button>
              </div>
            </div>

            {/* Exam Status */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                <span>Trạng thái đề thi:</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { key: 'open', label: 'Đang mở', desc: 'Thí sinh vào thi ngay' },
                  { key: 'scheduled', label: 'Đã lên lịch', desc: 'Mở theo giờ đặt trước' },
                  { key: 'draft', label: 'Bản nháp', desc: 'Chưa công bố' },
                  { key: 'closed', label: 'Đã đóng', desc: 'Khóa không nhận bài' },
                ].map((st) => (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => setStatus(st.key as ExamStatus)}
                    className={`p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                      status === st.key
                        ? 'bg-indigo-50 border-indigo-600 text-indigo-950 font-bold ring-1 ring-indigo-500'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs">{st.label}</div>
                    <div className="text-[10px] text-slate-500 font-normal truncate mt-0.5">{st.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Open & Close Timers */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>Thời gian mở đề (Tùy chọn):</span>
                {openTime && (
                  <button
                    type="button"
                    onClick={() => setOpenTime('')}
                    className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                  >
                    Xóa giờ mở
                  </button>
                )}
              </label>
              <input
                type="datetime-local"
                value={openTime}
                onChange={(e) => setOpenTime(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 font-mono"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Thí sinh không thể bắt đầu làm bài trước thời điểm này.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>Thời gian đóng đề (Hạn chót):</span>
                {closeTime && (
                  <button
                    type="button"
                    onClick={() => setCloseTime('')}
                    className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                  >
                    Xóa giờ đóng
                  </button>
                )}
              </label>
              <input
                type="datetime-local"
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 font-mono"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Sau thời điểm này, đề sẽ tự động khóa và không nhận bài nộp mới.
              </p>
            </div>

            {/* Attempt Limits & Anti-cheat Tab Switches */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Giới hạn số lần làm đề của thí sinh:
              </label>
              <select
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value={0}>Không giới hạn số lần làm (Tự do ôn tập)</option>
                <option value={1}>Chỉ làm 1 lần duy nhất (Thi chính thức)</option>
                <option value={2}>Tối đa 2 lần</option>
                <option value={3}>Tối đa 3 lần</option>
                <option value={5}>Tối đa 5 lần</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Hệ thống sẽ khóa nút vào thi khi thí sinh đã làm đủ số lần quy định.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5 text-rose-800">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                <span>Kiểm soát ra vào / Thoát màn hình thi:</span>
              </label>
              <select
                value={maxTabSwitches}
                onChange={(e) => setMaxTabSwitches(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs bg-white border border-rose-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-600 font-medium text-rose-900"
              >
                <option value={0}>Tắt giám sát thoát trang</option>
                <option value={1}>Thoát trang 1 lần: Tự động thu & nộp bài ngay lập tức</option>
                <option value={2}>Thoát trang 2 lần: Tự động thu & nộp bài (1 lần nhắc nhở)</option>
                <option value={3}>Thoát trang 3 lần: Tự động thu & nộp bài (2 lần nhắc nhở)</option>
                <option value={5}>Thoát trang 5 lần: Tự động thu & nộp bài</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Chống gian lận: Khi thí sinh chuyển tab, thu nhỏ hoặc rời trình duyệt quá số lần, hệ thống sẽ tự động chấm dứt bài thi và nộp kết quả ngay.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Mode Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/60 rounded-xl mb-6 max-w-fit text-xs font-medium">
        <button
          onClick={() => setActiveTab('manual')}
          className={`py-2 px-4 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'manual'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Danh sách câu hỏi ({questions.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('quickImport')}
          className={`py-2 px-4 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'quickImport'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Upload className="w-4 h-4 text-blue-600" />
          <span>Nhập nhanh từ văn bản</span>
        </button>
      </div>

      {/* Tab 1: Manual Questions List */}
      {activeTab === 'manual' && (
        <div className="space-y-6">
          {questions.map((q, qIdx) => (
            <div
              key={q.id || qIdx}
              className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs relative"
            >
              {/* Question Item Header */}
              <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-100 mb-4 gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">
                    Câu {qIdx + 1}
                  </span>

                  {/* Question Type Selector */}
                  <select
                    value={q.type}
                    onChange={(e) => {
                      const newType = e.target.value as QuestionType;
                      handleUpdateQuestion(qIdx, {
                        type: newType,
                        options: newType === 'single_choice' ? (q.options || ['', '', '', '']) : undefined,
                        correctAnswer: newType === 'single_choice' ? (q.correctAnswer ?? 0) : undefined,
                        tfItems: newType === 'true_false' ? (q.tfItems || [
                          { id: q.id + '_a', statement: '', isCorrect: true },
                          { id: q.id + '_b', statement: '', isCorrect: false },
                        ]) : undefined,
                        acceptedAnswers: newType === 'text_input' ? (q.acceptedAnswers || ['']) : undefined,
                        subQuestions: newType === 'grouped' ? (q.subQuestions || []) : undefined,
                      });
                    }}
                    className="px-2.5 py-1 text-xs font-semibold bg-slate-100 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
                  >
                    <option value="single_choice">Dạng 1: Trắc nghiệm 1 đáp án</option>
                    <option value="true_false">Dạng 2: Trắc nghiệm Đúng / Sai từng ý</option>
                    <option value="text_input">Dạng 3: Trả lời ngắn / Nhập ô văn bản</option>
                    <option value="grouped">Dạng 4: Câu hỏi chùm (Đọc hiểu / Bối cảnh)</option>
                  </select>

                  {/* Points Input for Question */}
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-slate-500 font-medium">Điểm câu:</span>
                    <input
                      type="number"
                      step="0.25"
                      min="0.1"
                      value={q.points}
                      onChange={(e) => handleUpdateQuestion(qIdx, { points: parseFloat(e.target.value) || 1.0 })}
                      className="w-16 px-2 py-0.5 font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleTogglePreview(q.id)}
                    className={`px-2.5 py-1 text-xs rounded-md border flex items-center gap-1 transition-colors cursor-pointer ${
                      previewMap[q.id]
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                    title="Xem trước kết quả hiển thị"
                  >
                    {previewMap[q.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{previewMap[q.id] ? 'Tắt xem trước' : 'Xem trước'}</span>
                  </button>

                  <input
                    type="text"
                    value={q.topic || ''}
                    onChange={(e) => handleUpdateQuestion(qIdx, { topic: e.target.value })}
                    placeholder="Chuyên đề (VD: Hàm số)"
                    className="px-2.5 py-1 text-xs border border-slate-200 rounded-md bg-slate-50 focus:outline-none focus:ring-1 focus:ring-slate-900 w-32"
                  />

                  <button
                    onClick={() => handleDeleteQuestion(qIdx)}
                    className="p-1 text-slate-400 hover:text-rose-600 transition-colors rounded cursor-pointer"
                    title="Xóa câu hỏi này"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Math & Table Toolbar */}
              <MathToolbar
                onInsert={(snippet) => handleInsertSnippet(qIdx, snippet)}
                onInsertImage={(url) => handleUpdateQuestion(qIdx, { imageUrl: url })}
              />

              {/* Question Statement */}
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {q.type === 'grouped' ? 'Đoạn văn bối cảnh chung / Dữ kiện dùng chung:' : 'Nội dung câu hỏi (hỗ trợ công thức $x^2$, bảng biến thiên):'}
                </label>
                <textarea
                  rows={q.type === 'grouped' ? 4 : 2}
                  value={q.question}
                  onChange={(e) => handleUpdateQuestion(qIdx, { question: e.target.value })}
                  placeholder="Nhập nội dung đề bài..."
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono"
                />
              </div>

              {/* Image URL & Preview */}
              <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-purple-600" />
                    <span>Hình ảnh / Đồ thị câu hỏi (Tùy chọn):</span>
                  </label>
                  {q.imageUrl && (
                    <button
                      type="button"
                      onClick={() => handleUpdateQuestion(qIdx, { imageUrl: '' })}
                      className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                    >
                      Xóa ảnh
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={q.imageUrl || ''}
                  onChange={(e) => handleUpdateQuestion(qIdx, { imageUrl: e.target.value })}
                  placeholder="Dán đường dẫn URL hình ảnh..."
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600"
                />
                {q.imageUrl && (
                  <div className="mt-2 text-center">
                    <img
                      src={q.imageUrl}
                      alt="Xem trước hình"
                      className="max-h-48 rounded-lg border border-slate-200 inline-block shadow-2xs"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
              </div>

              {/* Live Preview */}
              {previewMap[q.id] && (
                <div className="mb-4 p-4 bg-blue-50/50 border border-blue-200 rounded-xl">
                  <div className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" />
                      Xem trước hiển thị:
                    </span>
                    <span className="text-[11px] font-normal text-blue-600">
                      Công thức toán & căn thức tự động khớp
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-blue-100 space-y-3">
                    <RichContentRenderer content={q.question || 'Chưa nhập nội dung.'} imageUrl={q.imageUrl} />
                    
                    {/* Preview options for single_choice */}
                    {q.type === 'single_choice' && q.options && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                        {q.options.map((opt, optIdx) => {
                          const letter = String.fromCharCode(65 + optIdx);
                          const isCorrect = q.correctAnswer === optIdx;
                          const optImg = q.optionImages?.[optIdx];

                          return (
                            <div
                              key={optIdx}
                              className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                                isCorrect
                                  ? 'bg-emerald-50 border-emerald-400 font-medium text-emerald-950'
                                  : 'bg-white border-slate-200 text-slate-800'
                              }`}
                            >
                              <span
                                className={`w-5 h-5 rounded font-bold text-xs flex items-center justify-center shrink-0 border ${
                                  isCorrect
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}
                              >
                                {letter}
                              </span>
                              <div className="flex-1">
                                {opt && <RichContentRenderer content={opt} />}
                                {optImg && (
                                  <div className="mt-1">
                                    <img
                                      src={optImg}
                                      alt={`Phương án ${letter}`}
                                      className="max-h-28 rounded border border-slate-200 object-contain"
                                      referrerPolicy="no-referrer"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* --- DẠNG 1: Single choice Options Editor --- */}
              {q.type === 'single_choice' && (
                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">
                        Các phương án lựa chọn (Click nút chữ cái để chọn đáp án đúng):
                      </label>
                      <p className="text-[11px] text-slate-500">
                        Giáo viên có thể nhập chữ/công thức toán hoặc đính kèm ảnh phương án để thay thế.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddOption(qIdx)}
                      className="text-xs font-semibold text-blue-700 hover:underline flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Thêm phương án</span>
                    </button>
                  </div>

                  {(q.options || []).map((opt, optIdx) => {
                    const letter = String.fromCharCode(65 + optIdx);
                    const isCorrect = q.correctAnswer === optIdx;
                    const optImg = q.optionImages?.[optIdx];
                    const isImageEditing = activeOptImgEdit?.qIdx === qIdx && activeOptImgEdit?.optIdx === optIdx;

                    return (
                      <div key={optIdx} className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleUpdateQuestion(qIdx, { correctAnswer: optIdx })}
                            className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 border transition-colors cursor-pointer ${
                              isCorrect
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs ring-2 ring-emerald-300'
                                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                            }`}
                            title="Đặt làm đáp án đúng"
                          >
                            {letter}
                          </button>

                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => handleUpdateOption(qIdx, optIdx, e.target.value)}
                            placeholder={`Phương án ${letter} (nhập công thức, chữ hoặc dùng ảnh bên phải)...`}
                            className={`flex-1 px-3 py-1.5 text-xs bg-white border rounded-lg focus:outline-none ${
                              isCorrect
                                ? 'border-emerald-400 ring-1 ring-emerald-300'
                                : 'border-slate-200 focus:ring-2 focus:ring-slate-900'
                            }`}
                          />

                          {/* Image Attachment Button */}
                          <button
                            type="button"
                            onClick={() => {
                              if (isImageEditing) {
                                setActiveOptImgEdit(null);
                              } else {
                                setActiveOptImgEdit({ qIdx, optIdx });
                              }
                            }}
                            className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                              optImg
                                ? 'bg-purple-50 text-purple-700 border-purple-300 font-semibold'
                                : isImageEditing
                                ? 'bg-slate-800 text-white border-slate-800'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                            title="Tải ảnh hoặc dán URL ảnh phương án"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span>{optImg ? 'Có ảnh' : 'Thêm ảnh'}</span>
                          </button>

                          {(q.options || []).length > 2 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(qIdx, optIdx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer shrink-0"
                              title="Xóa phương án này"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {/* Image Attachment Drawer / Box */}
                        {(isImageEditing || optImg) && (
                          <div className="pt-2 pl-9 pr-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-purple-50/30 p-2.5 rounded-md">
                            <div className="flex-1 space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-700">URL ảnh:</span>
                                <input
                                  type="text"
                                  value={optImg || ''}
                                  onChange={(e) => handleUpdateOptionImage(qIdx, optIdx, e.target.value)}
                                  placeholder="Dán link ảnh (https://...) hoặc tải từ máy bên cạnh..."
                                  className="flex-1 px-2.5 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-600"
                                />
                                <label className="px-2.5 py-1 bg-white hover:bg-purple-50 text-purple-700 border border-purple-300 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0">
                                  <Upload className="w-3 h-3" />
                                  <span>Chọn tệp</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleFileUploadOptionImage(qIdx, optIdx, file);
                                    }}
                                  />
                                </label>
                              </div>
                            </div>

                            {optImg && (
                              <div className="flex items-center gap-2 shrink-0">
                                <img
                                  src={optImg}
                                  alt={`Phương án ${letter}`}
                                  className="h-14 w-auto max-w-[120px] rounded border border-slate-300 object-contain bg-white shadow-2xs"
                                  referrerPolicy="no-referrer"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdateOptionImage(qIdx, optIdx, '')}
                                  className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                  title="Xóa ảnh phương án"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* --- DẠNG 2: True/False Sub-items Editor --- */}
              {q.type === 'true_false' && (
                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">
                        Danh sách các ý mệnh đề (Chọn ĐÚNG hoặc SAI):
                      </label>
                      <div className="text-[11px] text-slate-500">
                        * Bạn có thể nhập điểm riêng cho từng ý, hoặc để trống để hệ thống <strong>tự động chia đều điểm câu ({q.points}đ / {(q.tfItems || []).length} ý)</strong>.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddTfItem(qIdx)}
                      className="text-xs font-semibold text-emerald-700 hover:underline flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Thêm ý mệnh đề</span>
                    </button>
                  </div>

                  {(q.tfItems || []).map((item, itemIdx) => {
                    const letter = String.fromCharCode(97 + itemIdx);
                    return (
                      <div
                        key={item.id}
                        className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center gap-2.5"
                      >
                        <span className="font-bold text-xs text-slate-800 w-5">{letter})</span>
                        <input
                          type="text"
                          value={item.statement}
                          onChange={(e) => handleUpdateTfItem(qIdx, itemIdx, { statement: e.target.value })}
                          placeholder={`Nội dung ý ${letter}...`}
                          className="flex-1 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                        />

                        {/* Điểm từng ý */}
                        <div className="flex items-center gap-1 text-xs shrink-0">
                          <span className="text-slate-500">Điểm ý:</span>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            placeholder="Chia đều"
                            value={item.points !== undefined ? item.points : ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                              handleUpdateTfItem(qIdx, itemIdx, { points: val });
                            }}
                            className="w-18 px-2 py-1 text-xs bg-white border border-slate-200 rounded font-mono"
                          />
                        </div>

                        {/* Đúng / Sai selector */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleUpdateTfItem(qIdx, itemIdx, { isCorrect: true })}
                            className={`px-3 py-1 text-xs font-bold rounded border transition-colors cursor-pointer ${
                              item.isCorrect
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            ĐÚNG
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateTfItem(qIdx, itemIdx, { isCorrect: false })}
                            className={`px-3 py-1 text-xs font-bold rounded border transition-colors cursor-pointer ${
                              !item.isCorrect
                                ? 'bg-rose-600 text-white border-rose-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            SAI
                          </button>
                          {(q.tfItems || []).length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveTfItem(qIdx, itemIdx)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer ml-1"
                              title="Xóa ý này"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* --- DẠNG 3: Text Input Editor --- */}
              {q.type === 'text_input' && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 mb-4 space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Các đáp án được chấp nhận (cách nhau bởi dấu phẩy hoặc nhấn Enter):
                  </label>
                  <input
                    type="text"
                    value={(q.acceptedAnswers || []).join(', ')}
                    onChange={(e) => {
                      const list = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                      handleUpdateQuestion(qIdx, { acceptedAnswers: list });
                    }}
                    placeholder="VD: 3.5, 7/2, 3,5"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono"
                  />
                  <div className="text-[11px] text-slate-500">
                    Mẹo: Có thể nhập nhiều cách viết tương đương nhau để hệ thống tự chấm đúng (ví dụ: cả số thập phân và phân số).
                  </div>
                </div>
              )}

              {/* --- DẠNG 4: Grouped Subquestions Editor --- */}
              {q.type === 'grouped' && (
                <div className="space-y-4 mb-4 p-4 bg-purple-50/40 rounded-xl border border-purple-200">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-purple-900 uppercase">
                      Danh sách các câu hỏi con trong chùm:
                    </label>
                    <button
                      type="button"
                      onClick={() => handleAddSubQuestion(qIdx)}
                      className="text-xs font-semibold text-purple-700 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Thêm câu con</span>
                    </button>
                  </div>

                  {(q.subQuestions || []).map((subQ, sIdx) => (
                    <div key={subQ.id} className="p-3 bg-white rounded-lg border border-purple-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-purple-900">
                          Câu con {qIdx + 1}.{sIdx + 1}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">Điểm:</span>
                          <input
                            type="number"
                            step="0.25"
                            value={subQ.points}
                            onChange={(e) => {
                              const nextSubs = [...(q.subQuestions || [])];
                              nextSubs[sIdx].points = parseFloat(e.target.value) || 0.5;
                              handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                            }}
                            className="w-14 px-1.5 py-0.5 text-xs border rounded font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveSubQuestion(qIdx, sIdx)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                            title="Xóa câu con này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <input
                        type="text"
                        value={subQ.question}
                        onChange={(e) => {
                          const nextSubs = [...(q.subQuestions || [])];
                          nextSubs[sIdx].question = e.target.value;
                          handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                        }}
                        placeholder="Nội dung câu hỏi con..."
                        className="w-full px-2.5 py-1.5 text-xs border rounded"
                      />

                      {/* 4 options for sub question */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {(subQ.options || []).map((sOpt, sOptIdx) => {
                          const sLetter = String.fromCharCode(65 + sOptIdx);
                          const isCorr = subQ.correctAnswer === sOptIdx;
                          return (
                            <div key={sOptIdx} className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  const nextSubs = [...(q.subQuestions || [])];
                                  nextSubs[sIdx].correctAnswer = sOptIdx;
                                  handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                                }}
                                className={`w-5 h-5 rounded text-[10px] font-bold border ${
                                  isCorr ? 'bg-emerald-600 text-white' : 'bg-slate-100'
                                }`}
                              >
                                {sLetter}
                              </button>
                              <input
                                type="text"
                                value={sOpt}
                                onChange={(e) => {
                                  const nextSubs = [...(q.subQuestions || [])];
                                  nextSubs[sIdx].options![sOptIdx] = e.target.value;
                                  handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                                }}
                                placeholder={`Ý ${sLetter}...`}
                                className="flex-1 px-2 py-1 text-xs border rounded"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Explanation Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Lời giải thích chi tiết:
                </label>
                <textarea
                  rows={2}
                  value={q.explanation}
                  onChange={(e) => handleUpdateQuestion(qIdx, { explanation: e.target.value })}
                  placeholder="Nhập lời giải hoặc căn cứ đối chiếu..."
                  className="w-full px-3 py-2 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>
          ))}

          {/* Add Question Buttons per type */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              onClick={() => handleAddQuestion('single_choice')}
              className="py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-800 flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-4 h-4 text-blue-600" />
              <span>+ Thêm câu Trắc nghiệm 1 đáp án</span>
            </button>
            <button
              onClick={() => handleAddQuestion('true_false')}
              className="py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-800 flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>+ Thêm câu Trắc nghiệm Đúng / Sai</span>
            </button>
            <button
              onClick={() => handleAddQuestion('text_input')}
              className="py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-800 flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-4 h-4 text-amber-600" />
              <span>+ Thêm câu Trả lời ngắn</span>
            </button>
            <button
              onClick={() => handleAddQuestion('grouped')}
              className="py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-800 flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-4 h-4 text-purple-600" />
              <span>+ Thêm câu hỏi chùm (Đọc hiểu)</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Quick Import from Text */}
      {activeTab === 'quickImport' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Nhập đề tự động từ văn bản (Word / PDF / Ghi chú)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Hỗ trợ cả trắc nghiệm chọn phương án (A, B, C, D) và trắc nghiệm Đúng / Sai theo từng ý (a, b, c, d)
              </p>
            </div>
          </div>

          <textarea
            rows={14}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            className="w-full p-4 font-mono text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 mb-4 leading-relaxed"
          />

          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500">
              Mẹo: Hệ thống tự động phân loại trắc nghiệm đơn hoặc trắc nghiệm đúng sai theo ý.
            </span>
            <button
              onClick={handleParseRawText}
              className="py-2.5 px-5 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Phân tích & nạp vào đề</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
