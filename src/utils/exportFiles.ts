import * as XLSX from 'xlsx';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IRunOptions,
} from 'docx';
import {
  Classroom,
  Exam,
  ExamResult,
  MicroCourse,
  Question,
  StudentCourseProgress,
  StudentMember,
  UserAccount,
} from '../types/exam';
import {
  calculateCourseProgressPercentage,
  getAllLessonsFromCourse,
  getCourseTrackingUnits,
  getStudentCourseProgress,
  syncCourseScormState,
} from './storage';
import {
  buildQuestionClusters,
  formatAcceptedShortAnswersList,
  formatShortAnswerDecimalComma,
  formatTrueFalseScoringRule,
} from './scoring';
import { formatMatchingLabel, getDisplayedLabelForAnswerValue } from './matching';
import { buildDocxMathTextRuns, formatMathToReadableText } from './mathUnicode';
import { resolveImplicitImage } from './inlineImages';

const SUBJECT_NAMES: Record<string, string> = {
  math: 'Toán học',
  english: 'Tiếng Anh',
  physics: 'Vật lý',
  chemistry: 'Hóa học',
  history: 'Lịch sử',
  it: 'Tin học & CNTT',
  biology: 'Sinh học',
  general: 'Tổng hợp',
};

function sanitizeFileName(name: string): string {
  return name
    .normalize('NFC')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 100) || 'EduTest_Export';
}

