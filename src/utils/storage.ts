import { Exam, ExamBundle, ExamResult, UserExamState } from '../types/exam';
import { PRESET_EXAMS, PRESET_BUNDLES, SAMPLE_DEMO_EXAM } from '../data/presetExams';

const STORAGE_KEY_CUSTOM_EXAMS = 'edutest_custom_exams_v1';
const STORAGE_KEY_CUSTOM_BUNDLES = 'edutest_custom_bundles_v1';
const STORAGE_KEY_DELETED_EXAMS = 'edutest_deleted_exam_ids_v1';
const STORAGE_KEY_DELETED_BUNDLES = 'edutest_deleted_bundle_ids_v1';
const STORAGE_KEY_RESULTS = 'edutest_results_v1';
const STORAGE_KEY_ACTIVE_SESSION = 'edutest_active_session_v1';

function getDeletedExamIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DELETED_EXAMS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function getDeletedBundleIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DELETED_BUNDLES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getAllExams(): Exam[] {
  try {
    const deletedIds = new Set(getDeletedExamIds());
    const rawCustom = localStorage.getItem(STORAGE_KEY_CUSTOM_EXAMS);
    const customExams: Exam[] = rawCustom ? JSON.parse(rawCustom) : [];
    const all = [...PRESET_EXAMS, ...customExams];
    return all.filter((e) => !deletedIds.has(e.id));
  } catch (err) {
    console.error('Error reading custom exams from localStorage', err);
    return PRESET_EXAMS;
  }
}

export function loadSampleDemoExam(): void {
  // If demo exam was previously deleted, un-blacklist it
  try {
    const deleted = getDeletedExamIds().filter((id) => id !== SAMPLE_DEMO_EXAM.id);
    localStorage.setItem(STORAGE_KEY_DELETED_EXAMS, JSON.stringify(deleted));
  } catch (e) {
    console.error(e);
  }
  saveCustomExam(SAMPLE_DEMO_EXAM);
}

export function deleteAllExams(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_CUSTOM_EXAMS);
    const allPresetIds = PRESET_EXAMS.map((e) => e.id);
    if (SAMPLE_DEMO_EXAM) allPresetIds.push(SAMPLE_DEMO_EXAM.id);
    const curr = getDeletedExamIds();
    const updated = Array.from(new Set([...curr, ...allPresetIds]));
    localStorage.setItem(STORAGE_KEY_DELETED_EXAMS, JSON.stringify(updated));
  } catch (err) {
    console.error('Error deleting all exams', err);
  }
}

export function saveCustomExam(newExam: Exam): void {
  try {
    // If saving/updating, ensure it's not marked as deleted
    const deleted = getDeletedExamIds().filter((id) => id !== newExam.id);
    localStorage.setItem(STORAGE_KEY_DELETED_EXAMS, JSON.stringify(deleted));

    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_EXAMS);
    const customExams: Exam[] = raw ? JSON.parse(raw) : [];
    const updated = [newExam, ...customExams.filter((e) => e.id !== newExam.id)];
    localStorage.setItem(STORAGE_KEY_CUSTOM_EXAMS, JSON.stringify(updated));
  } catch (err) {
    console.error('Error saving custom exam', err);
  }
}

export function deleteCustomExam(examId: string): void {
  try {
    // 1. Mark as deleted in blacklist to also block presets
    const deleted = Array.from(new Set([...getDeletedExamIds(), examId]));
    localStorage.setItem(STORAGE_KEY_DELETED_EXAMS, JSON.stringify(deleted));

    // 2. Remove from custom exams
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_EXAMS);
    if (raw) {
      const customExams: Exam[] = JSON.parse(raw);
      const updated = customExams.filter((e) => e.id !== examId);
      localStorage.setItem(STORAGE_KEY_CUSTOM_EXAMS, JSON.stringify(updated));
    }
  } catch (err) {
    console.error('Error deleting custom exam', err);
  }
}

export function getAllBundles(): ExamBundle[] {
  try {
    const deletedIds = new Set(getDeletedBundleIds());
    const rawCustom = localStorage.getItem(STORAGE_KEY_CUSTOM_BUNDLES);
    const customBundles: ExamBundle[] = rawCustom ? JSON.parse(rawCustom) : [];
    const all = [...PRESET_BUNDLES, ...customBundles];
    return all.filter((b) => !deletedIds.has(b.id));
  } catch (err) {
    console.error('Error reading bundles from localStorage', err);
    return PRESET_BUNDLES;
  }
}

export function saveCustomBundle(newBundle: ExamBundle): void {
  try {
    const deleted = getDeletedBundleIds().filter((id) => id !== newBundle.id);
    localStorage.setItem(STORAGE_KEY_DELETED_BUNDLES, JSON.stringify(deleted));

    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_BUNDLES);
    const customBundles: ExamBundle[] = raw ? JSON.parse(raw) : [];
    const updated = [newBundle, ...customBundles.filter((b) => b.id !== newBundle.id)];
    localStorage.setItem(STORAGE_KEY_CUSTOM_BUNDLES, JSON.stringify(updated));
  } catch (err) {
    console.error('Error saving custom bundle', err);
  }
}

export function deleteCustomBundle(bundleId: string): void {
  try {
    const deleted = Array.from(new Set([...getDeletedBundleIds(), bundleId]));
    localStorage.setItem(STORAGE_KEY_DELETED_BUNDLES, JSON.stringify(deleted));

    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_BUNDLES);
    if (raw) {
      const customBundles: ExamBundle[] = JSON.parse(raw);
      const updated = customBundles.filter((b) => b.id !== bundleId);
      localStorage.setItem(STORAGE_KEY_CUSTOM_BUNDLES, JSON.stringify(updated));
    }
  } catch (err) {
    console.error('Error deleting custom bundle', err);
  }
}

export function getExamResults(): ExamResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RESULTS);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Error reading exam results', err);
    return [];
  }
}

export function saveExamResult(result: ExamResult): void {
  try {
    const results = getExamResults();
    localStorage.setItem(STORAGE_KEY_RESULTS, JSON.stringify([result, ...results]));
  } catch (err) {
    console.error('Error saving exam result', err);
  }
}

export function deleteExamResult(resultId: string): void {
  try {
    const results = getExamResults();
    const updated = results.filter((r) => r.id !== resultId);
    localStorage.setItem(STORAGE_KEY_RESULTS, JSON.stringify(updated));
  } catch (err) {
    console.error('Error deleting exam result', err);
  }
}

export function clearExamResults(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_RESULTS);
  } catch (err) {
    console.error('Error clearing results', err);
  }
}

export function saveActiveSession(session: UserExamState | null): void {
  try {
    if (session) {
      localStorage.setItem(STORAGE_KEY_ACTIVE_SESSION, JSON.stringify(session));
    } else {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_SESSION);
    }
  } catch (err) {
    console.error('Error saving active session', err);
  }
}

export function getActiveSession(): UserExamState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACTIVE_SESSION);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

const STORAGE_KEY_LIVE_TEXT = 'edutest_live_text_overrides_v1';

export function getLiveTextOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LIVE_TEXT);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
}

export function saveLiveTextOverride(key: string, text: string): void {
  try {
    const curr = getLiveTextOverrides();
    curr[key] = text;
    localStorage.setItem(STORAGE_KEY_LIVE_TEXT, JSON.stringify(curr));
  } catch (err) {
    console.error('Error saving live text override', err);
  }
}

export function clearLiveTextOverrides(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_LIVE_TEXT);
  } catch (err) {
    console.error('Error clearing live text overrides', err);
  }
}

