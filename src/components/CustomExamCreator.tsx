import React, { useState } from 'react';
import { Exam, Question, QuestionType, SubjectType, TrueFalseItem, TrueFalseScoringMode, ExamVisibility, ExamStatus } from '../types/exam';
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
  X,
  Users,
  CopySlash,
  EyeClosed,
  CheckSquare,
  Clock
} from 'lucide-react';
import { MathToolbar } from './MathToolbar';
import { RichContentRenderer } from './RichContentRenderer';
import { getAllClassrooms, getAllSubjects, generate8DigitExamCode, saveCustomExam } from '../utils/storage';
import { processImageFile } from '../utils/imageUpload';

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
  const availableClassrooms = getAllClassrooms();
  const availableSubjects = getAllSubjects();

  const [title, setTitle] = useState(initialExam?.title || '');
  const [examCode, setExamCode] = useState<string>(
    initialExam?.examCode || generate8DigitExamCode()
  );
  const [randomQuestionCount, setRandomQuestionCount] = useState<number>(
    initialExam?.randomQuestionCount ?? 0
  );
  const [savedQuestionBadgeIndex, setSavedQuestionBadgeIndex] = useState<number | null>(null);

  const [subject, setSubject] = useState<SubjectType>(initialExam?.subject || 'math');
  const [isCustomSubject, setIsCustomSubject] = useState<boolean>(() => {
    if (!initialExam?.subject) return false;
    return !availableSubjects.some((s) => s.id === initialExam.subject);
  });
  const [customSubjectName, setCustomSubjectName] = useState<string>(() => {
    if (!initialExam?.subject) return '';
    return availableSubjects.some((s) => s.id === initialExam.subject) ? '' : initialExam.subject;
  });

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

  // New features: Visibility, Status, Scheduling, Limits, Mode, Security
  const [visibility, setVisibility] = useState<ExamVisibility>(initialExam?.visibility || 'public');
  const [assignedClassId, setAssignedClassId] = useState<string>(
    initialExam?.assignedClassId || (availableClassrooms[0]?.id || '')
  );
  const [status, setStatus] = useState<ExamStatus>(initialExam?.status || 'open');
  const [openTime, setOpenTime] = useState(initialExam?.openTime || '');
  const [closeTime, setCloseTime] = useState(initialExam?.closeTime || '');
  const [maxAttempts, setMaxAttempts] = useState<number>(initialExam?.maxAttempts ?? 0);
  const [maxTabSwitches, setMaxTabSwitches] = useState<number>(initialExam?.maxTabSwitches ?? 0);

  // Mode: Exam vs Practice
  const [modeType, setModeType] = useState<'both' | 'exam_only' | 'practice_only'>(
    initialExam?.modeType || 'both'
  );

  // Anti-copy
  const [allowCopy, setAllowCopy] = useState<boolean>(
    initialExam?.allowCopy ?? initialExam?.settings?.allowCopy ?? false
  );

  // Answers & Score display toggles
  const [showAnswersAfterExam, setShowAnswersAfterExam] = useState<boolean>(
    initialExam?.showAnswersAfterExam ?? initialExam?.settings?.showAnswersAfterExam ?? true
  );
  const [showLiveScoreDuringExam, setShowLiveScoreDuringExam] = useState<boolean>(
    initialExam?.showLiveScoreDuringExam ?? initialExam?.settings?.showLiveScoreDuringExam ?? false
  );
  const [showScoreAfterExam, setShowScoreAfterExam] = useState<boolean>(
    initialExam?.showScoreAfterExam ?? initialExam?.settings?.showScoreAfterExam ?? true
  );

  // Strict exam room controls & candidate code restrictions
  const [lockExitUntilTimeout, setLockExitUntilTimeout] = useState<boolean>(
    initialExam?.lockExitUntilTimeout ?? false
  );
  const [showOnlyStudentAnswersAfterExam, setShowOnlyStudentAnswersAfterExam] = useState<boolean>(
    initialExam?.showOnlyStudentAnswersAfterExam ?? false
  );
  const [minSubmitMinutes, setMinSubmitMinutes] = useState<number>(
    initialExam?.minSubmitMinutes ?? 0
  );
  const [requireAccessCode, setRequireAccessCode] = useState<boolean>(
    initialExam?.requireAccessCode ?? false
  );
  const [accessSecurityCode, setAccessSecurityCode] = useState<string>(
    initialExam?.accessSecurityCode || ''
  );
  const [inPlaceSaveToast, setInPlaceSaveToast] = useState<string | null>(null);

  // Active option image editor toggle (which question index & option index is open for image editing)
  const [activeOptImgEdit, setActiveOptImgEdit] = useState<{ qIdx: number; optIdx: number } | null>(null);
  const [activeSubOptImgEdit, setActiveSubOptImgEdit] = useState<{ qIdx: number; subIdx: number; optIdx: number } | null>(null);

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
      newQ.tfScoringMode = 'standard_ministry';
      newQ.tfTierPoints = [0.1, 0.25, 0.5, 1.0];
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

  const handleFileUploadQuestionImage = async (qIndex: number, file: File) => {
    if (!file) return;
    try {
      const compressed = await processImageFile(file);
      handleUpdateQuestion(qIndex, { imageUrl: compressed });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Không thể tải ảnh đề bài lên!');
    }
  };

  const handleFileUploadOptionImage = async (qIndex: number, optIndex: number, file: File) => {
    if (!file) return;
    try {
      const compressed = await processImageFile(file);
      handleUpdateOptionImage(qIndex, optIndex, compressed);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Không thể tải ảnh phương án lên!');
    }
  };

  // Subquestions image handlers
  const handleFileUploadSubQuestionImage = async (qIdx: number, subIdx: number, file: File) => {
    if (!file) return;
    try {
      const compressed = await processImageFile(file);
      const nextSubs = [...(questions[qIdx].subQuestions || [])];
      nextSubs[subIdx] = { ...nextSubs[subIdx], imageUrl: compressed };
      handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Không thể tải ảnh câu con lên!');
    }
  };

  const handleUpdateSubOptionImage = (qIdx: number, subIdx: number, optIdx: number, url: string) => {
    const nextSubs = [...(questions[qIdx].subQuestions || [])];
    const sub = { ...nextSubs[subIdx] };
    const imgs = sub.optionImages ? [...sub.optionImages] : [];
    while (imgs.length <= optIdx) {
      imgs.push(undefined);
    }
    imgs[optIdx] = url.trim() || undefined;
    sub.optionImages = imgs;
    nextSubs[subIdx] = sub;
    handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
  };

  const handleFileUploadSubOptionImage = async (qIdx: number, subIdx: number, optIdx: number, file: File) => {
    if (!file) return;
    try {
      const compressed = await processImageFile(file);
      handleUpdateSubOptionImage(qIdx, subIdx, optIdx, compressed);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Không thể tải ảnh phương án câu con lên!');
    }
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

  const handleFinalSave = (stayInEditor: boolean = false) => {
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
    const finalSubject = isCustomSubject ? (customSubjectName.trim() || 'Tổng hợp') : subject;
    const chosenClass = availableClassrooms.find((c) => c.id === assignedClassId);

    const newExam: Exam = {
      id: initialExam?.id || ('custom-' + Date.now()),
      title: title.trim(),
      subject: finalSubject,
      grade,
      durationMinutes: Number(durationMinutes) || 45,
      description: description.trim() || `Đề thi trắc nghiệm gồm ${questions.length} câu hỏi.`,
      instructions: instructions.trim(),
      settings: {
        shuffleQuestions,
        shuffleOptions,
        allowCopy,
        showAnswersAfterExam,
        showLiveScoreDuringExam,
        showScoreAfterExam,
      },
      questions,
      totalQuestions: questions.length,
      totalPoints: Number(totalPts.toFixed(2)),
      createdAt: initialExam?.createdAt || new Date().toISOString().split('T')[0],
      isCustom: true,
      visibility,
      assignedClassId: visibility === 'class' ? assignedClassId : undefined,
      assignedClassName: visibility === 'class' ? (chosenClass?.name || 'Lớp riêng') : undefined,
      status,
      openTime: openTime ? openTime : undefined,
      closeTime: closeTime ? closeTime : undefined,
      modeType,
      maxAttempts: maxAttempts > 0 ? Number(maxAttempts) : undefined,
      maxTabSwitches: maxTabSwitches > 0 ? Number(maxTabSwitches) : undefined,
      allowCopy,
      showAnswersAfterExam,
      showOnlyStudentAnswersAfterExam,
      showLiveScoreDuringExam,
      showScoreAfterExam,
      lockExitUntilTimeout,
      minSubmitMinutes: Number(minSubmitMinutes) > 0 ? Number(minSubmitMinutes) : undefined,
      requireAccessCode,
      accessSecurityCode: requireAccessCode ? (accessSecurityCode.trim() || '123456') : undefined,
      examCode: examCode.trim() || generate8DigitExamCode(),
      randomQuestionCount: Number(randomQuestionCount) > 0 ? Number(randomQuestionCount) : undefined,
    };

    if (stayInEditor) {
      saveCustomExam(newExam);
      const timeStr = new Date().toLocaleTimeString('vi-VN');
      setInPlaceSaveToast(`✓ Đã lưu đề thi thành công tại đây lúc ${timeStr}!`);
      setTimeout(() => setInPlaceSaveToast(null), 3500);
    } else {
      onSave(newExam);
    }
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
          onClick={() => handleFinalSave(false)}
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
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">
                Môn học <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setIsCustomSubject(!isCustomSubject)}
                className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
              >
                {isCustomSubject ? '← Chọn từ danh mục môn có sẵn' : '+ Tự nhập tên môn học'}
              </button>
            </div>

            {isCustomSubject ? (
              <input
                type="text"
                value={customSubjectName}
                onChange={(e) => setCustomSubjectName(e.target.value)}
                placeholder="Nhập tên môn học mới (VD: GDQP, Pháp luật đại cương, Triết học...)"
                className="w-full px-3.5 py-2 text-sm bg-white border border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            ) : (
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value as SubjectType)}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {availableSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
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

          {/* 8-Digit Exam Code (Mã số đề thi 8 chữ số) */}
          <div className="bg-blue-50/60 p-3.5 rounded-xl border border-blue-200">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-blue-950 uppercase tracking-wide flex items-center gap-1">
                <span>Mã số đề thi (gồm 8 chữ số)</span>
                <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setExamCode(generate8DigitExamCode())}
                className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 bg-white border border-blue-200 px-2 py-0.5 rounded flex items-center gap-1 transition-colors cursor-pointer"
                title="Tạo mã 8 số ngẫu nhiên mới"
              >
                <Shuffle className="w-3 h-3" />
                <span>Tạo mã mới</span>
              </button>
            </div>
            <input
              type="text"
              maxLength={8}
              value={examCode}
              onChange={(e) => setExamCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="VD: 18492034"
              className="w-full px-3 py-2 text-sm font-mono font-bold tracking-widest text-slate-900 bg-white border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <p className="text-[11px] text-blue-800/80 mt-1">
              Thí sinh sẽ nhập mã 8 số này và họ tên để đăng nhập vào làm bài thi.
            </p>
          </div>

          {/* Random Question Sampler Count */}
          <div className="bg-purple-50/60 p-3.5 rounded-xl border border-purple-200">
            <label className="block text-xs font-bold text-purple-950 uppercase tracking-wide mb-1 flex items-center gap-1">
              <Shuffle className="w-3.5 h-3.5 text-purple-600" />
              <span>Số câu bốc ngẫu nhiên (Ngân hàng đề)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max={questions.length || 100}
                value={randomQuestionCount}
                onChange={(e) => setRandomQuestionCount(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2 text-sm font-mono font-bold text-slate-900 bg-white border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
              />
              <span className="text-xs text-purple-900 font-medium whitespace-nowrap">
                / {questions.length} câu
              </span>
            </div>
            <p className="text-[11px] text-purple-800/80 mt-1">
              {randomQuestionCount > 0
                ? `Hệ thống sẽ chỉ bốc ngẫu nhiên đúng ${randomQuestionCount} câu khi thí sinh làm bài.`
                : 'Để 0 nếu muốn thí sinh thi toàn bộ tất cả các câu hỏi.'}
            </p>
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
                <span>Phạm vi hiển thị & Phân quyền truy cập:</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                  onClick={() => setVisibility('class')}
                  className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    visibility === 'class'
                      ? 'bg-blue-50/80 border-blue-600 text-blue-950 font-bold ring-1 ring-blue-500'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1 text-xs">
                    <Users className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                    <span>Giới hạn trong Lớp</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-normal mt-1 leading-tight">
                    Chỉ người trong lớp mới xem & làm bài
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
                    <span>Người ra đề (Riêng tư)</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-normal mt-1 leading-tight">
                    Không ai khác được xem thử (kể cả HS), khi mở mới cho xem
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
                    Chỉ làm trong tổ hợp thi
                  </p>
                </button>
              </div>

              {/* Classroom Selector if Class Visibility */}
              {visibility === 'class' && (
                <div className="mt-2.5 p-3 bg-blue-50/60 rounded-lg border border-blue-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="font-semibold text-blue-900 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-blue-700" />
                    <span>Chọn Lớp học được phép xem và làm bài thi:</span>
                  </div>
                  <select
                    value={assignedClassId}
                    onChange={(e) => setAssignedClassId(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white border border-blue-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 font-semibold text-slate-900"
                  >
                    {availableClassrooms.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.grade} - {c.students?.length || 0} HS)
                      </option>
                    ))}
                  </select>
                </div>
              )}
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

            {/* Mode selection: Exam vs Practice */}
            <div className="md:col-span-2 pt-2 border-t border-slate-100">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Chế độ cho phép thí sinh: Đề thi thật hay Luyện tập?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                {[
                  { id: 'both', label: 'Cho phép cả Đề thi & Luyện tập', desc: 'Thí sinh tự do chọn vào thi tính giờ hoặc luyện tập có giải thích' },
                  { id: 'exam_only', label: 'Chỉ Đề thi chính thức', desc: 'Bắt buộc tính giờ, nghiêm ngặt, ẩn nút luyện tập tự do' },
                  { id: 'practice_only', label: 'Chỉ Luyện tập tự do', desc: 'Chỉ cho phép ôn luyện, xem gợi ý giải thích từng câu' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setModeType(m.id as any)}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      modeType === m.id
                        ? 'bg-blue-50 border-blue-600 text-blue-950 font-bold ring-1 ring-blue-500 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs">{m.label}</div>
                    <div className="text-[10px] text-slate-500 font-normal mt-0.5 leading-snug">{m.desc}</div>
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
                <span>Giới hạn số lần thoát ra khỏi đề (Chống gian lận):</span>
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
                Khi thí sinh rời màn hình, đổi tab hoặc thu nhỏ trình duyệt quá số lần, hệ thống sẽ tự động thu bài.
              </p>
            </div>

            {/* Anti-Copy and Result Visibility Controls */}
            <div className="md:col-span-2 pt-3 border-t border-slate-100 space-y-3">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Bảo mật chống sao chép & Cài đặt Hiển thị Kết quả
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Anti Copy Switch */}
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="chk_allowCopy"
                    checked={!allowCopy}
                    onChange={(e) => setAllowCopy(!e.target.checked)}
                    className="w-4 h-4 text-rose-600 rounded border-slate-300 mt-0.5 focus:ring-rose-600"
                  />
                  <div>
                    <label htmlFor="chk_allowCopy" className="font-bold text-slate-900 flex items-center gap-1.5 cursor-pointer">
                      <CopySlash className="w-3.5 h-3.5 text-rose-600" />
                      <span>Khóa tính năng Sao chép (Chống copy câu hỏi)</span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                      Khi bật: Vô hiệu hóa bôi đen văn bản, khóa chuột phải và chặn phím tắt Ctrl+C / Cmd+C trong phòng thi.
                    </p>
                  </div>
                </div>

                {/* Show Answers after exam */}
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="chk_showAnswers"
                    checked={showAnswersAfterExam}
                    onChange={(e) => setShowAnswersAfterExam(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 mt-0.5 focus:ring-blue-600"
                  />
                  <div>
                    <label htmlFor="chk_showAnswers" className="font-bold text-slate-900 flex items-center gap-1.5 cursor-pointer">
                      <Eye className="w-3.5 h-3.5 text-blue-600" />
                      <span>Hiện đáp án & lời giải chi tiết sau thi</span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                      Nếu tắt: Thí sinh sau khi nộp bài sẽ không thấy đáp án chi tiết và lời giải (tránh lộ đề cho ca thi sau).
                    </p>
                  </div>
                </div>

                {/* Show Live Score during exam */}
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="chk_liveScore"
                    checked={showLiveScoreDuringExam}
                    onChange={(e) => setShowLiveScoreDuringExam(e.target.checked)}
                    className="w-4 h-4 text-amber-600 rounded border-slate-300 mt-0.5 focus:ring-amber-600"
                  />
                  <div>
                    <label htmlFor="chk_liveScore" className="font-bold text-slate-900 flex items-center gap-1.5 cursor-pointer">
                      <span>Hiện điểm khi thi giữa chừng</span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                      Hiển thị thanh điểm tích lũy trực tiếp ngay trong khi thí sinh đang làm bài thi (phù hợp ôn luyện).
                    </p>
                  </div>
                </div>

                {/* Show Score after exam */}
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="chk_scoreAfter"
                    checked={showScoreAfterExam}
                    onChange={(e) => setShowScoreAfterExam(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 mt-0.5 focus:ring-emerald-600"
                  />
                  <div>
                    <label htmlFor="chk_scoreAfter" className="font-bold text-slate-900 flex items-center gap-1.5 cursor-pointer">
                      <span>Hiện điểm số sau khi kết thúc bài thi</span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                      Nếu tắt: Ẩn bảng điểm sau khi nộp bài, chỉ hiển thị thông báo đã nộp bài thành công (chờ giáo viên công bố).
                    </p>
                  </div>
                </div>

                {/* Lock exit until timeout */}
                <div className="p-3 rounded-lg border border-purple-200 bg-purple-50/50 flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="chk_lockExit"
                    checked={lockExitUntilTimeout}
                    onChange={(e) => setLockExitUntilTimeout(e.target.checked)}
                    className="w-4 h-4 text-purple-600 rounded border-slate-300 mt-0.5 focus:ring-purple-600"
                  />
                  <div>
                    <label htmlFor="chk_lockExit" className="font-bold text-purple-950 flex items-center gap-1.5 cursor-pointer">
                      <Lock className="w-3.5 h-3.5 text-purple-600" />
                      <span>Không cho thoát khỏi giao diện thi đến khi hết giờ</span>
                    </label>
                    <p className="text-[11px] text-purple-900/80 mt-0.5 leading-tight">
                      Khi bật: Thí sinh không thể bấm thoát hoặc rời khỏi phòng thi trước khi hết thời gian làm bài quy định.
                    </p>
                  </div>
                </div>

                {/* Show only student answers after exam */}
                <div className="p-3 rounded-lg border border-cyan-200 bg-cyan-50/50 flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="chk_onlyStudentAnswers"
                    checked={showOnlyStudentAnswersAfterExam}
                    onChange={(e) => setShowOnlyStudentAnswersAfterExam(e.target.checked)}
                    className="w-4 h-4 text-cyan-600 rounded border-slate-300 mt-0.5 focus:ring-cyan-600"
                  />
                  <div>
                    <label htmlFor="chk_onlyStudentAnswers" className="font-bold text-cyan-950 flex items-center gap-1.5 cursor-pointer">
                      <Eye className="w-3.5 h-3.5 text-cyan-700" />
                      <span>Sau khi thi chỉ xem câu trả lời đã làm (Ẩn đáp án)</span>
                    </label>
                    <p className="text-[11px] text-cyan-900/80 mt-0.5 leading-tight">
                      Thí sinh xem lại bài nộp chỉ thấy phương án mình đã chọn hoặc đã nhập, giấu hoàn toàn đáp án chuẩn và lời giải.
                    </p>
                  </div>
                </div>

                {/* Min submit duration */}
                <div className="p-3 rounded-lg border border-indigo-200 bg-indigo-50/50 flex flex-col justify-between gap-1.5">
                  <label className="font-bold text-indigo-950 flex items-center gap-1.5 text-xs">
                    <Clock className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Giới hạn thời gian nộp bài sau (phút):</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={durationMinutes}
                      value={minSubmitMinutes}
                      onChange={(e) => setMinSubmitMinutes(Math.max(0, Number(e.target.value)))}
                      placeholder="0 = nộp bất kỳ lúc nào"
                      className="w-24 px-2.5 py-1 text-xs bg-white border border-indigo-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-600 font-bold"
                    />
                    <span className="text-[11px] text-indigo-900">
                      {minSubmitMinutes > 0 ? `Chỉ được nộp sau khi làm tối thiểu ${minSubmitMinutes} phút` : 'Không giới hạn thời gian nộp sớm'}
                    </span>
                  </div>
                </div>

                {/* Require candidate access security code */}
                <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/50 flex flex-col justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      id="chk_requireAccessCode"
                      checked={requireAccessCode}
                      onChange={(e) => {
                        setRequireAccessCode(e.target.checked);
                        if (e.target.checked && !accessSecurityCode) {
                          setAccessSecurityCode(Math.floor(100000 + Math.random() * 900000).toString());
                        }
                      }}
                      className="w-4 h-4 text-amber-600 rounded border-slate-300 mt-0.5 focus:ring-amber-600"
                    />
                    <div>
                      <label htmlFor="chk_requireAccessCode" className="font-bold text-amber-950 flex items-center gap-1 cursor-pointer">
                        <Lock className="w-3.5 h-3.5 text-amber-700" />
                        <span>Chỉ thí sinh có mã cung cấp mới được làm đề</span>
                      </label>
                      <p className="text-[11px] text-amber-900/80 mt-0.5 leading-tight">
                        Thí sinh phải nhập đúng Mã bảo mật phòng thi do giáo viên cấp mới được bắt đầu làm bài.
                      </p>
                    </div>
                  </div>

                  {requireAccessCode && (
                    <div className="flex items-center gap-2 pl-6">
                      <span className="text-[11px] font-semibold text-amber-950 shrink-0">Mã bảo mật cấp cho HS:</span>
                      <input
                        type="text"
                        value={accessSecurityCode}
                        onChange={(e) => setAccessSecurityCode(e.target.value)}
                        placeholder="VD: 202612 hoặc PIN"
                        className="px-2.5 py-1 text-xs bg-white border border-amber-300 rounded font-mono font-bold text-amber-950 w-36 uppercase tracking-wider"
                      />
                    </div>
                  )}
                </div>
              </div>
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
                    onClick={() => {
                      setSavedQuestionBadgeIndex(qIdx);
                      setSuccessNotice(`✓ Đã lưu câu hỏi #${qIdx + 1} tại chỗ thành công (không thoát ra ngoài)!`);
                      setTimeout(() => {
                        setSavedQuestionBadgeIndex(null);
                        setSuccessNotice('');
                      }, 2500);
                    }}
                    className={`px-2.5 py-1 text-xs rounded-md border flex items-center gap-1 transition-all cursor-pointer ${
                      savedQuestionBadgeIndex === qIdx
                        ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                    }`}
                    title="Lưu câu hỏi này tại chỗ, không thoát ra ngoài"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{savedQuestionBadgeIndex === qIdx ? '✓ Đã lưu câu!' : 'Lưu câu này'}</span>
                  </button>

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

              {/* Image URL / File Upload & Preview */}
              <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-purple-600" />
                    <span>Hình ảnh / Đồ thị câu hỏi (Tùy chọn):</span>
                  </label>
                  {q.imageUrl && (
                    <button
                      type="button"
                      onClick={() => handleUpdateQuestion(qIdx, { imageUrl: '' })}
                      className="text-[11px] text-rose-600 hover:underline cursor-pointer flex items-center gap-1 font-medium"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Xóa ảnh</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    value={q.imageUrl || ''}
                    onChange={(e) => handleUpdateQuestion(qIdx, { imageUrl: e.target.value })}
                    placeholder="Dán link ảnh (https://...) hoặc tải tệp ảnh từ máy tính bên phải..."
                    className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600"
                  />
                  <label className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Tải ảnh từ tệp</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUploadQuestionImage(qIdx, file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                {q.imageUrl && (
                  <div className="mt-3 p-2 bg-white rounded-lg border border-slate-200 flex flex-col items-center">
                    <div className="text-[11px] text-slate-500 mb-1 flex items-center gap-1">
                      <Eye className="w-3 h-3 text-purple-600" />
                      <span>Xem trước hình ảnh đề bài:</span>
                    </div>
                    <img
                      src={q.imageUrl}
                      alt="Xem trước hình"
                      className="max-h-56 rounded-lg border border-slate-200 inline-block shadow-2xs object-contain"
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
                <div className="space-y-4 mb-4">
                  {/* Chế độ chấm điểm câu Đúng / Sai */}
                  <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-bold text-emerald-900 block">
                          Cơ chế gán điểm theo số ý đúng (Quy chế chấm điểm Đúng / Sai):
                        </span>
                        <span className="text-[11px] text-emerald-700">
                          Chọn quy chế chấm chuẩn của Bộ GD&ĐT hoặc tự thiết lập điểm thưởng khi học sinh đúng 1 ý, 2 ý, 3 ý...
                        </span>
                      </div>
                      <div className="inline-flex rounded-lg border border-emerald-300 p-0.5 bg-white text-xs shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const count = (q.tfItems || []).length || 4;
                            const maxP = q.points || 1.0;
                            const standardTiers = count === 4 
                              ? [0.1 * maxP, 0.25 * maxP, 0.5 * maxP, 1.0 * maxP]
                              : Array.from({ length: count }, (_, i) => Number((((i + 1) / count) * maxP).toFixed(2)));
                            handleUpdateQuestion(qIdx, { 
                              tfScoringMode: 'standard_ministry',
                              tfTierPoints: standardTiers
                            });
                          }}
                          className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                            (q.tfScoringMode || 'standard_ministry') === 'standard_ministry'
                              ? 'bg-emerald-700 text-white shadow-2xs'
                              : 'text-emerald-900 hover:bg-emerald-50'
                          }`}
                        >
                          Chuẩn Bộ GD&ĐT 2025
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const count = (q.tfItems || []).length || 4;
                            const maxP = q.points || 1.0;
                            const existingTiers = q.tfTierPoints && q.tfTierPoints.length === count 
                              ? q.tfTierPoints 
                              : Array.from({ length: count }, (_, i) => Number((((i + 1) * 0.25)).toFixed(2)));
                            handleUpdateQuestion(qIdx, { 
                              tfScoringMode: 'tiered',
                              tfTierPoints: existingTiers
                            });
                          }}
                          className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                            q.tfScoringMode === 'tiered'
                              ? 'bg-emerald-700 text-white shadow-2xs'
                              : 'text-emerald-900 hover:bg-emerald-50'
                          }`}
                        >
                          Tùy chỉnh bậc số ý
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleUpdateQuestion(qIdx, { tfScoringMode: 'divide_equally' });
                          }}
                          className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                            q.tfScoringMode === 'divide_equally'
                              ? 'bg-emerald-700 text-white shadow-2xs'
                              : 'text-emerald-900 hover:bg-emerald-50'
                          }`}
                        >
                          Chia đều điểm
                        </button>
                      </div>
                    </div>

                    {/* Hiển thị chi tiết bảng điểm theo từng bậc */}
                    {q.tfScoringMode === 'tiered' && (
                      <div className="p-2.5 bg-white rounded-lg border border-emerald-200 mt-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-700">
                            Cài đặt điểm nhận được tương ứng với số ý trả lời đúng:
                          </span>
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <span className="text-slate-500">Mẫu nhanh:</span>
                            <button
                              type="button"
                              onClick={() => {
                                const count = (q.tfItems || []).length || 4;
                                handleUpdateQuestion(qIdx, { 
                                  tfTierPoints: count === 4 ? [0.1, 0.25, 0.5, 1.0] : [0.2, 0.4, 0.7, 1.0]
                                });
                              }}
                              className="px-2 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-semibold cursor-pointer"
                            >
                              Chuẩn Bộ (0.1 - 0.25 - 0.5 - 1.0)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const count = (q.tfItems || []).length || 4;
                                handleUpdateQuestion(qIdx, { 
                                  tfTierPoints: count === 4 ? [0.25, 0.5, 0.75, 1.0] : [0.2, 0.4, 0.6, 0.8]
                                });
                              }}
                              className="px-2 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-semibold cursor-pointer"
                            >
                              Bậc đều (0.25 - 0.5 - 0.75 - 1.0)
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                          {(q.tfItems || []).map((_, tIdx) => {
                            const curTiers = q.tfTierPoints || [0.1, 0.25, 0.5, 1.0];
                            const curVal = curTiers[tIdx] !== undefined ? curTiers[tIdx] : 0;
                            return (
                              <div key={tIdx} className="p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-1.5">
                                <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                                  Đúng {tIdx + 1} ý:
                                </span>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    step="0.05"
                                    min="0"
                                    value={curVal}
                                    onChange={(e) => {
                                      const nextTiers = [...(q.tfTierPoints || [0.1, 0.25, 0.5, 1.0])];
                                      while (nextTiers.length <= tIdx) nextTiers.push(0);
                                      nextTiers[tIdx] = parseFloat(e.target.value) || 0;
                                      handleUpdateQuestion(qIdx, { tfTierPoints: nextTiers });
                                    }}
                                    className="w-16 px-1.5 py-1 text-xs font-bold text-center bg-white border border-slate-300 rounded focus:ring-1 focus:ring-emerald-600 focus:outline-none font-mono"
                                  />
                                  <span className="text-[11px] text-slate-500 font-bold">đ</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {(!q.tfScoringMode || q.tfScoringMode === 'standard_ministry') && (
                      <div className="text-[11px] text-emerald-800 bg-white/80 p-2 rounded border border-emerald-200/60 flex items-center justify-between flex-wrap gap-2">
                        <span>
                          ★ <strong>Quy chế Bộ GD&ĐT 2025:</strong> Thí sinh chỉ đúng 1 ý được <strong>{(0.1 * (q.points || 1.0)).toFixed(2)}đ</strong> (10%), đúng 2 ý được <strong>{(0.25 * (q.points || 1.0)).toFixed(2)}đ</strong> (25%), đúng 3 ý được <strong>{(0.5 * (q.points || 1.0)).toFixed(2)}đ</strong> (50%), đúng cả 4 ý được tối đa <strong>{(q.points || 1.0).toFixed(2)}đ</strong> (100%).
                        </span>
                      </div>
                    )}

                    {q.tfScoringMode === 'divide_equally' && (
                      <div className="text-[11px] text-slate-600 bg-white/80 p-2 rounded border border-slate-200">
                        Mỗi ý mệnh đề có giá trị điểm bằng nhau = <strong>{((q.points || 1.0) / ((q.tfItems || []).length || 1)).toFixed(2)} điểm/ý</strong>.
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">
                        Danh sách các ý mệnh đề (Chọn ĐÚNG hoặc SAI):
                      </label>
                      <div className="text-[11px] text-slate-500">
                        * Tích chọn đáp án ĐÚNG hoặc SAI cho từng ý bên dưới.
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
                    <div key={subQ.id} className="p-3.5 bg-white rounded-xl border border-purple-200 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-purple-900 flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-800 flex items-center justify-center text-[11px] font-bold">
                            {sIdx + 1}
                          </span>
                          <span>Câu con {qIdx + 1}.{sIdx + 1}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 font-medium">Điểm:</span>
                          <input
                            type="number"
                            step="0.25"
                            value={subQ.points}
                            onChange={(e) => {
                              const nextSubs = [...(q.subQuestions || [])];
                              nextSubs[sIdx].points = parseFloat(e.target.value) || 0.5;
                              handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                            }}
                            className="w-16 px-2 py-0.5 text-xs border border-slate-200 rounded font-mono"
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

                      {/* Sub question statement text */}
                      <input
                        type="text"
                        value={subQ.question}
                        onChange={(e) => {
                          const nextSubs = [...(q.subQuestions || [])];
                          nextSubs[sIdx].question = e.target.value;
                          handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                        }}
                        placeholder="Nội dung câu hỏi con..."
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600"
                      />

                      {/* Sub question prompt image upload */}
                      <div className="p-2.5 bg-purple-50/50 rounded-lg border border-purple-100 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-semibold text-purple-900 flex items-center gap-1">
                            <ImageIcon className="w-3 h-3 text-purple-600" />
                            <span>Ảnh đề bài câu con (Tùy chọn):</span>
                          </label>
                          {subQ.imageUrl && (
                            <button
                              type="button"
                              onClick={() => {
                                const nextSubs = [...(q.subQuestions || [])];
                                nextSubs[sIdx] = { ...nextSubs[sIdx], imageUrl: '' };
                                handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                              }}
                              className="text-[10px] text-rose-600 hover:underline cursor-pointer flex items-center gap-0.5"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                              <span>Xóa ảnh</span>
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={subQ.imageUrl || ''}
                            onChange={(e) => {
                              const nextSubs = [...(q.subQuestions || [])];
                              nextSubs[sIdx] = { ...nextSubs[sIdx], imageUrl: e.target.value };
                              handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                            }}
                            placeholder="Dán link ảnh hoặc tải tệp..."
                            className="flex-1 px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-600"
                          />
                          <label className="px-2 py-1 bg-white hover:bg-purple-100 text-purple-700 border border-purple-200 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0">
                            <Upload className="w-3 h-3" />
                            <span>Tải tệp</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUploadSubQuestionImage(qIdx, sIdx, file);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        </div>
                        {subQ.imageUrl && (
                          <div className="pt-1 text-center">
                            <img
                              src={subQ.imageUrl}
                              alt={`Hình câu con ${sIdx + 1}`}
                              className="max-h-36 rounded border border-purple-200 inline-block shadow-2xs object-contain bg-white"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        )}
                      </div>

                      {/* Sub question format selector: Single choice vs Short text input */}
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[11px] font-bold text-slate-700">Dạng câu con:</span>
                        <div className="inline-flex rounded-lg border border-purple-200 p-0.5 bg-purple-50/60 text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              const nextSubs = [...(q.subQuestions || [])];
                              nextSubs[sIdx] = {
                                ...nextSubs[sIdx],
                                type: 'single_choice',
                                options: nextSubs[sIdx].options && nextSubs[sIdx].options!.length > 0 ? nextSubs[sIdx].options : ['', '', '', ''],
                                correctAnswer: nextSubs[sIdx].correctAnswer ?? 0,
                              };
                              handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                            }}
                            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                              (subQ.type || 'single_choice') === 'single_choice'
                                ? 'bg-purple-700 text-white shadow-xs'
                                : 'text-purple-900 hover:bg-purple-100'
                            }`}
                          >
                            Trắc nghiệm (A, B, C, D)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const nextSubs = [...(q.subQuestions || [])];
                              nextSubs[sIdx] = {
                                ...nextSubs[sIdx],
                                type: 'text_input',
                                acceptedAnswers: nextSubs[sIdx].acceptedAnswers && nextSubs[sIdx].acceptedAnswers!.length > 0 ? nextSubs[sIdx].acceptedAnswers : [''],
                              };
                              handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                            }}
                            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                              subQ.type === 'text_input'
                                ? 'bg-purple-700 text-white shadow-xs'
                                : 'text-purple-900 hover:bg-purple-100'
                            }`}
                          >
                            Trả lời ngắn (Điền từ/số)
                          </button>
                        </div>
                      </div>

                      {/* Format A: Single choice options with image support */}
                      {(subQ.type || 'single_choice') === 'single_choice' && (
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-bold text-slate-700">
                              Các phương án lựa chọn (Click nút chữ cái để chọn đáp án đúng):
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                const nextSubs = [...(q.subQuestions || [])];
                                const sub = { ...nextSubs[sIdx] };
                                sub.options = [...(sub.options || []), ''];
                                sub.optionImages = sub.optionImages ? [...sub.optionImages, undefined] : undefined;
                                nextSubs[sIdx] = sub;
                                handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                              }}
                              className="text-[11px] font-semibold text-purple-700 hover:underline flex items-center gap-0.5 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" /> Thêm phương án
                            </button>
                          </div>

                          <div className="space-y-2">
                            {(subQ.options || []).map((sOpt, sOptIdx) => {
                              const sLetter = String.fromCharCode(65 + sOptIdx);
                              const isCorr = subQ.correctAnswer === sOptIdx;
                              const subOptImg = subQ.optionImages?.[sOptIdx];
                              const isSubImgEditing =
                                activeSubOptImgEdit?.qIdx === qIdx &&
                                activeSubOptImgEdit?.subIdx === sIdx &&
                                activeSubOptImgEdit?.optIdx === sOptIdx;

                              return (
                                <div key={sOptIdx} className="p-2 rounded-lg border border-slate-200 bg-slate-50/50 space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextSubs = [...(q.subQuestions || [])];
                                        nextSubs[sIdx].correctAnswer = sOptIdx;
                                        handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                                      }}
                                      className={`w-6 h-6 rounded text-xs font-bold border transition-colors cursor-pointer shrink-0 ${
                                        isCorr
                                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs ring-1 ring-emerald-300'
                                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                      }`}
                                      title="Chọn làm đáp án đúng"
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
                                      placeholder={`Nội dung ý ${sLetter} (chữ, công thức hoặc dùng ảnh)...`}
                                      className="flex-1 px-2.5 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-600"
                                    />

                                    {/* Sub Option Image Toggle Button */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isSubImgEditing) {
                                          setActiveSubOptImgEdit(null);
                                        } else {
                                          setActiveSubOptImgEdit({ qIdx, subIdx: sIdx, optIdx: sOptIdx });
                                        }
                                      }}
                                      className={`px-2 py-1 rounded border text-[11px] flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
                                        subOptImg
                                          ? 'bg-purple-100 text-purple-700 border-purple-300 font-semibold'
                                          : isSubImgEditing
                                          ? 'bg-slate-800 text-white border-slate-800'
                                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                      }`}
                                      title="Tải ảnh hoặc dán URL ảnh cho đáp án này"
                                    >
                                      <ImageIcon className="w-3 h-3" />
                                      <span>{subOptImg ? 'Có ảnh' : 'Ảnh'}</span>
                                    </button>

                                    {(subQ.options || []).length > 2 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const nextSubs = [...(q.subQuestions || [])];
                                          const sub = { ...nextSubs[sIdx] };
                                          sub.options = (sub.options || []).filter((_, i) => i !== sOptIdx);
                                          if (sub.optionImages) {
                                            sub.optionImages = sub.optionImages.filter((_, i) => i !== sOptIdx);
                                          }
                                          if (sub.correctAnswer !== undefined && sub.correctAnswer >= sub.options.length) {
                                            sub.correctAnswer = sub.options.length - 1;
                                          }
                                          nextSubs[sIdx] = sub;
                                          handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                                        }}
                                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer shrink-0"
                                        title="Xóa ý này"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>

                                  {/* Drawer for sub option image */}
                                  {(isSubImgEditing || subOptImg) && (
                                    <div className="pt-1.5 pl-7 pr-1 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-purple-50/60 p-2 rounded">
                                      <div className="flex-1 flex items-center gap-1.5">
                                        <input
                                          type="text"
                                          value={subOptImg || ''}
                                          onChange={(e) => handleUpdateSubOptionImage(qIdx, sIdx, sOptIdx, e.target.value)}
                                          placeholder="Dán link ảnh đáp án hoặc chọn tệp..."
                                          className="flex-1 px-2 py-0.5 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-600"
                                        />
                                        <label className="px-2 py-0.5 bg-white hover:bg-purple-100 text-purple-700 border border-purple-300 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0">
                                          <Upload className="w-3 h-3" />
                                          <span>Tải tệp</span>
                                          <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                              const file = e.target.files?.[0];
                                              if (file) handleFileUploadSubOptionImage(qIdx, sIdx, sOptIdx, file);
                                              e.target.value = '';
                                            }}
                                          />
                                        </label>
                                      </div>

                                      {subOptImg && (
                                        <div className="flex items-center gap-2 shrink-0">
                                          <img
                                            src={subOptImg}
                                            alt={`Ảnh đáp án ${sLetter}`}
                                            className="h-10 w-auto max-w-[80px] rounded border border-purple-200 object-contain bg-white shadow-2xs"
                                            referrerPolicy="no-referrer"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => handleUpdateSubOptionImage(qIdx, sIdx, sOptIdx, '')}
                                            className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                            title="Xóa ảnh đáp án"
                                          >
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Format B: Short answer (Trả lời ngắn) */}
                      {subQ.type === 'text_input' && (
                        <div className="p-3 bg-purple-50/70 rounded-xl border border-purple-200 space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-purple-950">
                              Các đáp án được chấp nhận (cách nhau bởi dấu phẩy):
                            </label>
                            <span className="text-[11px] text-purple-700 font-medium">
                              Tự động chuẩn hóa dấu phẩy/chấm và chữ hoa/thường
                            </span>
                          </div>
                          <input
                            type="text"
                            value={(subQ.acceptedAnswers || []).join(', ')}
                            onChange={(e) => {
                              const nextSubs = [...(q.subQuestions || [])];
                              nextSubs[sIdx] = {
                                ...nextSubs[sIdx],
                                acceptedAnswers: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                              };
                              handleUpdateQuestion(qIdx, { subQuestions: nextSubs });
                            }}
                            placeholder="Ví dụ: 3.14, 22/7, pi, x=2, BaCl2"
                            className="w-full px-3 py-2 text-xs font-mono bg-white border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                          />
                          <p className="text-[11px] text-slate-500">
                            * Thí sinh điền một trong các đáp án này sẽ đạt trọn vẹn điểm câu con ({subQ.points || 0.5} đ).
                          </p>
                        </div>
                      )}
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

      {/* Bottom Sticky Action Bar */}
      <div className="sticky bottom-4 z-30 mt-8 p-4 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-300 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleFinalSave(true)}
            className="py-2.5 px-4 text-xs sm:text-sm font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Lưu đề thi tại đây (Không thoát tab)</span>
          </button>

          {inPlaceSaveToast && (
            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg animate-in fade-in">
              {inPlaceSaveToast}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="py-2.5 px-4 text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Hủy & Quay lại
          </button>
          <button
            type="button"
            onClick={() => handleFinalSave(false)}
            className="py-2.5 px-5 text-xs sm:text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-2 shadow-md cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{isEditing ? 'Lưu thay đổi đề thi' : 'Lưu & Xuất bản đề thi'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