function formatDurationVietnamese(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}g ${m}p ${s}s`;
  if (m > 0) return `${m} phút ${s > 0 ? `${s} giây` : ''}`.trim();
  return `${s} giây`;
}

function getAcademicTierLabel(scoreOnTen: number): string {
  if (scoreOnTen >= 9.0) return 'Xuất sắc';
  if (scoreOnTen >= 8.0) return 'Giỏi';
  if (scoreOnTen >= 6.5) return 'Khá';
  if (scoreOnTen >= 5.0) return 'Trung bình';
  return 'Yếu';
}

export interface ExportExcelOptions {
  fileName?: string;
  className?: string;
  examTitle?: string;
}

/**
 * Xuất file Excel (.xlsx) danh sách kết quả thi của các học sinh kèm sheet thống kê tổng hợp.
 */
export function exportResultsToExcel(
  results: ExamResult[],
  options: ExportExcelOptions = {}
): { success: boolean; count: number; fileName: string } {
  const sorted = [...results].sort((a, b) => {
    const scoreA = a.scoreOnTenScale ?? (a.earnedPoints / (a.totalPoints || 10)) * 10;
    const scoreB = b.scoreOnTenScale ?? (b.earnedPoints / (b.totalPoints || 10)) * 10;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return (a.timeSpentSeconds || 0) - (b.timeSpentSeconds || 0);
  });

  const detailRows = sorted.map((res, idx) => {
    const totalPts = res.totalPoints || 10;
    const earnedPts = res.earnedPoints ?? (res.score * totalPts) / 10;
    const score10 =
      res.scoreOnTenScale !== undefined
        ? Number(res.scoreOnTenScale.toFixed(2))
        : Number(((earnedPts / totalPts) * 10).toFixed(2));

    const completedDate = res.completedAt
      ? new Date(res.completedAt).toLocaleString('vi-VN')
      : '';

    const noteParts: string[] = [];
    if (res.submissionReason) noteParts.push(res.submissionReason);
    if (res.tabSwitchCount && res.tabSwitchCount > 0) {
      noteParts.push(`Rời màn hình: ${res.tabSwitchCount} lần`);
    }

    return {
      STT: idx + 1,
      'Họ và tên học sinh': res.studentName || 'Thí sinh tự do',
      'SBD / Mã HS': res.studentCode || '—',
      'Lớp học': options.className || res.classId || 'Tự do',
      'Tên đề thi': res.examTitle || '',
      'Môn học': SUBJECT_NAMES[res.subject] || res.subject || '',
      'Khối / Cấp': res.grade || '',
      'Điểm đạt được': Number(earnedPts.toFixed(2)),
      'Tổng điểm đề': Number(totalPts.toFixed(2)),
      'Điểm (Thang 10)': score10,
      'Xếp loại học lực': getAcademicTierLabel(score10),
      'Số câu đúng': res.correctCount ?? 0,
      'Đúng một phần': res.partialCount ?? 0,
      'Số câu sai': res.wrongCount ?? 0,
      'Tổng số câu': res.totalQuestions ?? 0,
      'Thời gian làm bài': formatDurationVietnamese(res.timeSpentSeconds),
      'Thời điểm nộp bài': completedDate,
      'Ghi chú': noteParts.join(' | ') || 'Nộp bình thường',
    };
  });

  const wb = XLSX.utils.book_new();

  const detailSheet =
    detailRows.length > 0
      ? XLSX.utils.json_to_sheet(detailRows)
      : XLSX.utils.aoa_to_sheet([
          [
            'STT',
            'Họ và tên học sinh',
            'SBD / Mã HS',
            'Lớp học',
            'Tên đề thi',
            'Môn học',
            'Khối / Cấp',
            'Điểm đạt được',
            'Tổng điểm đề',
            'Điểm (Thang 10)',
            'Xếp loại học lực',
            'Số câu đúng',
            'Đúng một phần',
            'Số câu sai',
            'Tổng số câu',
            'Thời gian làm bài',
            'Thời điểm nộp bài',
            'Ghi chú',
          ],
          ['Chưa có lượt làm bài nào được ghi nhận.'],
        ]);

  detailSheet['!cols'] = [
    { wch: 6 },
    { wch: 24 },
    { wch: 14 },
    { wch: 18 },
    { wch: 34 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 13 },
    { wch: 16 },
    { wch: 16 },
    { wch: 13 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 20 },
    { wch: 28 },
  ];

  XLSX.utils.book_append_sheet(wb, detailSheet, 'Kết quả học sinh');

  // Sheet 2: Tổng hợp thống kê
  const scores10 = sorted.map((r) =>
    r.scoreOnTenScale !== undefined
      ? r.scoreOnTenScale
      : ((r.earnedPoints ?? (r.score * (r.totalPoints || 10)) / 10) / (r.totalPoints || 10)) * 10
  );
  const totalCount = scores10.length;
  const avg = totalCount > 0 ? scores10.reduce((a, b) => a + b, 0) / totalCount : 0;
  const maxScore = totalCount > 0 ? Math.max(...scores10) : 0;
  const minScore = totalCount > 0 ? Math.min(...scores10) : 0;
  const passCount = scores10.filter((s) => s >= 5.0).length;
  const passRate = totalCount > 0 ? Math.round((passCount / totalCount) * 100) : 0;

  const tiers = {
    excellent: scores10.filter((s) => s >= 9.0).length,
    good: scores10.filter((s) => s >= 8.0 && s < 9.0).length,
    fair: scores10.filter((s) => s >= 6.5 && s < 8.0).length,
    average: scores10.filter((s) => s >= 5.0 && s < 6.5).length,
    poor: scores10.filter((s) => s < 5.0).length,
  };

  // Nhóm theo đề thi
  const byExamMap = new Map<string, { title: string; scores: number[] }>();
  sorted.forEach((r, idx) => {
    const key = r.examId || r.examTitle;
    const entry = byExamMap.get(key) || { title: r.examTitle, scores: [] };
    entry.scores.push(scores10[idx]);
    byExamMap.set(key, entry);
  });

  const summaryAoa: (string | number)[][] = [
    ['BÁO CÁO THỐNG KÊ KẾT QUẢ THI HỌC SINH — EDUTEST'],
    ['Lớp / Phạm vi', options.className || 'Tất cả kết quả'],
    ['Đề thi', options.examTitle || 'Tất cả đề thi'],
    ['Ngày xuất báo cáo', new Date().toLocaleString('vi-VN')],
    [],
    ['CHỈ SỐ TỔNG QUAN', 'GIÁ TRỊ'],
    ['Tổng số bài thi đã nộp', totalCount],
    ['Điểm trung bình (Thang 10)', Number(avg.toFixed(2))],
    ['Điểm cao nhất', Number(maxScore.toFixed(2))],
    ['Điểm thấp nhất', Number(minScore.toFixed(2))],
    ['Số bài đạt yêu cầu (>= 5.0)', passCount],
    ['Tỷ lệ đạt (%)', `${passRate}%`],
    [],
    ['PHÂN LOẠI HỌC LỰC (THANG 10)', 'SỐ LƯỢNG', 'TỶ LỆ (%)'],
    ['Xuất sắc (9.0 - 10.0)', tiers.excellent, totalCount > 0 ? Math.round((tiers.excellent / totalCount) * 100) : 0],
    ['Giỏi (8.0 - 8.9)', tiers.good, totalCount > 0 ? Math.round((tiers.good / totalCount) * 100) : 0],
    ['Khá (6.5 - 7.9)', tiers.fair, totalCount > 0 ? Math.round((tiers.fair / totalCount) * 100) : 0],
    ['Trung bình (5.0 - 6.4)', tiers.average, totalCount > 0 ? Math.round((tiers.average / totalCount) * 100) : 0],
    ['Yếu (< 5.0)', tiers.poor, totalCount > 0 ? Math.round((tiers.poor / totalCount) * 100) : 0],
    [],
    ['THỐNG KÊ THEO TỪNG ĐỀ THI', 'SỐ BÀI NỘP', 'ĐIỂM TB', 'CAO NHẤT', 'THẤP NHẤT', 'TỶ LỆ ĐẠT (%)'],
  ];

  Array.from(byExamMap.values()).forEach((item) => {
    const n = item.scores.length;
    const itemAvg = n > 0 ? item.scores.reduce((a, b) => a + b, 0) / n : 0;
    const itemMax = n > 0 ? Math.max(...item.scores) : 0;
    const itemMin = n > 0 ? Math.min(...item.scores) : 0;
    const itemPass = n > 0 ? Math.round((item.scores.filter((s) => s >= 5.0).length / n) * 100) : 0;
    summaryAoa.push([
      item.title,
      n,
      Number(itemAvg.toFixed(2)),
      Number(itemMax.toFixed(2)),
      Number(itemMin.toFixed(2)),
      itemPass,
    ]);
  });

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryAoa);
  summarySheet['!cols'] = [
    { wch: 38 },
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Thống kê tổng hợp');

  const dateTag = new Date().toISOString().slice(0, 10);
  const baseName =
    options.fileName ||
    sanitizeFileName(
      `KetQuaThi_${options.className || options.examTitle || 'HocSinh'}_${dateTag}`
    );
  const finalName = baseName.endsWith('.xlsx') ? baseName : `${baseName}.xlsx`;

  XLSX.writeFile(wb, finalName);
  return { success: true, count: sorted.length, fileName: finalName };
}

function getScore10(r: ExamResult): number {
  if (r.scoreOnTenScale !== undefined && !Number.isNaN(r.scoreOnTenScale)) {
    return Number(r.scoreOnTenScale.toFixed(2));
  }
  const totalPts = r.totalPoints || 10;
  const earnedPts = r.earnedPoints ?? ((r.score ?? 0) * totalPts) / 10;
  return Number(((earnedPts / totalPts) * 10).toFixed(2));
}

export function doesResultBelongToStudent(
  result: ExamResult,
  student: { id?: string; email?: string; studentCode?: string; name?: string }
): boolean {
  if (student.id && result.userId && result.userId === student.id) return true;
  if (
    student.email &&
    result.userEmail &&
    result.userEmail.trim().toLowerCase() === student.email.trim().toLowerCase()
  ) {
    return true;
  }
  if (
    student.studentCode &&
    result.studentCode &&
    result.studentCode.trim().toUpperCase() === student.studentCode.trim().toUpperCase()
  ) {
    return true;
  }
  return false;
}

function findLinkedUserForMember(
  member: StudentMember,
  allUsers: UserAccount[]
): UserAccount | undefined {
  return allUsers.find(
    (u) =>
      u.id === member.id ||
      (member.email && u.email && u.email.toLowerCase() === member.email.toLowerCase()) ||
      (member.studentCode &&
        u.studentCode &&
        u.studentCode.trim().toUpperCase() === member.studentCode.trim().toUpperCase())
  );
}

function doesResultMatchClassMember(
  result: ExamResult,
  member: StudentMember,
  allUsers: UserAccount[]
): boolean {
  if (doesResultBelongToStudent(result, member)) return true;
  const linked = findLinkedUserForMember(member, allUsers);
  if (linked) {
    return doesResultBelongToStudent(result, {
      id: linked.id,
      email: linked.email,
      studentCode: linked.studentCode,
      name: linked.fullName,
    });
  }
  return false;
}

export interface ExportClassroomExamExcelOptions {
  classroom: Classroom;
  exam: Exam;
  results: ExamResult[];
  allUsers?: UserAccount[];
}

function isTeacherAccountResult(result: ExamResult, allUsers: UserAccount[]): boolean {
  const email = (result.userEmail || '').trim().toLowerCase();
  if (email === 'tranquangnhat418@gmail.com') return true;
  return allUsers.some(
    (u) =>
      (u.role === 'teacher' ||
        u.isMasterAdmin ||
        u.email?.toLowerCase() === 'tranquangnhat418@gmail.com') &&
      ((result.userId && u.id === result.userId) ||
        (email && u.email && u.email.trim().toLowerCase() === email))
  );
}

/**
 * Chế độ 1 (Chỉ Giáo viên): Xuất file Excel kết quả của TỪNG BÀI THI TRONG LỚP.
 * Bao gồm: (1) Danh sách toàn bộ học sinh lớp (kèm trạng thái Đã nộp / Chưa làm, điểm cao nhất, gần nhất),
 * (2) Chi tiết các lượt làm bài, (3) Thống kê phân tích bài thi.
 */
export function exportClassroomExamResultsToExcel({
  classroom,
  exam,
  results,
  allUsers = [],
}: ExportClassroomExamExcelOptions): { success: boolean; count: number; fileName: string } {
  const students = classroom.students || [];
  const examAttempts = results
    .filter(
      (r) =>
        !isTeacherAccountResult(r, allUsers) &&
        r.examId === exam.id &&
        (r.classId === classroom.id ||
          classroom.assignedExamIds?.includes(r.examId) ||
          students.some((st) => doesResultMatchClassMember(r, st, allUsers)))
    )
    .sort((a, b) => {
      const diff = getScore10(b) - getScore10(a);
      if (diff !== 0) return diff;
      return (a.timeSpentSeconds || 0) - (b.timeSpentSeconds || 0);
    });

  const matchedAttemptIds = new Set<string>();
  const studentRows = students.map((st, idx) => {
    const attempts = examAttempts.filter((r) => doesResultMatchClassMember(r, st, allUsers));
    attempts.forEach((a) => matchedAttemptIds.add(a.id));

    if (attempts.length === 0) {
      return {
        STT: idx + 1,
        'Họ và tên học sinh': st.name,
        'SBD / Mã HS': st.studentCode || '—',
        Email: st.email || '—',
        'Trạng thái': 'Chưa làm',
        'Số lượt nộp': 0,
        'Điểm cao nhất (Thang 10)': '—' as string | number,
        'Điểm lần gần nhất': '—' as string | number,
        'Xếp loại (Cao nhất)': 'Chưa có',
        'Số câu đúng (Tốt nhất)': '—',
        'Thời gian làm (Tốt nhất)': '—',
        'Thời điểm nộp gần nhất': '—',
      };
    }

    const best = [...attempts].sort((a, b) => {
      const d = getScore10(b) - getScore10(a);
      return d !== 0 ? d : (a.timeSpentSeconds || 0) - (b.timeSpentSeconds || 0);
    })[0];
    const latest = [...attempts].sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    )[0];

    const bestScore10 = getScore10(best);
    const latestScore10 = getScore10(latest);

    return {
      STT: idx + 1,
      'Họ và tên học sinh': st.name,
      'SBD / Mã HS': st.studentCode || '—',
      Email: st.email || '—',
      'Trạng thái': 'Đã nộp',
      'Số lượt nộp': attempts.length,
      'Điểm cao nhất (Thang 10)': bestScore10,
      'Điểm lần gần nhất': latestScore10,
      'Xếp loại (Cao nhất)': getAcademicTierLabel(bestScore10),
      'Số câu đúng (Tốt nhất)': `${best.correctCount ?? 0}/${best.totalQuestions ?? exam.questions.length}`,
      'Thời gian làm (Tốt nhất)': formatDurationVietnamese(best.timeSpentSeconds),
      'Thời điểm nộp gần nhất': latest.completedAt
        ? new Date(latest.completedAt).toLocaleString('vi-VN')
        : '—',
    };
  });

  // Bổ sung các lượt nộp trong lớp chưa khớp tên trong danh sách thành viên (nếu có)
  const unmatchedAttempts = examAttempts.filter((a) => !matchedAttemptIds.has(a.id));
  unmatchedAttempts.forEach((att, extraIdx) => {
    const s10 = getScore10(att);
    studentRows.push({
      STT: students.length + extraIdx + 1,
      'Họ và tên học sinh': att.studentName || 'Thí sinh ngoài danh sách',
      'SBD / Mã HS': att.studentCode || '—',
      Email: att.userEmail || '—',
      'Trạng thái': 'Đã nộp',
      'Số lượt nộp': 1,
      'Điểm cao nhất (Thang 10)': s10,
      'Điểm lần gần nhất': s10,
      'Xếp loại (Cao nhất)': getAcademicTierLabel(s10),
      'Số câu đúng (Tốt nhất)': `${att.correctCount ?? 0}/${att.totalQuestions ?? exam.questions.length}`,
      'Thời gian làm (Tốt nhất)': formatDurationVietnamese(att.timeSpentSeconds),
      'Thời điểm nộp gần nhất': att.completedAt
        ? new Date(att.completedAt).toLocaleString('vi-VN')
        : '—',
    });
  });

  const attemptRows = examAttempts.map((res, idx) => {
    const totalPts = res.totalPoints || 10;
    const earnedPts = res.earnedPoints ?? (res.score * totalPts) / 10;
    const score10 = getScore10(res);
    const noteParts: string[] = [];
    if (res.submissionReason) noteParts.push(res.submissionReason);
    if (res.tabSwitchCount && res.tabSwitchCount > 0) {
      noteParts.push(`Rời màn hình: ${res.tabSwitchCount} lần`);
    }
    return {
      STT: idx + 1,
      'Họ và tên học sinh': res.studentName || 'Thí sinh',
      'SBD / Mã HS': res.studentCode || '—',
      Email: res.userEmail || '—',
      'Điểm đạt được': Number(earnedPts.toFixed(2)),
      'Tổng điểm đề': Number(totalPts.toFixed(2)),
      'Điểm (Thang 10)': score10,
      'Xếp loại': getAcademicTierLabel(score10),
      'Số câu đúng': res.correctCount ?? 0,
      'Đúng một phần': res.partialCount ?? 0,
      'Số câu sai': res.wrongCount ?? 0,
      'Tổng số câu': res.totalQuestions ?? 0,
      'Thời gian làm bài': formatDurationVietnamese(res.timeSpentSeconds),
      'Thời điểm nộp bài': res.completedAt ? new Date(res.completedAt).toLocaleString('vi-VN') : '',
      'Ghi chú': noteParts.join(' | ') || 'Nộp bình thường',
    };
  });

  const wb = XLSX.utils.book_new();

  const sheetStudents =
    studentRows.length > 0
      ? XLSX.utils.json_to_sheet(studentRows)
      : XLSX.utils.aoa_to_sheet([
          ['Danh sách học sinh trong lớp hiện đang trống.'],
        ]);
  sheetStudents['!cols'] = [
    { wch: 6 },
    { wch: 24 },
    { wch: 15 },
    { wch: 24 },
    { wch: 13 },
    { wch: 12 },
    { wch: 22 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 22 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, sheetStudents, 'Theo danh sách HS');

  const sheetAttempts =
    attemptRows.length > 0
      ? XLSX.utils.json_to_sheet(attemptRows)
      : XLSX.utils.aoa_to_sheet([
          ['Chưa có lượt nộp bài nào cho đề thi này trong lớp.'],
        ]);
  sheetAttempts['!cols'] = [
    { wch: 6 },
    { wch: 24 },
    { wch: 15 },
    { wch: 24 },
    { wch: 14 },
    { wch: 13 },
    { wch: 16 },
    { wch: 15 },
    { wch: 13 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 22 },
    { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, sheetAttempts, 'Chi tiết lượt nộp');

  const submittedStudentCount = students.filter((st) =>
    examAttempts.some((r) => doesResultMatchClassMember(r, st, allUsers))
  ).length;
  const scores = examAttempts.map(getScore10);
  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const maxS = scores.length > 0 ? Math.max(...scores) : 0;
  const minS = scores.length > 0 ? Math.min(...scores) : 0;
  const passCount = scores.filter((s) => s >= 5.0).length;
  const passRate = scores.length > 0 ? Math.round((passCount / scores.length) * 100) : 0;
  const participationRate =
    students.length > 0 ? Math.round((submittedStudentCount / students.length) * 100) : 0;

  const statsAoa: (string | number)[][] = [
    ['BÁO CÁO KẾT QUẢ BÀI THI TRONG LỚP — EDUTEST'],
    ['Lớp học', `${classroom.name} (${classroom.grade})`],
    ['Mã lớp', classroom.code],
    ['Giáo viên phụ trách', classroom.teacherName],
    ['Đề thi', exam.title],
    ['Môn học', SUBJECT_NAMES[exam.subject] || exam.subject || ''],
    ['Ngày xuất báo cáo', new Date().toLocaleString('vi-VN')],
    [],
    ['CHỈ SỐ BÀI THI', 'GIÁ TRỊ'],
    ['Sĩ số học sinh trong lớp', students.length],
    ['Số học sinh đã làm bài', submittedStudentCount],
    ['Số học sinh chưa làm', Math.max(0, students.length - submittedStudentCount)],
    ['Tỷ lệ tham gia (%)', `${participationRate}%`],
    ['Tổng số lượt nộp bài', examAttempts.length],
    ['Điểm trung bình (Thang 10)', Number(avg.toFixed(2))],
    ['Điểm cao nhất', Number(maxS.toFixed(2))],
    ['Điểm thấp nhất', Number(minS.toFixed(2))],
    ['Tỷ lệ đạt (>= 5.0đ)', `${passRate}%`],
    [],
    ['PHÂN LOẠI HỌC LỰC (THEO LƯỢT NỘP)', 'SỐ LƯỢNG', 'TỶ LỆ (%)'],
    [
      'Xuất sắc (9.0 - 10.0)',
      scores.filter((s) => s >= 9.0).length,
      scores.length > 0 ? Math.round((scores.filter((s) => s >= 9.0).length / scores.length) * 100) : 0,
    ],
    [
      'Giỏi (8.0 - 8.9)',
      scores.filter((s) => s >= 8.0 && s < 9.0).length,
      scores.length > 0 ? Math.round((scores.filter((s) => s >= 8.0 && s < 9.0).length / scores.length) * 100) : 0,
    ],
    [
      'Khá (6.5 - 7.9)',
      scores.filter((s) => s >= 6.5 && s < 8.0).length,
      scores.length > 0 ? Math.round((scores.filter((s) => s >= 6.5 && s < 8.0).length / scores.length) * 100) : 0,
    ],
    [
      'Trung bình (5.0 - 6.4)',
      scores.filter((s) => s >= 5.0 && s < 6.5).length,
      scores.length > 0 ? Math.round((scores.filter((s) => s >= 5.0 && s < 6.5).length / scores.length) * 100) : 0,
    ],
    [
      'Yếu (< 5.0)',
      scores.filter((s) => s < 5.0).length,
      scores.length > 0 ? Math.round((scores.filter((s) => s < 5.0).length / scores.length) * 100) : 0,
    ],
  ];

  const statsSheet = XLSX.utils.aoa_to_sheet(statsAoa);
  statsSheet['!cols'] = [{ wch: 36 }, { wch: 28 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, statsSheet, 'Thống kê bài thi');

  const dateTag = new Date().toISOString().slice(0, 10);
  const fileName = `${sanitizeFileName(`KetQuaBaiThi_${classroom.name}_${exam.title}_${dateTag}`)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { success: true, count: examAttempts.length, fileName };
}

export interface ExportClassroomOverviewOptions {
  classroom: Classroom;
  assignedExams: Exam[];
  classResults: ExamResult[];
  assignedCoursesCount?: number;
  allUsers?: UserAccount[];
}

/**
 * Chế độ 2 (Chỉ Giáo viên): Xuất file Excel KẾT QUẢ TỔNG QUAN CHUNG CỦA CẢ LỚP.
 * Bao gồm: (1) Tổng quan & phân loại học lực cả lớp + thống kê từng bài thi,
 * (2) Ma trận bảng điểm tổng hợp từng học sinh x từng đề thi,
 * (3) Nhật ký tất cả lượt làm bài trong lớp.
 */
export function exportClassroomOverviewToExcel({
  classroom,
  assignedExams,
  classResults: rawClassResults,
  assignedCoursesCount = 0,
  allUsers = [],
}: ExportClassroomOverviewOptions): { success: boolean; count: number; fileName: string } {
  const classResults = rawClassResults.filter((r) => !isTeacherAccountResult(r, allUsers));
  const students = classroom.students || [];
  const wb = XLSX.utils.book_new();

  // Sheet 1: Tổng quan chung của cả lớp
  const allScores = classResults.map(getScore10);
  const avgScore = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;
  const maxScore = allScores.length > 0 ? Math.max(...allScores) : 0;
  const minScore = allScores.length > 0 ? Math.min(...allScores) : 0;
  const passCount = allScores.filter((s) => s >= 5.0).length;
  const passRate = allScores.length > 0 ? Math.round((passCount / allScores.length) * 100) : 0;

  const activeStudentCount = students.filter((st) =>
    classResults.some((r) => doesResultMatchClassMember(r, st, allUsers))
  ).length;

  const overviewAoa: (string | number)[][] = [
    ['BÁO CÁO KẾT QUẢ TỔNG QUAN CHUNG CỦA LỚP HỌC — EDUTEST'],
    ['Tên lớp học', classroom.name],
    ['Khối lớp', classroom.grade || '—'],
    ['Mã tham gia lớp', classroom.code],
    ['Giáo viên phụ trách', classroom.teacherName],
    ['Ngày xuất báo cáo', new Date().toLocaleString('vi-VN')],
    [],
    ['CHỈ SỐ TỔNG QUAN LỚP HỌC', 'GIÁ TRỊ'],
    ['Sĩ số học sinh', students.length],
    ['Số học sinh đã có kết quả thi', activeStudentCount],
    ['Số đề thi được giao cho lớp', assignedExams.length],
    ['Số khóa học được giao cho lớp', assignedCoursesCount],
    ['Tổng số lượt nộp bài', classResults.length],
    ['Điểm trung bình chung (Thang 10)', Number(avgScore.toFixed(2))],
    ['Điểm cao nhất lớp', Number(maxScore.toFixed(2))],
    ['Điểm thấp nhất lớp', Number(minScore.toFixed(2))],
    ['Tỷ lệ đạt yêu cầu (>= 5.0đ)', `${passRate}%`],
    [],
    ['PHÂN LOẠI HỌC LỰC TOÀN LỚP', 'SỐ BÀI', 'TỶ LỆ (%)'],
    [
      'Xuất sắc (9.0 - 10.0)',
      allScores.filter((s) => s >= 9.0).length,
      allScores.length > 0
        ? Math.round((allScores.filter((s) => s >= 9.0).length / allScores.length) * 100)
        : 0,
    ],
    [
      'Giỏi (8.0 - 8.9)',
      allScores.filter((s) => s >= 8.0 && s < 9.0).length,
      allScores.length > 0
        ? Math.round((allScores.filter((s) => s >= 8.0 && s < 9.0).length / allScores.length) * 100)
        : 0,
    ],
    [
      'Khá (6.5 - 7.9)',
      allScores.filter((s) => s >= 6.5 && s < 8.0).length,
      allScores.length > 0
        ? Math.round((allScores.filter((s) => s >= 6.5 && s < 8.0).length / allScores.length) * 100)
        : 0,
    ],
    [
      'Trung bình (5.0 - 6.4)',
      allScores.filter((s) => s >= 5.0 && s < 6.5).length,
      allScores.length > 0
        ? Math.round((allScores.filter((s) => s >= 5.0 && s < 6.5).length / allScores.length) * 100)
        : 0,
    ],
    [
      'Yếu (< 5.0)',
      allScores.filter((s) => s < 5.0).length,
      allScores.length > 0
        ? Math.round((allScores.filter((s) => s < 5.0).length / allScores.length) * 100)
        : 0,
    ],
    [],
    [
      'STT',
      'TÊN ĐỀ THI ĐƯỢC GIAO',
      'MÔN HỌC',
      'HS ĐÃ LÀM / SĨ SỐ',
      'SỐ LƯỢT NỘP',
      'ĐIỂM TB',
      'CAO NHẤT',
      'THẤP NHẤT',
      'TỶ LỆ ĐẠT (%)',
    ],
  ];

  assignedExams.forEach((ex, idx) => {
    const exRes = classResults.filter((r) => r.examId === ex.id);
    const exScores = exRes.map(getScore10);
    const hsCount = students.filter((st) =>
      exRes.some((r) => doesResultMatchClassMember(r, st, allUsers))
    ).length;
    const exAvg = exScores.length > 0 ? exScores.reduce((a, b) => a + b, 0) / exScores.length : 0;
    const exMax = exScores.length > 0 ? Math.max(...exScores) : 0;
    const exMin = exScores.length > 0 ? Math.min(...exScores) : 0;
    const exPass =
      exScores.length > 0
        ? Math.round((exScores.filter((s) => s >= 5.0).length / exScores.length) * 100)
        : 0;

    overviewAoa.push([
      idx + 1,
      ex.title,
      SUBJECT_NAMES[ex.subject] || ex.subject || '',
      `${hsCount}/${students.length}`,
      exRes.length,
      exScores.length > 0 ? Number(exAvg.toFixed(2)) : '—',
      exScores.length > 0 ? Number(exMax.toFixed(2)) : '—',
      exScores.length > 0 ? Number(exMin.toFixed(2)) : '—',
      exScores.length > 0 ? exPass : '—',
    ]);
  });

  const overviewSheet = XLSX.utils.aoa_to_sheet(overviewAoa);
  overviewSheet['!cols'] = [
    { wch: 32 },
    { wch: 34 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 15 },
  ];
  XLSX.utils.book_append_sheet(wb, overviewSheet, 'Tổng quan lớp học');

  // Sheet 2: Ma trận bảng điểm tổng hợp từng học sinh x từng bài thi
  const matrixRows = students.map((st, idx) => {
    const stAttempts = classResults.filter((r) => doesResultMatchClassMember(r, st, allUsers));
    const stScores = stAttempts.map(getScore10);
    const stAvg =
      stScores.length > 0
        ? Number((stScores.reduce((a, b) => a + b, 0) / stScores.length).toFixed(2))
        : null;

    const completedExamIds = new Set(stAttempts.map((r) => r.examId));
    const rowObj: Record<string, string | number> = {
      STT: idx + 1,
      'Họ và tên học sinh': st.name,
      'SBD / Mã HS': st.studentCode || '—',
      Email: st.email || '—',
      'Số đề đã làm': `${assignedExams.filter((e) => completedExamIds.has(e.id)).length}/${assignedExams.length}`,
      'Tổng lượt nộp': stAttempts.length,
      'Điểm TB (Thang 10)': stAvg !== null ? stAvg : '—',
      'Xếp loại học lực': stAvg !== null ? getAcademicTierLabel(stAvg) : 'Chưa có',
    };

    assignedExams.forEach((ex, exIdx) => {
      const colName = `Đề ${exIdx + 1}: ${ex.title.slice(0, 26)}`;
      const exAttempts = stAttempts.filter((r) => r.examId === ex.id);
      if (exAttempts.length === 0) {
        rowObj[colName] = 'Chưa làm';
      } else {
        rowObj[colName] = Math.max(...exAttempts.map(getScore10));
      }
    });

    return rowObj;
  });

  const matrixSheet =
    matrixRows.length > 0
      ? XLSX.utils.json_to_sheet(matrixRows)
      : XLSX.utils.aoa_to_sheet([['Lớp học chưa có học sinh trong danh sách.']]);
  matrixSheet['!cols'] = [
    { wch: 6 },
    { wch: 24 },
    { wch: 14 },
    { wch: 24 },
    { wch: 15 },
    { wch: 13 },
    { wch: 18 },
    { wch: 18 },
    ...assignedExams.map(() => ({ wch: 22 })),
  ];
  XLSX.utils.book_append_sheet(wb, matrixSheet, 'Bảng điểm tổng hợp HS');

  // Sheet 3: Nhật ký tất cả lượt nộp bài
  const allAttemptRows = [...classResults]
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
    .map((res, idx) => {
      const s10 = getScore10(res);
      return {
        STT: idx + 1,
        'Họ và tên học sinh': res.studentName || 'Thí sinh',
        'SBD / Mã HS': res.studentCode || '—',
        'Tên đề thi': res.examTitle || '',
        'Môn học': SUBJECT_NAMES[res.subject] || res.subject || '',
        'Điểm (Thang 10)': s10,
        'Xếp loại': getAcademicTierLabel(s10),
        'Số câu đúng': `${res.correctCount ?? 0}/${res.totalQuestions ?? 0}`,
        'Thời gian làm': formatDurationVietnamese(res.timeSpentSeconds),
        'Thời điểm nộp': res.completedAt ? new Date(res.completedAt).toLocaleString('vi-VN') : '',
      };
    });

  const logsSheet =
    allAttemptRows.length > 0
      ? XLSX.utils.json_to_sheet(allAttemptRows)
      : XLSX.utils.aoa_to_sheet([['Chưa có lượt làm bài nào trong lớp.']]);
  logsSheet['!cols'] = [
    { wch: 6 },
    { wch: 24 },
    { wch: 14 },
    { wch: 32 },
    { wch: 14 },
    { wch: 16 },
    { wch: 15 },
    { wch: 14 },
    { wch: 18 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, logsSheet, 'Chi tiết lượt làm bài');

  const dateTag = new Date().toISOString().slice(0, 10);
  const fileName = `${sanitizeFileName(`TongQuanLop_${classroom.name}_${dateTag}`)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { success: true, count: classResults.length, fileName };
}

export interface StudentCourseProgressSummary {
  courseTitle: string;
  subject?: string;
  grade?: string;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  statusLabel: string;
}

export interface ExportStudentLearningOptions {
  studentName: string;
  studentCode?: string;
  studentEmail?: string;
  className?: string;
  results: ExamResult[];
  coursesProgress?: StudentCourseProgressSummary[];
}

/**
 * Chế độ 3 (Học sinh & Giáo viên đều có quyền): Xuất file Excel KẾT QUẢ HỌC TẬP CỦA TỪNG HỌC SINH.
 * Bao gồm: (1) Tổng quan học lực, thống kê theo môn và phân tích chuyên đề mạnh/yếu,
 * (2) Toàn bộ lịch sử làm bài thi của học sinh đó, (3) Tiến độ khóa học SCORM (nếu có).
 */
export function exportStudentLearningResultsToExcel({
  studentName,
  studentCode,
  studentEmail,
  className,
  results,
  coursesProgress = [],
}: ExportStudentLearningOptions): { success: boolean; count: number; fileName: string } {
  const sortedResults = [...results].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );
  const scores = sortedResults.map(getScore10);
  const totalExams = sortedResults.length;
  const avgScore = totalExams > 0 ? scores.reduce((a, b) => a + b, 0) / totalExams : 0;
  const maxScore = totalExams > 0 ? Math.max(...scores) : 0;
  const minScore = totalExams > 0 ? Math.min(...scores) : 0;
  const passRate =
    totalExams > 0
      ? Math.round((scores.filter((s) => s >= 5.0).length / totalExams) * 100)
      : 0;

  const totalEarned = sortedResults.reduce((acc, r) => acc + (r.earnedPoints || 0), 0);
  const totalMax = sortedResults.reduce((acc, r) => acc + (r.totalPoints || 0), 0);
  const accuracyRate = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;
  const totalTimeMinutes = Math.round(
    sortedResults.reduce((acc, r) => acc + (r.timeSpentSeconds || 0), 0) / 60
  );

  // Thống kê theo môn học
  const subjectMap = new Map<string, { label: string; scores: number[] }>();
  sortedResults.forEach((r) => {
    const key = r.subject || 'general';
    const entry = subjectMap.get(key) || {
      label: SUBJECT_NAMES[key] || key || 'Tổng hợp',
      scores: [],
    };
    entry.scores.push(getScore10(r));
    subjectMap.set(key, entry);
  });

  // Phân tích chuyên đề
  const topicMap = new Map<string, { total: number; earned: number; maxPoints: number }>();
  sortedResults.forEach((r) => {
    if (!r.topicBreakdown) return;
    Object.entries(r.topicBreakdown).forEach(([topic, data]) => {
      const key = topic.trim() || 'Tổng hợp';
      const cur = topicMap.get(key) || { total: 0, earned: 0, maxPoints: 0 };
      cur.total += data.total || 0;
      cur.earned += data.earned || 0;
      cur.maxPoints += data.maxPoints || 0;
      topicMap.set(key, cur);
    });
  });

  const summaryAoa: (string | number)[][] = [
    ['BÁO CÁO KẾT QUẢ HỌC TẬP CÁ NHÂN HỌC SINH — EDUTEST'],
    ['Họ và tên học sinh', studentName || 'Học sinh'],
    ['SBD / Mã học sinh', studentCode || '—'],
    ['Email', studentEmail || '—'],
    ['Lớp học', className || 'Tự do'],
    ['Ngày xuất báo cáo', new Date().toLocaleString('vi-VN')],
    [],
    ['CHỈ SỐ TỔNG QUAN HỌC TẬP', 'GIÁ TRỊ'],
    ['Tổng số bài thi đã hoàn thành', totalExams],
    ['Điểm trung bình (Thang 10)', Number(avgScore.toFixed(2))],
    ['Xếp loại học lực hiện tại', totalExams > 0 ? getAcademicTierLabel(avgScore) : 'Chưa có dữ liệu'],
    ['Điểm cao nhất', Number(maxScore.toFixed(2))],
    ['Điểm thấp nhất', Number(minScore.toFixed(2))],
    ['Tỷ lệ đạt (>= 5.0đ)', `${passRate}%`],
    ['Độ chính xác điểm câu hỏi (%)', `${accuracyRate}%`],
    ['Tổng thời gian luyện thi (phút)', totalTimeMinutes],
    [],
    ['THỐNG KÊ THEO MÔN HỌC', 'SỐ BÀI', 'ĐIỂM TB', 'CAO NHẤT', 'XẾP LOẠI'],
  ];

  Array.from(subjectMap.values()).forEach((sub) => {
    const subAvg = sub.scores.reduce((a, b) => a + b, 0) / sub.scores.length;
    const subMax = Math.max(...sub.scores);
    summaryAoa.push([
      sub.label,
      sub.scores.length,
      Number(subAvg.toFixed(2)),
      Number(subMax.toFixed(2)),
      getAcademicTierLabel(subAvg),
    ]);
  });

  if (topicMap.size > 0) {
    summaryAoa.push([]);
    summaryAoa.push([
      'PHÂN TÍCH CHUYÊN ĐỀ',
      'SỐ CÂU',
      'ĐIỂM ĐẠT',
      'ĐIỂM TỐI ĐA',
      'TỶ LỆ (%)',
      'ĐÁNH GIÁ',
    ]);
    Array.from(topicMap.entries())
      .filter(([, d]) => d.maxPoints > 0)
      .map(([topic, d]) => ({
        topic,
        total: d.total,
        earned: Number(d.earned.toFixed(2)),
        maxPoints: Number(d.maxPoints.toFixed(2)),
        pct: Math.round((d.earned / d.maxPoints) * 100),
      }))
      .sort((a, b) => b.pct - a.pct)
      .forEach((t) => {
        const evalText =
          t.pct >= 75 ? 'Thế mạnh' : t.pct >= 55 ? 'Đạt yêu cầu' : 'Cần ôn tập thêm';
        summaryAoa.push([t.topic, t.total, t.earned, t.maxPoints, `${t.pct}%`, evalText]);
      });
  }

  const wb = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryAoa);
  summarySheet['!cols'] = [
    { wch: 36 },
    { wch: 24 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Tổng quan học tập');

  // Sheet 2: Lịch sử bài thi của học sinh
  const historyRows = sortedResults.map((res, idx) => {
    const totalPts = res.totalPoints || 10;
    const earnedPts = res.earnedPoints ?? (res.score * totalPts) / 10;
    const score10 = getScore10(res);
    const noteParts: string[] = [];
    if (res.submissionReason) noteParts.push(res.submissionReason);
    if (res.tabSwitchCount && res.tabSwitchCount > 0) {
      noteParts.push(`Rời màn hình: ${res.tabSwitchCount} lần`);
    }
    return {
      STT: idx + 1,
      'Tên đề thi': res.examTitle || '',
      'Môn học': SUBJECT_NAMES[res.subject] || res.subject || '',
      'Khối / Cấp': res.grade || '',
      'Điểm đạt được': Number(earnedPts.toFixed(2)),
      'Tổng điểm đề': Number(totalPts.toFixed(2)),
      'Điểm (Thang 10)': score10,
      'Xếp loại': getAcademicTierLabel(score10),
      'Số câu đúng': res.correctCount ?? 0,
      'Đúng một phần': res.partialCount ?? 0,
      'Số câu sai': res.wrongCount ?? 0,
      'Tổng số câu': res.totalQuestions ?? 0,
      'Thời gian làm bài': formatDurationVietnamese(res.timeSpentSeconds),
      'Thời điểm nộp bài': res.completedAt ? new Date(res.completedAt).toLocaleString('vi-VN') : '',
      'Ghi chú': noteParts.join(' | ') || 'Nộp bình thường',
    };
  });

  const historySheet =
    historyRows.length > 0
      ? XLSX.utils.json_to_sheet(historyRows)
      : XLSX.utils.aoa_to_sheet([['Học sinh chưa có lịch sử bài thi nào.']]);
  historySheet['!cols'] = [
    { wch: 6 },
    { wch: 34 },
    { wch: 15 },
    { wch: 12 },
    { wch: 14 },
    { wch: 13 },
    { wch: 16 },
    { wch: 15 },
    { wch: 13 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 22 },
    { wch: 26 },
  ];
  XLSX.utils.book_append_sheet(wb, historySheet, 'Lịch sử bài thi');

  // Sheet 3: Tiến độ khóa học (nếu có)
  if (coursesProgress.length > 0) {
    const courseRows = coursesProgress.map((cp, idx) => ({
      STT: idx + 1,
      'Tên khóa học': cp.courseTitle,
      'Môn học': cp.subject ? SUBJECT_NAMES[cp.subject] || cp.subject : '—',
      'Khối / Cấp': cp.grade || '—',
      'Bài đã hoàn thành': cp.completedLessons,
      'Tổng số bài học': cp.totalLessons,
      'Tiến độ (%)': `${cp.progressPercent}%`,
      'Trạng thái': cp.statusLabel,
    }));
    const courseSheet = XLSX.utils.json_to_sheet(courseRows);
    courseSheet['!cols'] = [
      { wch: 6 },
      { wch: 34 },
      { wch: 15 },
      { wch: 12 },
      { wch: 18 },
      { wch: 16 },
      { wch: 14 },
      { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, courseSheet, 'Tiến độ khóa học');
  }

  const dateTag = new Date().toISOString().slice(0, 10);
  const fileName = `${sanitizeFileName(`KetQuaHocTap_${studentName || 'HocSinh'}_${dateTag}`)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { success: true, count: totalExams, fileName };
}

export interface ExportClassroomCourseProgressOptions {
  classroom: Classroom;
  courses: MicroCourse[];
  targetCourse?: MicroCourse;
  allUsers?: UserAccount[];
  getCourseProgress?: (courseId: string, studentId: string) => StudentCourseProgress;
}

function getCourseStatusVietnamese(status?: string, pct = 0): string {
  if (status === 'passed') return 'Đạt chuẩn (100%)';
  if (status === 'completed' || pct >= 100) return 'Hoàn thành (100%)';
  if (status === 'incomplete' || pct > 0) return 'Đang học';
  return 'Chưa học';
}

function resolveBestMemberCourseProgress(
  course: MicroCourse,
  member: StudentMember,
  allUsers: UserAccount[],
  getProgressFn: (courseId: string, studentId: string) => StudentCourseProgress
): StudentCourseProgress {
  const linked = findLinkedUserForMember(member, allUsers);
  const candidateIds = Array.from(new Set([linked?.id, member.id].filter(Boolean) as string[]));
  if (candidateIds.length === 0) {
    return syncCourseScormState(course, {
      courseId: course.id,
      studentId: '',
      completedLessonIds: [],
      completedBlockIds: [],
      interactiveAnswers: {},
      completedExamIds: [],
      lastStudiedAt: '',
    });
  }

  let best = syncCourseScormState(course, getProgressFn(course.id, candidateIds[0]));
  for (let i = 1; i < candidateIds.length; i++) {
    const candidate = syncCourseScormState(course, getProgressFn(course.id, candidateIds[i]));
    const bestUnits = best.scormData?.totalBlocksCompleted || 0;
    const candUnits = candidate.scormData?.totalBlocksCompleted || 0;
    const bestLessons = best.completedLessonIds?.length || 0;
    const candLessons = candidate.completedLessonIds?.length || 0;
    if (
      candUnits > bestUnits ||
      (candUnits === bestUnits && candLessons > bestLessons)
    ) {
      best = candidate;
    }
  }
  return best;
}

/**
 * Xây dựng Workbook Excel (.xlsx) thống kê QUÁ TRÌNH HỌC KHÓA HỌC TRONG LỚP HỌC.
 * Hỗ trợ xuất 1 khóa học cụ thể (kèm chi tiết từng bài học) hoặc toàn bộ khóa học được giao cho lớp.
 */
export function buildClassroomCourseProgressWorkbook({
  classroom,
  courses,
  targetCourse,
  allUsers = [],
  getCourseProgress = getStudentCourseProgress,
}: ExportClassroomCourseProgressOptions): {
  workbook: XLSX.WorkBook;
  fileName: string;
  studentCount: number;
  courseCount: number;
} {
  const targetCourses = targetCourse ? [targetCourse] : courses;
  const studentMembers = (classroom.students || []).filter((st) => {
    const linked = findLinkedUserForMember(st, allUsers);
    if (!linked) return true;
    return !(
      linked.role === 'teacher' ||
      linked.isMasterAdmin ||
      linked.email?.toLowerCase() === 'tranquangnhat418@gmail.com'
    );
  });

  const wb = XLSX.utils.book_new();

  // Precompute member x course matrix
  const memberCourseRecords = studentMembers.map((st) => {
    const linked = findLinkedUserForMember(st, allUsers);
    const email = st.email || linked?.email || '—';
    const studentCode = st.studentCode || linked?.studentCode || '—';

    const perCourse = targetCourses.map((course) => {
      const synced = resolveBestMemberCourseProgress(course, st, allUsers, getCourseProgress);
      const units = getCourseTrackingUnits(course);
      const lessons = getAllLessonsFromCourse(course);
      const pct = calculateCourseProgressPercentage(course, synced);
      const completedBlocks = synced.scormData?.totalBlocksCompleted ?? 0;
      const totalBlocks = units.length;
      const completedLessons = synced.completedLessonIds?.length || 0;
      const totalLessons = lessons.length;
      const answerVals = Object.values(synced.interactiveAnswers || {});
      const correctInteractive = answerVals.filter((a) => a.isCorrect).length;
      const currentLesson = lessons.find((l) => l.id === synced.currentLessonId);

      const hasStarted =
        pct > 0 || completedBlocks > 0 || answerVals.length > 0;

      return {
        course,
        synced,
        pct,
        completedBlocks,
        totalBlocks,
        completedLessons,
        totalLessons,
        correctInteractive,
        answeredInteractive: answerVals.length,
        statusLabel: getCourseStatusVietnamese(synced.scormData?.lessonStatus, pct),
        currentLessonTitle: currentLesson?.title || (pct >= 100 ? 'Đã xong toàn khóa' : '—'),
        lastStudiedAt: hasStarted && synced.lastStudiedAt ? synced.lastStudiedAt : '',
        lessons,
      };
    });

    return {
      student: st,
      studentCode,
      email,
      perCourse,
    };
  });

  // Sheet 1: Tổng quan khóa học trong lớp
  const overviewAoa: (string | number)[][] = [
    ['BÁO CÁO QUÁ TRÌNH HỌC KHÓA HỌC TRONG LỚP — EDUTEST'],
    ['Lớp học', `${classroom.name}${classroom.grade ? ` (${classroom.grade})` : ''}`],
    ['Mã tham gia lớp', classroom.code],
    ['Giáo viên phụ trách', classroom.teacherName],
    [
      'Phạm vi báo cáo',
      targetCourse ? `Khóa học: ${targetCourse.title}` : `Tất cả khóa học được giao (${targetCourses.length} khóa)`,
    ],
    ['Sĩ số học sinh', studentMembers.length],
    ['Ngày xuất báo cáo', new Date().toLocaleString('vi-VN')],
    [],
    [
      'STT',
      'TÊN KHÓA HỌC',
      'MÔN HỌC',
      'KHỐI',
      'SỐ BÀI HỌC',
      'SỐ PHẦN (BLOCK)',
      'HS HOÀN THÀNH 100%',
      'HS ĐANG HỌC',
      'HS CHƯA HỌC',
      'TIẾN ĐỘ TB LỚP (%)',
    ],
  ];

  targetCourses.forEach((course, idx) => {
    const lessonsCount = getAllLessonsFromCourse(course).length;
    const unitsCount = getCourseTrackingUnits(course).length;
    const recordsForCourse = memberCourseRecords.map((m) => m.perCourse[idx]);
    const doneCount = recordsForCourse.filter((r) => r.pct >= 100).length;
    const inProgCount = recordsForCourse.filter((r) => r.pct > 0 && r.pct < 100).length;
    const notStartedCount = Math.max(0, studentMembers.length - doneCount - inProgCount);
    const avgPct =
      recordsForCourse.length > 0
        ? Math.round(recordsForCourse.reduce((sum, r) => sum + r.pct, 0) / recordsForCourse.length)
        : 0;

    overviewAoa.push([
      idx + 1,
      course.title,
      SUBJECT_NAMES[course.subject] || course.subject || '',
      course.grade || '—',
      lessonsCount,
      unitsCount,
      doneCount,
      inProgCount,
      notStartedCount,
      `${avgPct}%`,
    ]);
  });

  const overviewSheet = XLSX.utils.aoa_to_sheet(overviewAoa);
  overviewSheet['!cols'] = [
    { wch: 24 },
    { wch: 36 },
    { wch: 15 },
    { wch: 12 },
    { wch: 13 },
    { wch: 16 },
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, overviewSheet, 'Tổng quan khóa học');

  // Sheet 2: Tổng hợp theo từng học sinh (Ma trận hoặc Chi tiết 1 khóa)
  if (targetCourse) {
    const singleRows = memberCourseRecords.map((rec, idx) => {
      const cRec = rec.perCourse[0];
      return {
        STT: idx + 1,
        'Họ và tên học sinh': rec.student.name,
        'SBD / Mã HS': rec.studentCode,
        Email: rec.email,
        'Phần đã xong': cRec.completedBlocks,
        'Tổng số phần': cRec.totalBlocks,
        'Bài đã xong': cRec.completedLessons,
        'Tổng số bài': cRec.totalLessons,
        'Tiến độ (%)': cRec.pct,
        'Câu tương tác đúng':
          cRec.answeredInteractive > 0
            ? `${cRec.correctInteractive}/${cRec.answeredInteractive}`
            : '0',
        'Trạng thái học': cRec.statusLabel,
        'Vị trí đang học': cRec.currentLessonTitle,
        'Học gần nhất': cRec.lastStudiedAt
          ? new Date(cRec.lastStudiedAt).toLocaleString('vi-VN')
          : 'Chưa học',
      };
    });

    const singleSheet =
      singleRows.length > 0
        ? XLSX.utils.json_to_sheet(singleRows)
        : XLSX.utils.aoa_to_sheet([['Lớp học chưa có học sinh trong danh sách.']]);
    singleSheet['!cols'] = [
      { wch: 6 },
      { wch: 24 },
      { wch: 14 },
      { wch: 24 },
      { wch: 13 },
      { wch: 13 },
      { wch: 12 },
      { wch: 12 },
      { wch: 13 },
      { wch: 18 },
      { wch: 18 },
      { wch: 28 },
      { wch: 22 },
    ];
    XLSX.utils.book_append_sheet(wb, singleSheet, 'Tiến độ học sinh');
  } else {
    const matrixRows = memberCourseRecords.map((rec, idx) => {
      const completedCourses = rec.perCourse.filter((r) => r.pct >= 100).length;
      const avgPct =
        rec.perCourse.length > 0
          ? Math.round(rec.perCourse.reduce((sum, r) => sum + r.pct, 0) / rec.perCourse.length)
          : 0;
      const latestTs = rec.perCourse
        .map((r) => (r.lastStudiedAt ? new Date(r.lastStudiedAt).getTime() : 0))
        .reduce((a, b) => Math.max(a, b), 0);

      const rowObj: Record<string, string | number> = {
        STT: idx + 1,
        'Họ và tên học sinh': rec.student.name,
        'SBD / Mã HS': rec.studentCode,
        Email: rec.email,
        'Khóa đã hoàn thành': `${completedCourses}/${targetCourses.length}`,
        'Tiến độ TB (%)': avgPct,
      };

      rec.perCourse.forEach((cRec, cIdx) => {
        const colName = `KH ${cIdx + 1}: ${cRec.course.title.slice(0, 24)} (%)`;
        rowObj[colName] = cRec.pct;
      });

      rowObj['Hoạt động gần nhất'] =
        latestTs > 0 ? new Date(latestTs).toLocaleString('vi-VN') : 'Chưa học';
      return rowObj;
    });

    const matrixSheet =
      matrixRows.length > 0
        ? XLSX.utils.json_to_sheet(matrixRows)
        : XLSX.utils.aoa_to_sheet([['Lớp học chưa có học sinh trong danh sách.']]);
    matrixSheet['!cols'] = [
      { wch: 6 },
      { wch: 24 },
      { wch: 14 },
      { wch: 24 },
      { wch: 18 },
      { wch: 15 },
      ...targetCourses.map(() => ({ wch: 24 })),
      { wch: 22 },
    ];
    XLSX.utils.book_append_sheet(wb, matrixSheet, 'Ma trận tiến độ lớp');
  }

  // Sheet 3: Chi tiết quá trình học (từng HS x từng khóa)
  const detailRows: Record<string, string | number>[] = [];
  memberCourseRecords.forEach((rec) => {
    rec.perCourse.forEach((cRec) => {
      detailRows.push({
        STT: detailRows.length + 1,
        'Họ và tên học sinh': rec.student.name,
        'SBD / Mã HS': rec.studentCode,
        Email: rec.email,
        'Tên khóa học': cRec.course.title,
        'Môn học': SUBJECT_NAMES[cRec.course.subject] || cRec.course.subject || '',
        'Tiến độ (%)': cRec.pct,
        'Phần đã xong': cRec.completedBlocks,
        'Tổng phần': cRec.totalBlocks,
        'Bài đã xong': cRec.completedLessons,
        'Tổng bài': cRec.totalLessons,
        'Câu tương tác đúng':
          cRec.answeredInteractive > 0
            ? `${cRec.correctInteractive}/${cRec.answeredInteractive}`
            : '0',
        'Trạng thái': cRec.statusLabel,
        'Bài đang học': cRec.currentLessonTitle,
        'Học gần nhất': cRec.lastStudiedAt
          ? new Date(cRec.lastStudiedAt).toLocaleString('vi-VN')
          : 'Chưa học',
      });
    });
  });

  const detailSheet =
    detailRows.length > 0
      ? XLSX.utils.json_to_sheet(detailRows)
      : XLSX.utils.aoa_to_sheet([['Chưa có dữ liệu quá trình học trong lớp.']]);
  detailSheet['!cols'] = [
    { wch: 6 },
    { wch: 24 },
    { wch: 14 },
    { wch: 24 },
    { wch: 30 },
    { wch: 14 },
    { wch: 13 },
    { wch: 13 },
    { wch: 11 },
    { wch: 12 },
    { wch: 11 },
    { wch: 18 },
    { wch: 18 },
    { wch: 26 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, detailSheet, 'Chi tiết quá trình học');

  // Sheet 4 (khi xuất 1 khóa cụ thể): Chi tiết từng bài học của từng học sinh
  if (targetCourse) {
    const courseLessons = getAllLessonsFromCourse(targetCourse);
    const lessonRows = memberCourseRecords.map((rec, idx) => {
      const cRec = rec.perCourse[0];
      const completedLessonSet = new Set(cRec.synced.completedLessonIds || []);
      const completedBlockSet = new Set(cRec.synced.completedBlockIds || []);

      const rowObj: Record<string, string | number> = {
        STT: idx + 1,
        'Họ và tên học sinh': rec.student.name,
        'SBD / Mã HS': rec.studentCode,
      };

      courseLessons.forEach((les, lIdx) => {
        const colName = `Bài ${lIdx + 1}: ${les.title.slice(0, 22)}`;
        if (completedLessonSet.has(les.id)) {
          rowObj[colName] = 'Hoàn thành';
        } else {
          const blocks = les.blocks || [];
          const doneBlkCount = blocks.filter((b) => completedBlockSet.has(b.id)).length;
          if (doneBlkCount > 0 || cRec.synced.currentLessonId === les.id) {
            rowObj[colName] =
              blocks.length > 0 ? `Đang học (${doneBlkCount}/${blocks.length})` : 'Đang học';
          } else {
            rowObj[colName] = 'Chưa học';
          }
        }
      });

      return rowObj;
    });

    const lessonSheet =
      lessonRows.length > 0
        ? XLSX.utils.json_to_sheet(lessonRows)
        : XLSX.utils.aoa_to_sheet([['Chưa có dữ liệu từng bài học.']]);
    lessonSheet['!cols'] = [
      { wch: 6 },
      { wch: 24 },
      { wch: 14 },
      ...courseLessons.map(() => ({ wch: 22 })),
    ];
    XLSX.utils.book_append_sheet(wb, lessonSheet, 'Chi tiết từng bài');
  }

  const dateTag = new Date().toISOString().slice(0, 10);
  const scopeLabel = targetCourse ? targetCourse.title : 'KhoaHocLop';
  const fileName = `${sanitizeFileName(`QuaTrinhHoc_${classroom.name}_${scopeLabel}_${dateTag}`)}.xlsx`;

  return {
    workbook: wb,
    fileName,
    studentCount: studentMembers.length,
    courseCount: targetCourses.length,
  };
}

/**
 * Xuất file Excel quá trình học khóa học trong lớp học.
 */
export function exportClassroomCourseProgressToExcel(
  options: ExportClassroomCourseProgressOptions
): { success: boolean; count: number; fileName: string } {
  const built = buildClassroomCourseProgressWorkbook(options);
  XLSX.writeFile(built.workbook, built.fileName);
  return {
    success: true,
    count: built.studentCount * built.courseCount,
    fileName: built.fileName,
  };
}

// ============================================================================
// WORD (.docx) EXPORT FOR EXAMS
// ============================================================================

// Word Unicode math conversion helpers are imported from ./mathUnicode.ts

interface ParsedImageData {
  data: Uint8Array;
  type: 'png' | 'jpg' | 'gif' | 'bmp';
  width: number;
  height: number;
}

async function resolveImageForDocx(url?: string, maxWidth = 460): Promise<ParsedImageData | null> {
  if (!url || !url.trim()) return null;
  try {
    return await new Promise<ParsedImageData | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timer = window.setTimeout(() => resolve(null), 5000);

      img.onload = () => {
        window.clearTimeout(timer);
        try {
          const naturalW = img.naturalWidth || 320;
          const naturalH = img.naturalHeight || 200;
          const ratio = naturalW > maxWidth ? maxWidth / naturalW : 1;
          const width = Math.max(40, Math.round(naturalW * ratio));
          const height = Math.max(30, Math.round(naturalH * ratio));

          const canvas = document.createElement('canvas');
          canvas.width = naturalW;
          canvas.height = naturalH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(async (blob) => {
            if (!blob) {
              resolve(null);
              return;
            }
            const buf = await blob.arrayBuffer();
            resolve({
              data: new Uint8Array(buf),
              type: 'png',
              width,
              height,
            });
          }, 'image/png');
        } catch {
          resolve(null);
        }
      };

      img.onerror = () => {
        window.clearTimeout(timer);
        resolve(null);
      };

      img.src = url;
    });
  } catch {
    return null;
  }
}

function extractInlineImageUrls(
  text: string,
  inlineImagesMap?: Record<string, string>
): { cleanText: string; inlineImages: string[] } {
  const inlineImages: string[] = [];
  const cleanText = (text || '')
    .replace(/\[IMG:\s*([^\]]+)\]/gi, (_, imgUrl: string) => {
      const trimmed = imgUrl.trim();
      if (trimmed) inlineImages.push(trimmed);
      return '';
    })
    .replace(/\[\[img:([a-zA-Z0-9_-]+)(?:\|([^\]]*))?\]\]/g, (_, id: string, title?: string) => {
      const resolved = resolveImplicitImage(id, inlineImagesMap);
      if (resolved) inlineImages.push(resolved);
      const cleanTitle = (title || '').trim();
      return cleanTitle ? ` [Hình: ${cleanTitle}] ` : '';
    })
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt: string, src: string) => {
      const trimmed = src.trim();
      if (trimmed) inlineImages.push(trimmed);
      const cleanAlt = (alt || '').trim();
      return cleanAlt ? ` [Hình: ${cleanAlt}] ` : '';
    })
    .trim();
  return { cleanText, inlineImages };
}

function isMarkdownTableBlock(lines: string[]): boolean {
  if (lines.length < 2) return false;
  return lines[0].trim().startsWith('|') && /^\|?[\s:|-]+\|/.test(lines[1].trim());
}

function createWordTableFromMarkdown(tableLines: string[]): Table | null {
  const dataLines = tableLines.filter((line, idx) => {
    if (idx === 1 && /^\|?[\s:|-]+\|/.test(line.trim())) return false;
    return line.trim().includes('|');
  });
  if (dataLines.length === 0) return null;

  const parsedRows = dataLines.map((line) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim())
  );

  const colCount = Math.max(...parsedRows.map((r) => r.length), 1);

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: parsedRows.map(
      (row, rIdx) =>
        new TableRow({
          children: Array.from({ length: colCount }).map((_, cIdx) => {
            const cellRaw = row[cIdx] ?? '';
            const cellRuns = buildDocxMathTextRuns(cellRaw, {
              bold: rIdx === 0,
              size: 21,
              font: 'Times New Roman',
            });
            return new TableCell({
              width: { size: Math.floor(100 / colCount), type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
                left: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
                right: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
              },
              children: [
                new Paragraph({
                  spacing: { before: 60, after: 60 },
                  children: cellRuns,
                }),
              ],
            });
          }),
        })
    ),
  });
}

async function buildRichTextChildren(
  rawText: string,
  extraImageUrl?: string,
  prefixRun?: TextRun,
  inlineImagesMap?: Record<string, string>
): Promise<(Paragraph | Table)[]> {
  const blocks: (Paragraph | Table)[] = [];
  const { cleanText, inlineImages } = extractInlineImageUrls(rawText, inlineImagesMap);
  const lines = cleanText.split('\n');

  let i = 0;
  let prefixUsed = false;

  while (i < lines.length) {
    const current = lines[i];
    if (current.trim().startsWith('|') && i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      if (isMarkdownTableBlock(tableLines)) {
        if (prefixRun && !prefixUsed) {
          blocks.push(
            new Paragraph({
              spacing: { before: 120, after: 60 },
              children: [prefixRun],
            })
          );
          prefixUsed = true;
        }
        const tbl = createWordTableFromMarkdown(tableLines);
        if (tbl) blocks.push(tbl);
        continue;
      } else {
        tableLines.forEach((tl) => {
          const runs: TextRun[] = [];
          if (prefixRun && !prefixUsed) {
            runs.push(prefixRun);
            prefixUsed = true;
          }
          runs.push(
            ...buildDocxMathTextRuns(tl, {
              size: 22,
              font: 'Times New Roman',
            })
          );
          blocks.push(new Paragraph({ spacing: { after: 60 }, children: runs }));
        });
        continue;
      }
    }

    const lineRuns = buildDocxMathTextRuns(current, {
      size: 22,
      font: 'Times New Roman',
    });
    const runs: TextRun[] = [];
    if (prefixRun && !prefixUsed) {
      runs.push(prefixRun);
      prefixUsed = true;
    }
    if (lineRuns.length > 0 || runs.length > 0) {
      runs.push(...lineRuns);
      blocks.push(
        new Paragraph({
          spacing: { after: 60 },
          children: runs,
        })
      );
    }
    i++;
  }

  if (prefixRun && !prefixUsed) {
    blocks.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [prefixRun],
      })
    );
  }

  const allImages = [
    ...(extraImageUrl ? [extraImageUrl] : []),
    ...inlineImages,
  ];
  for (const imgUrl of allImages) {
    const resolved = await resolveImageForDocx(imgUrl);
    if (resolved) {
      blocks.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 80, after: 100 },
          children: [
            new ImageRun({
              type: resolved.type,
              data: resolved.data,
              transformation: {
                width: resolved.width,
                height: resolved.height,
              },
            }),
          ],
        })
      );
    }
  }

  return blocks;
}

function getCorrectAnswerSummary(q: Question): string {
  if (q.type === 'single_choice') {
    if (q.correctAnswer === undefined || !q.options?.[q.correctAnswer]) return 'Chưa thiết lập';
    return String.fromCharCode(65 + q.correctAnswer);
  }
  if (q.type === 'multiple_choice') {
    if (!q.correctAnswers || q.correctAnswers.length === 0) return 'Chưa thiết lập';
    return [...q.correctAnswers]
      .sort((a, b) => a - b)
      .map((idx) => String.fromCharCode(65 + idx))
      .join(', ');
  }
  if (q.type === 'true_false') {
    if (!q.tfItems || q.tfItems.length === 0) return 'Chưa thiết lập';
    return q.tfItems
      .map((item, idx) => `${String.fromCharCode(97 + idx)}) ${item.isCorrect ? 'Đúng' : 'Sai'}`)
      .join(' ; ');
  }
  if (q.type === 'text_input') {
    if (!q.acceptedAnswers || q.acceptedAnswers.length === 0) return 'Chưa thiết lập';
    return formatAcceptedShortAnswersList(q.acceptedAnswers.map((a) => formatMathToReadableText(a)));
  }
  if (q.type === 'matching') {
    const leftItems = q.matchingLeftItems || [];
    const rightItems = q.matchingRightItems || [];
    const pairs = q.matchingCorrectPairs || {};
    if (leftItems.length === 0) return 'Chưa thiết lập';
    return leftItems
      .map((left, idx) => {
        const leftLbl = formatMatchingLabel(idx, q.matchingLeftLabelStyle || 'number', left.label);
        const rightId = pairs[left.id];
        const rightLbl = rightId
          ? getDisplayedLabelForAnswerValue(rightId, rightItems, q.matchingRightLabelStyle || 'upper_alpha') || '?'
          : '?';
        const matchedRight = rightItems.find((r) => r.id === rightId);
        const rightPreview = matchedRight
          ? matchedRight.content?.trim()
            ? `${formatMathToReadableText(matchedRight.content)}${matchedRight.imageUrl ? ' [Ảnh]' : ''}`
            : matchedRight.imageUrl
            ? '[Hình ảnh]'
            : ''
          : '';
        return `${leftLbl} - ${rightLbl}${rightPreview ? ` (${rightPreview})` : ''}`;
      })
      .join(' ; ');
  }
  if (q.type === 'grouped' && q.subQuestions) {
    return q.subQuestions
      .map((sub, sIdx) => {
        const subPrefix = `Ý ${sIdx + 1}: `;
        if ((sub.type || 'single_choice') === 'text_input') {
          const formatted = formatAcceptedShortAnswersList(
            (sub.acceptedAnswers || []).map((a) => formatMathToReadableText(formatShortAnswerDecimalComma(a)))
          );
          return `${subPrefix}${formatted || '—'}`;
        }
        return `${subPrefix}${
          sub.correctAnswer !== undefined ? String.fromCharCode(65 + sub.correctAnswer) : '—'
        }`;
      })
      .join(' | ');
  }
  if (q.type === 'essay') {
    if (q.sampleAnswer && q.sampleAnswer.trim()) {
      return formatMathToReadableText(q.sampleAnswer);
    }
    return 'Tự luận (Giáo viên chấm điểm)';
  }
  return '—';
}

export interface ExportWordOptions {
  includeAnswers?: boolean;
  includeExplanations?: boolean;
}

function buildDocxUpperTitleRuns(
  rawTitle: string,
  baseOptions: Partial<IRunOptions>
): TextRun[] {
  const title = rawTitle || '';
  const parts = title.split(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^$\n]+?\$|\\\([\s\S]*?\\\))/g);
  const runs: TextRun[] = [];
  for (const part of parts) {
    if (!part) continue;
    const isDelimitedMath =
      (part.startsWith('$$') && part.endsWith('$$')) ||
      (part.startsWith('\\[') && part.endsWith('\\]')) ||
      (part.startsWith('$') && part.endsWith('$')) ||
      (part.startsWith('\\(') && part.endsWith('\\)'));
    if (isDelimitedMath) {
      runs.push(...buildDocxMathTextRuns(part, baseOptions));
    } else if (part.includes('\\') || part.includes('^') || part.includes('_')) {
      // Contains unwrapped math syntax: convert to Unicode Math without breaking TeX tokens
      runs.push(...buildDocxMathTextRuns(part, baseOptions));
    } else {
      runs.push(...buildDocxMathTextRuns(part.toUpperCase(), baseOptions));
    }
  }
  return runs.length > 0 ? runs : buildDocxMathTextRuns(title, baseOptions);
}

/**
 * Xuất file Word (.docx) đề thi chuẩn có hỗ trợ đầy đủ các dạng câu hỏi, bảng biểu và hình ảnh.
 */
export async function exportExamToWord(
  exam: Exam,
  options: ExportWordOptions = {}
): Promise<{ success: boolean; fileName: string }> {
  const includeAnswers = Boolean(options.includeAnswers);
  const includeExplanations = options.includeExplanations ?? includeAnswers;

  const isGroupedByType = Boolean(exam.settings?.groupByQuestionType);
  const clusters = isGroupedByType
    ? buildQuestionClusters(exam.questions, exam.settings?.questionTypeOrder)
    : [];
  const orderedQuestions = isGroupedByType
    ? clusters.flatMap((c) => c.items.map((it) => it.question))
    : exam.questions;

  const docChildren: (Paragraph | Table)[] = [];

  // Header metadata
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: 'HỆ THỐNG ĐỀ THI TRỰC TUYẾN EDUTEST',
          bold: true,
          size: 20,
          color: '475569',
          font: 'Times New Roman',
        }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: buildDocxUpperTitleRuns(exam.title, {
        bold: true,
        size: 28,
        color: '0F172A',
        font: 'Times New Roman',
      }),
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: `Môn: ${SUBJECT_NAMES[exam.subject] || exam.subject}   ·   ${exam.grade}   ·   Thời gian làm bài: ${exam.durationMinutes} phút   ·   Tổng điểm: ${exam.totalPoints || 10} điểm${
            exam.examCode ? `   ·   Mã đề: ${exam.examCode}` : ''
          }`,
          italics: true,
          size: 21,
          color: '334155',
          font: 'Times New Roman',
        }),
      ],
    }),
    new Paragraph({
      spacing: { before: 60, after: 140 },
      children: [
        new TextRun({
          text: 'Họ và tên thí sinh: ........................................................................   Số báo danh / Lớp: ..............................',
          size: 22,
          font: 'Times New Roman',
        }),
      ],
    })
  );

  if (exam.instructions) {
    docChildren.push(
      new Paragraph({
        spacing: { after: 160 },
        children: [
          new TextRun({
            text: 'Hướng dẫn làm bài: ',
            bold: true,
            italics: true,
            size: 21,
            font: 'Times New Roman',
          }),
          ...buildDocxMathTextRuns(exam.instructions, {
            italics: true,
            size: 21,
            font: 'Times New Roman',
          }),
        ],
      })
    );
  }

  for (let idx = 0; idx < orderedQuestions.length; idx++) {
    const q = orderedQuestions[idx];
    const prevQ = idx > 0 ? orderedQuestions[idx - 1] : null;

    if (isGroupedByType) {
      const clusterInfo = clusters.find((c) => c.type === (q.type || 'single_choice'));
      if (clusterInfo && (!prevQ || (prevQ.type || 'single_choice') !== (q.type || 'single_choice'))) {
        docChildren.push(
          new Paragraph({
            spacing: { before: 200, after: 100 },
            children: [
              new TextRun({
                text: `PHẦN ${clusterInfo.roman}. ${clusterInfo.partTitle.toUpperCase()} (${clusterInfo.items.length} câu)`,
                bold: true,
                size: 23,
                color: '1E3A8A',
                font: 'Times New Roman',
              }),
            ],
          })
        );
      }
    }

    const qBlocks = await buildRichTextChildren(
      q.question,
      q.imageUrl,
      new TextRun({
        text: `Câu ${idx + 1} (${q.points || 1}đ): `,
        bold: true,
        size: 22,
        font: 'Times New Roman',
      }),
      q.inlineImages
    );
    docChildren.push(...qBlocks);

    // Format 1: single_choice & multiple_choice
    if ((q.type === 'single_choice' || q.type === 'multiple_choice') && q.options) {
      if (q.type === 'multiple_choice') {
        docChildren.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: '(Có thể chọn nhiều phương án đúng)',
                italics: true,
                size: 20,
                color: '475569',
                font: 'Times New Roman',
              }),
            ],
          })
        );
      }
      for (let oIdx = 0; oIdx < q.options.length; oIdx++) {
        const letter = String.fromCharCode(65 + oIdx);
        const optBlocks = await buildRichTextChildren(
          q.options[oIdx],
          q.optionImages?.[oIdx],
          new TextRun({
            text: `    ${letter}. `,
            bold: true,
            size: 22,
            font: 'Times New Roman',
          }),
          q.inlineImages
        );
        docChildren.push(...optBlocks);
      }
    }

    // Format 2: true_false
    if (q.type === 'true_false' && q.tfItems) {
      docChildren.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: `(${formatTrueFalseScoringRule(q)})`,
              italics: true,
              size: 20,
              color: '475569',
              font: 'Times New Roman',
            }),
          ],
        })
      );

      const tfRows = [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 76, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: 'Mệnh đề', bold: true, size: 21, font: 'Times New Roman' })],
                }),
              ],
            }),
            new TableCell({
              width: { size: 12, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: 'Đúng', bold: true, size: 21, font: 'Times New Roman' })],
                }),
              ],
            }),
            new TableCell({
              width: { size: 12, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: 'Sai', bold: true, size: 21, font: 'Times New Roman' })],
                }),
              ],
            }),
          ],
        }),
        ...q.tfItems.map((it, tIdx) => {
          const letter = String.fromCharCode(97 + tIdx);
          return new TableRow({
            children: [
              new TableCell({
                width: { size: 76, type: WidthType.PERCENTAGE },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: `${letter}) `, bold: true, size: 21, font: 'Times New Roman' }),
                      ...buildDocxMathTextRuns(it.statement, {
                        size: 21,
                        font: 'Times New Roman',
                      }),
                    ],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 12, type: WidthType.PERCENTAGE },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: '☐', size: 22, font: 'Times New Roman' })],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 12, type: WidthType.PERCENTAGE },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: '☐', size: 22, font: 'Times New Roman' })],
                  }),
                ],
              }),
            ],
          });
        }),
      ];

      docChildren.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: tfRows,
        })
      );
    }

    // Format 3: text_input
    if (q.type === 'text_input') {
      docChildren.push(
        new Paragraph({
          spacing: { before: 40, after: 100 },
          children: [
            new TextRun({
              text: '    Trả lời: ....................................................................................',
              size: 22,
              font: 'Times New Roman',
            }),
          ],
        })
      );
    }

    // Format 3b: essay
    if (q.type === 'essay') {
      for (let lineIdx = 0; lineIdx < 4; lineIdx++) {
        docChildren.push(
          new Paragraph({
            spacing: { before: lineIdx === 0 ? 40 : 20, after: lineIdx === 3 ? 100 : 20 },
            children: [
              new TextRun({
                text: lineIdx === 0
                  ? '    Bài làm: ..........................................................................................................'
                  : '    ......................................................................................................................',
                size: 22,
                font: 'Times New Roman',
              }),
            ],
          })
        );
      }
    }

    // Format 4: matching
    if (q.type === 'matching') {
      const leftItems = q.matchingLeftItems || [];
      const rightItems = q.matchingRightItems || [];
      const maxRows = Math.max(leftItems.length, rightItems.length);

      const matchTableRows: TableRow[] = [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: 'Cột trái', bold: true, size: 21, font: 'Times New Roman' })],
                }),
              ],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: 'Cột phải (có phương án nhiễu)', bold: true, size: 21, font: 'Times New Roman' })],
                }),
              ],
            }),
          ],
        }),
      ];

      for (let r = 0; r < maxRows; r++) {
        const left = leftItems[r];
        const right = rightItems[r];
        const leftLbl = left
          ? formatMatchingLabel(r, q.matchingLeftLabelStyle || 'number', left.label)
          : '';
        const rightLbl = right
          ? formatMatchingLabel(r, q.matchingRightLabelStyle || 'upper_alpha', right.label)
          : '';

        const leftChildren: Paragraph[] = [];
        if (left) {
          const leftContentRuns = left.content
            ? buildDocxMathTextRuns(left.content, { size: 21, font: 'Times New Roman' })
            : [];
          leftChildren.push(
            new Paragraph({
              spacing: { before: 40, after: 40 },
              children: [
                new TextRun({ text: `${leftLbl}. `, bold: true, size: 21, font: 'Times New Roman' }),
                ...leftContentRuns,
              ],
            })
          );
          if (left.imageUrl) {
            const resolvedLeftImg = await resolveImageForDocx(left.imageUrl, 200);
            if (resolvedLeftImg) {
              leftChildren.push(
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 40, after: 60 },
                  children: [
                    new ImageRun({
                      type: resolvedLeftImg.type,
                      data: resolvedLeftImg.data,
                      transformation: {
                        width: resolvedLeftImg.width,
                        height: resolvedLeftImg.height,
                      },
                    }),
                  ],
                })
              );
            }
          }
        } else {
          leftChildren.push(new Paragraph({ children: [] }));
        }

        const rightChildren: Paragraph[] = [];
        if (right) {
          const rightContentRuns = right.content
            ? buildDocxMathTextRuns(right.content, { size: 21, font: 'Times New Roman' })
            : [];
          rightChildren.push(
            new Paragraph({
              spacing: { before: 40, after: 40 },
              children: [
                new TextRun({ text: `${rightLbl}. `, bold: true, size: 21, font: 'Times New Roman' }),
                ...rightContentRuns,
              ],
            })
          );
          if (right.imageUrl) {
            const resolvedRightImg = await resolveImageForDocx(right.imageUrl, 200);
            if (resolvedRightImg) {
              rightChildren.push(
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 40, after: 60 },
                  children: [
                    new ImageRun({
                      type: resolvedRightImg.type,
                      data: resolvedRightImg.data,
                      transformation: {
                        width: resolvedRightImg.width,
                        height: resolvedRightImg.height,
                      },
                    }),
                  ],
                })
              );
            }
          }
        } else {
          rightChildren.push(new Paragraph({ children: [] }));
        }

        matchTableRows.push(
          new TableRow({
            children: [
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                children: leftChildren,
              }),
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                children: rightChildren,
              }),
            ],
          })
        );
      }

      docChildren.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: matchTableRows,
        })
      );

      const blankPairs = leftItems
        .map((left, rIdx) => {
          const lbl = formatMatchingLabel(rIdx, q.matchingLeftLabelStyle || 'number', left.label);
          return `${lbl} - .........`;
        })
        .join('     ');

      docChildren.push(
        new Paragraph({
          spacing: { before: 80, after: 100 },
          children: [
            new TextRun({
              text: '    Ghép đáp án:   ',
              bold: true,
              size: 21,
              font: 'Times New Roman',
            }),
            new TextRun({
              text: blankPairs,
              size: 21,
              font: 'Times New Roman',
            }),
          ],
        })
      );
    }

    // Format 5: grouped
    if (q.type === 'grouped' && q.subQuestions) {
      for (let sIdx = 0; sIdx < q.subQuestions.length; sIdx++) {
        const sub = q.subQuestions[sIdx];
        const subBlocks = await buildRichTextChildren(
          sub.question,
          sub.imageUrl,
          new TextRun({
            text: `    ${idx + 1}.${sIdx + 1}) `,
            bold: true,
            size: 21,
            font: 'Times New Roman',
          }),
          sub.inlineImages || q.inlineImages
        );
        docChildren.push(...subBlocks);

        if ((sub.type || 'single_choice') === 'single_choice' && sub.options) {
          for (let oIdx = 0; oIdx < sub.options.length; oIdx++) {
            const letter = String.fromCharCode(65 + oIdx);
            const subOptBlocks = await buildRichTextChildren(
              sub.options[oIdx],
              sub.optionImages?.[oIdx],
              new TextRun({
                text: `        ${letter}. `,
                bold: true,
                size: 21,
                font: 'Times New Roman',
              }),
              sub.inlineImages || q.inlineImages
            );
            docChildren.push(...subOptBlocks);
          }
        } else if (sub.type === 'text_input') {
          docChildren.push(
            new Paragraph({
              spacing: { after: 60 },
              children: [
                new TextRun({
                  text: '        Trả lời: ........................................................................',
                  size: 21,
                  font: 'Times New Roman',
                }),
              ],
            })
          );
        }
      }
    }

    // Spacing after each question
    docChildren.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
  }

  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
      children: [
        new TextRun({
          text: '--- HẾT ---',
          bold: true,
          size: 22,
          font: 'Times New Roman',
        }),
      ],
    })
  );

  // Separate Page for Answer Key & Explanations (when includeAnswers = true)
  if (includeAnswers) {
    docChildren.push(new Paragraph({ children: [new PageBreak()] }));
    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [
          new TextRun({
            text: 'ĐÁP ÁN & HƯỚNG DẪN GIẢI CHI TIẾT — ',
            bold: true,
            size: 24,
            color: '065F46',
            font: 'Times New Roman',
          }),
          ...buildDocxUpperTitleRuns(exam.title, {
            bold: true,
            size: 24,
            color: '065F46',
            font: 'Times New Roman',
          }),
        ],
      })
    );

    for (let idx = 0; idx < orderedQuestions.length; idx++) {
      const q = orderedQuestions[idx];
      const ansSummary = getCorrectAnswerSummary(q);
      docChildren.push(
        new Paragraph({
          spacing: { before: 80, after: 40 },
          children: [
            new TextRun({
              text: `Câu ${idx + 1}: `,
              bold: true,
              size: 22,
              font: 'Times New Roman',
            }),
            ...buildDocxMathTextRuns(ansSummary, {
              bold: true,
              color: '047857',
              size: 22,
              font: 'Times New Roman',
            }),
          ],
        })
      );

      if (includeExplanations && ((q.explanation && q.explanation.trim()) || q.explanationImageUrl)) {
        const expBlocks = await buildRichTextChildren(
          q.explanation || '',
          q.explanationImageUrl,
          new TextRun({
            text: '    Lời giải: ',
            italics: true,
            bold: true,
            size: 21,
            color: '1E40AF',
            font: 'Times New Roman',
          }),
          q.inlineImages
        );
        docChildren.push(...expBlocks);
      }
      if (includeExplanations && q.type === 'grouped' && q.subQuestions) {
        for (let sIdx = 0; sIdx < q.subQuestions.length; sIdx++) {
          const sub = q.subQuestions[sIdx];
          if ((sub.explanation && sub.explanation.trim()) || sub.explanationImageUrl) {
            const subExpBlocks = await buildRichTextChildren(
              sub.explanation || '',
              sub.explanationImageUrl,
              new TextRun({
                text: `    Lời giải ý ${idx + 1}.${sIdx + 1}: `,
                italics: true,
                bold: true,
                size: 20,
                color: '1E40AF',
                font: 'Times New Roman',
              }),
              sub.inlineImages || q.inlineImages
            );
            docChildren.push(...subExpBlocks);
          }
        }
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: docChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const suffix = includeAnswers ? '_KemDapAn' : '';
  const finalName = `${sanitizeFileName(exam.title)}${suffix}.docx`;
  a.href = url;
  a.download = finalName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { success: true, fileName: finalName };
}
