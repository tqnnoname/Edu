import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Edit3,
  FolderTree,
  GitBranch,
  HelpCircle,
  Image as ImageIcon,
  IndentDecrease,
  IndentIncrease,
  Layers,
  Paperclip,
  Plus,
  Save,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import {
  CourseChapter,
  CourseLesson,
  LessonBlock,
  LessonBlockType,
  LessonSection,
  MicroCourse,
} from '../types/exam';
import {
  buildOrderedSectionNodes,
  getSectionDescendantIds,
  OrderedSectionNode,
} from '../utils/courseSections';
import { insertTextAtEditableElement } from '../utils/cursorInsert';
import {
  collectUsedInlineImages,
  extractImageFileFromClipboardEvent,
  formatInlineImageToken,
  registerImplicitImage,
  registerImplicitImagesMap,
} from '../utils/inlineImages';
import { processImageFile } from '../utils/imageUpload';
import { uploadImageOrKeepFallback } from '../utils/courseMedia';
import { MathToolbar } from './MathToolbar';
import { RichContentRenderer } from './RichContentRenderer';
import { InlineImageStrip, InlineImageTitleModal } from './InlineImageTitleModal';
import { ConfirmModal } from './ConfirmModal';

type TreeSelection =
  | { kind: 'course' }
  | { kind: 'chapter'; chapterId: string }
  | { kind: 'lesson'; chapterId: string; lessonId: string }
  | { kind: 'section'; chapterId: string; lessonId: string; sectionId: string }
  | { kind: 'block'; chapterId: string; lessonId: string; blockId: string };

interface CourseContentTreeProps {
  course: MicroCourse;
  onUpdateCourse: (updatedCourse: MicroCourse, toastMessage?: string) => void;
  onOpenLessonInPlayer: (chapterId: string, lessonId: string, blockId?: string) => void;
  onOpenCreateBlockModal: (
    chapterId: string,
    lessonId: string,
    preferredType: LessonBlockType,
    sectionId?: string
  ) => void;
  onOpenEditBlockModal: (chapterId: string, lessonId: string, block: LessonBlock) => void;
}

function getBlockLabel(block: LessonBlock): string {
  if (block.title?.trim()) return block.title.trim();
  if (block.type === 'theory') return 'Lý thuyết';
  if (block.type === 'callout') return 'Ghi nhớ / Công thức';
  if (block.type === 'image') return 'Hình ảnh minh họa';
  if (block.type === 'file') return 'Tài liệu đính kèm';
  if (block.type === 'question') return 'Câu hỏi tương tác';
  return 'Khối nội dung';
}

function renderBlockTypeBadge(type: LessonBlockType) {
  switch (type) {
    case 'theory':
      return <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold shrink-0">Lý thuyết</span>;
    case 'callout':
      return <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold shrink-0">Ghi nhớ</span>;
    case 'image':
      return <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold shrink-0">Hình ảnh</span>;
    case 'file':
      return <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold shrink-0">Tài liệu</span>;
    case 'question':
      return <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold shrink-0">Câu hỏi</span>;
    default:
      return <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold shrink-0">Khối</span>;
  }
}

export const CourseContentTree: React.FC<CourseContentTreeProps> = ({
  course,
  onUpdateCourse,
  onOpenLessonInPlayer,
  onOpenCreateBlockModal,
  onOpenEditBlockModal,
}) => {
  const chapters = useMemo(() => {
    if (course.chapters && course.chapters.length > 0) return course.chapters;
    if (course.lessons && course.lessons.length > 0) {
      return [
        {
          id: 'chap_legacy',
          title: 'Chương 1: Nội dung khóa học',
          description: '',
          order: 1,
          lessons: course.lessons,
        } as CourseChapter,
      ];
    }
    return [] as CourseChapter[];
  }, [course]);

  const [selection, setSelection] = useState<TreeSelection>({ kind: 'course' });
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Inspector form drafts
  const [draftTitle, setDraftTitle] = useState('');
  const [draftSummary, setDraftSummary] = useState('');
  const [draftInlineImages, setDraftInlineImages] = useState<Record<string, string>>({});
  const [draftDuration, setDraftDuration] = useState<number>(25);
  const [draftParentChapterId, setDraftParentChapterId] = useState<string>('');
  const [draftParentSectionId, setDraftParentSectionId] = useState<string>('');
  const [draftBlockLessonId, setDraftBlockLessonId] = useState<string>('');
  const [draftCalloutType, setDraftCalloutType] = useState<'info' | 'tip' | 'warning' | 'formula'>('formula');
  const [isDirty, setIsDirty] = useState(false);

  const summaryTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [pasteModal, setPasteModal] = useState<{
    imageSrc: string;
    defaultTitle: string;
    el: HTMLTextAreaElement | null;
    range: { start: number; end: number } | null;
  } | null>(null);

  // Sync selection if target node disappears
  const selectedObjects = useMemo(() => {
    if (selection.kind === 'course') return { kind: 'course' as const };
    const chap = chapters.find((c) => c.id === selection.chapterId);
    if (!chap) return null;
    if (selection.kind === 'chapter') return { kind: 'chapter' as const, chap };
    const les = (chap.lessons || []).find((l) => l.id === selection.lessonId);
    if (!les) return null;
    if (selection.kind === 'lesson') return { kind: 'lesson' as const, chap, les };
    if (selection.kind === 'section') {
      const sec = (les.sections || []).find((s) => s.id === selection.sectionId);
      if (!sec) return null;
      return { kind: 'section' as const, chap, les, sec };
    }
    const blk = (les.blocks || []).find((b) => b.id === selection.blockId);
    if (!blk) return null;
    return { kind: 'block' as const, chap, les, blk };
  }, [chapters, selection]);

  useEffect(() => {
    if (!selectedObjects) {
      setSelection({ kind: 'course' });
    }
  }, [selectedObjects]);

  // Populate Inspector fields when selection or underlying node changes
  const selectionSignature = useMemo(() => {
    if (!selectedObjects) return 'none';
    if (selectedObjects.kind === 'course') return `course:${course.id}:${course.title}:${course.description || ''}`;
    if (selectedObjects.kind === 'chapter') {
      const c = selectedObjects.chap;
      return `chapter:${c.id}:${c.title}:${c.description || ''}`;
    }
    if (selectedObjects.kind === 'lesson') {
      const l = selectedObjects.les;
      return `lesson:${selectedObjects.chap.id}:${l.id}:${l.title}:${l.summary || ''}:${l.durationMinutes || 25}`;
    }
    if (selectedObjects.kind === 'section') {
      const s = selectedObjects.sec;
      return `section:${selectedObjects.les.id}:${s.id}:${s.title}:${s.summary || ''}:${s.parentSectionId || ''}`;
    }
    const b = selectedObjects.blk;
    return `block:${selectedObjects.les.id}:${b.id}:${b.title || ''}:${b.contentMarkdown || ''}:${b.caption || ''}:${b.sectionId || ''}:${b.calloutType || ''}`;
  }, [selectedObjects, course.id, course.title, course.description]);

  useEffect(() => {
    if (!selectedObjects) return;
    if (selectedObjects.kind === 'course') {
      registerImplicitImagesMap(course.inlineImages);
      setDraftTitle(course.title || '');
      setDraftSummary(course.description || '');
      setDraftInlineImages(course.inlineImages ? { ...course.inlineImages } : {});
    } else if (selectedObjects.kind === 'chapter') {
      registerImplicitImagesMap(selectedObjects.chap.inlineImages);
      setDraftTitle(selectedObjects.chap.title || '');
      setDraftSummary(selectedObjects.chap.description || '');
      setDraftInlineImages(
        selectedObjects.chap.inlineImages ? { ...selectedObjects.chap.inlineImages } : {}
      );
    } else if (selectedObjects.kind === 'lesson') {
      registerImplicitImagesMap(selectedObjects.les.inlineImages);
      setDraftTitle(selectedObjects.les.title || '');
      setDraftSummary(selectedObjects.les.summary || '');
      setDraftDuration(selectedObjects.les.durationMinutes || 25);
      setDraftParentChapterId(selectedObjects.chap.id);
      setDraftInlineImages(
        selectedObjects.les.inlineImages ? { ...selectedObjects.les.inlineImages } : {}
      );
    } else if (selectedObjects.kind === 'section') {
      registerImplicitImagesMap(selectedObjects.sec.inlineImages);
      setDraftTitle(selectedObjects.sec.title || '');
      setDraftSummary(selectedObjects.sec.summary || '');
      setDraftParentSectionId(selectedObjects.sec.parentSectionId || '');
      setDraftInlineImages(
        selectedObjects.sec.inlineImages ? { ...selectedObjects.sec.inlineImages } : {}
      );
    } else if (selectedObjects.kind === 'block') {
      const b = selectedObjects.blk;
      registerImplicitImagesMap(b.inlineImages);
      setDraftTitle(b.title || '');
      setDraftSummary(b.type === 'image' ? b.caption || '' : b.contentMarkdown || '');
      setDraftBlockLessonId(selectedObjects.les.id);
      setDraftParentSectionId(b.sectionId || '');
      setDraftCalloutType(b.calloutType || 'formula');
      setDraftInlineImages(b.inlineImages ? { ...b.inlineImages } : {});
    }
    setIsDirty(false);
  }, [selectionSignature]);

  const isExpanded = (nodeKey: string) => expandedNodes[nodeKey] ?? true;
  const toggleExpand = (nodeKey: string) => {
    setExpandedNodes((prev) => ({ ...prev, [nodeKey]: !(prev[nodeKey] ?? true) }));
  };

  const setAllExpanded = (expand: boolean) => {
    const next: Record<string, boolean> = {};
    chapters.forEach((ch) => {
      next[`ch:${ch.id}`] = expand;
      (ch.lessons || []).forEach((les) => {
        next[`les:${les.id}`] = expand;
        (les.sections || []).forEach((sec) => {
          next[`sec:${sec.id}`] = expand;
        });
      });
    });
    setExpandedNodes(next);
  };

  const commitChapters = (nextChapters: CourseChapter[], toastMsg?: string) => {
    const normalized = nextChapters.map((ch, idx) => ({ ...ch, order: idx + 1 }));
    onUpdateCourse({ ...course, chapters: normalized, lessons: [] }, toastMsg);
  };

  const stats = useMemo(() => {
    let lessonCount = 0;
    let sectionCount = 0;
    let blockCount = 0;
    chapters.forEach((ch) => {
      (ch.lessons || []).forEach((les) => {
        lessonCount += 1;
        sectionCount += (les.sections || []).length;
        blockCount += (les.blocks || []).length;
      });
    });
    return { chapterCount: chapters.length, lessonCount, sectionCount, blockCount };
  }, [chapters]);

  // --- Structural Operations ---
  const handleAddChapter = () => {
    const newChap: CourseChapter = {
      id: `chap_${Date.now()}`,
      title: `Chương ${chapters.length + 1}: Chương mới`,
      description: '',
      order: chapters.length + 1,
      lessons: [],
    };
    const next = [...chapters, newChap];
    commitChapters(next, '✓ Đã thêm chương mới vào cây nội dung!');
    setExpandedNodes((prev) => ({ ...prev, [`ch:${newChap.id}`]: true }));
    setSelection({ kind: 'chapter', chapterId: newChap.id });
  };

  const handleMoveChapter = (chapterId: string, dir: 'up' | 'down') => {
    const idx = chapters.findIndex((c) => c.id === chapterId);
    if (idx === -1) return;
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= chapters.length) return;
    const next = [...chapters];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    commitChapters(next, '✓ Đã cập nhật thứ tự chương!');
  };

  const handleDeleteChapter = (chap: CourseChapter) => {
    setConfirmState({
      isOpen: true,
      title: 'Xóa chương khỏi khóa học',
      message: `Xóa "${chap.title}" cùng toàn bộ ${(chap.lessons || []).length} bài học bên trong? Thao tác này sẽ cập nhật ngay nội dung gốc của khóa học.`,
      onConfirm: () => {
        commitChapters(
          chapters.filter((c) => c.id !== chap.id),
          `✓ Đã xóa chương "${chap.title}".`
        );
        setSelection({ kind: 'course' });
      },
    });
  };

  const handleAddLesson = (chapterId: string) => {
    const chap = chapters.find((c) => c.id === chapterId);
    if (!chap) return;
    const newLes: CourseLesson = {
      id: `les_${Date.now()}`,
      title: `Bài ${(chap.lessons || []).length + 1}: Bài học mới`,
      durationMinutes: 25,
      summary: '',
      blocks: [],
      sections: [],
    };
    const next = chapters.map((c) =>
      c.id === chapterId ? { ...c, lessons: [...(c.lessons || []), newLes] } : c
    );
    commitChapters(next, '✓ Đã thêm bài học mới!');
    setExpandedNodes((prev) => ({ ...prev, [`ch:${chapterId}`]: true, [`les:${newLes.id}`]: true }));
    setSelection({ kind: 'lesson', chapterId, lessonId: newLes.id });
  };

  const handleMoveLesson = (chapterId: string, lessonId: string, dir: 'up' | 'down') => {
    const chap = chapters.find((c) => c.id === chapterId);
    if (!chap) return;
    const list = [...(chap.lessons || [])];
    const idx = list.findIndex((l) => l.id === lessonId);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (idx === -1 || swapIdx < 0 || swapIdx >= list.length) return;
    [list[idx], list[swapIdx]] = [list[swapIdx], list[idx]];
    commitChapters(
      chapters.map((c) => (c.id === chapterId ? { ...c, lessons: list } : c)),
      '✓ Đã đổi thứ tự bài học!'
    );
  };

  const handleDeleteLesson = (chapterId: string, les: CourseLesson) => {
    setConfirmState({
      isOpen: true,
      title: 'Xóa bài học khỏi chương',
      message: `Xóa bài học "${les.title}" cùng ${(les.sections || []).length} phân mục và ${(les.blocks || []).length} khối nội dung?`,
      onConfirm: () => {
        commitChapters(
          chapters.map((c) =>
            c.id === chapterId
              ? { ...c, lessons: (c.lessons || []).filter((l) => l.id !== les.id) }
              : c
          ),
          `✓ Đã xóa bài "${les.title}".`
        );
        setSelection({ kind: 'chapter', chapterId });
      },
    });
  };

  const handleAddSection = (chapterId: string, lessonId: string, parentSectionId?: string) => {
    const chap = chapters.find((c) => c.id === chapterId);
    const les = chap?.lessons.find((l) => l.id === lessonId);
    if (!les) return;
    const existing = les.sections || [];
    const siblings = existing.filter((s) => (s.parentSectionId || '') === (parentSectionId || ''));
    const maxOrder = siblings.reduce((m, s) => Math.max(m, s.order || 0), 0);
    const newSec: LessonSection = {
      id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      title: parentSectionId ? `Mục con ${siblings.length + 1}` : `Phân mục ${siblings.length + 1}`,
      summary: '',
      parentSectionId: parentSectionId || undefined,
      order: maxOrder + 1,
    };
    const next = chapters.map((c) =>
      c.id === chapterId
        ? {
            ...c,
            lessons: c.lessons.map((l) =>
              l.id === lessonId ? { ...l, sections: [...existing, newSec] } : l
            ),
          }
        : c
    );
    commitChapters(next, parentSectionId ? '✓ Đã thêm phân mục con!' : '✓ Đã thêm phân mục mới!');
    setExpandedNodes((prev) => ({
      ...prev,
      [`ch:${chapterId}`]: true,
      [`les:${lessonId}`]: true,
      ...(parentSectionId ? { [`sec:${parentSectionId}`]: true } : {}),
      [`sec:${newSec.id}`]: true,
    }));
    setSelection({ kind: 'section', chapterId, lessonId, sectionId: newSec.id });
  };

  const updateLessonSections = (
    chapterId: string,
    lessonId: string,
    updater: (sections: LessonSection[], blocks: LessonBlock[]) => {
      sections: LessonSection[];
      blocks?: LessonBlock[];
    },
    toastMsg?: string
  ) => {
    const next = chapters.map((c) => {
      if (c.id !== chapterId) return c;
      return {
        ...c,
        lessons: c.lessons.map((l) => {
          if (l.id !== lessonId) return l;
          const res = updater([...(l.sections || [])], [...(l.blocks || [])]);
          return {
            ...l,
            sections: res.sections,
            blocks: res.blocks ?? l.blocks,
          };
        }),
      };
    });
    commitChapters(next, toastMsg);
  };

  const handleMoveSectionSibling = (
    chapterId: string,
    lessonId: string,
    sectionId: string,
    dir: 'up' | 'down'
  ) => {
    updateLessonSections(
      chapterId,
      lessonId,
      (sections) => {
        const target = sections.find((s) => s.id === sectionId);
        if (!target) return { sections };
        const parentKey = target.parentSectionId || '';
        const siblings = sections
          .filter((s) => (s.parentSectionId || '') === parentKey)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const idx = siblings.findIndex((s) => s.id === sectionId);
        const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (idx === -1 || swapIdx < 0 || swapIdx >= siblings.length) return { sections };
        [siblings[idx], siblings[swapIdx]] = [siblings[swapIdx], siblings[idx]];
        const orderMap = new Map<string, number>();
        siblings.forEach((s, i) => orderMap.set(s.id, i + 1));
        return {
          sections: sections.map((s) =>
            orderMap.has(s.id) ? { ...s, order: orderMap.get(s.id)! } : s
          ),
        };
      },
      '✓ Đã sắp xếp lại vị trí phân mục!'
    );
  };

  const handlePromoteSection = (chapterId: string, lessonId: string, sectionId: string) => {
    updateLessonSections(
      chapterId,
      lessonId,
      (sections) => {
        const target = sections.find((s) => s.id === sectionId);
        if (!target || !target.parentSectionId) return { sections };
        const parentSec = sections.find((s) => s.id === target.parentSectionId);
        const newParentId = parentSec?.parentSectionId || undefined;
        const siblingsAtDest = sections.filter(
          (s) => (s.parentSectionId || '') === (newParentId || '') && s.id !== sectionId
        );
        const maxOrder = siblingsAtDest.reduce((m, s) => Math.max(m, s.order || 0), 0);
        return {
          sections: sections.map((s) =>
            s.id === sectionId ? { ...s, parentSectionId: newParentId, order: maxOrder + 1 } : s
          ),
        };
      },
      '✓ Đã đưa phân mục ra cấp cha!'
    );
  };

  const handleDemoteSection = (chapterId: string, lessonId: string, sectionId: string) => {
    updateLessonSections(
      chapterId,
      lessonId,
      (sections) => {
        const target = sections.find((s) => s.id === sectionId);
        if (!target) return { sections };
        const parentKey = target.parentSectionId || '';
        const siblings = sections
          .filter((s) => (s.parentSectionId || '') === parentKey)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const idx = siblings.findIndex((s) => s.id === sectionId);
        if (idx <= 0) return { sections };
        const prevSibling = siblings[idx - 1];
        const destChildren = sections.filter((s) => s.parentSectionId === prevSibling.id);
        const maxOrder = destChildren.reduce((m, s) => Math.max(m, s.order || 0), 0);
        return {
          sections: sections.map((s) =>
            s.id === sectionId ? { ...s, parentSectionId: prevSibling.id, order: maxOrder + 1 } : s
          ),
        };
      },
      '✓ Đã lồng phân mục vào làm mục con của mục phía trên!'
    );
  };

  const handleDeleteSection = (
    chapterId: string,
    lessonId: string,
    sec: LessonSection,
    deleteChildrenAndBlocks: boolean
  ) => {
    updateLessonSections(
      chapterId,
      lessonId,
      (sections, blocks) => {
        if (deleteChildrenAndBlocks) {
          const toRemoveIds = getSectionDescendantIds(sections, sec.id);
          return {
            sections: sections.filter((s) => !toRemoveIds.has(s.id)),
            blocks: blocks.filter((b) => !b.sectionId || !toRemoveIds.has(b.sectionId)),
          };
        }
        // Promote direct children to sec.parentSectionId and clear sectionId on blocks
        return {
          sections: sections
            .filter((s) => s.id !== sec.id)
            .map((s) =>
              s.parentSectionId === sec.id ? { ...s, parentSectionId: sec.parentSectionId } : s
            ),
          blocks: blocks.map((b) =>
            b.sectionId === sec.id ? { ...b, sectionId: sec.parentSectionId } : b
          ),
        };
      },
      `✓ Đã xóa phân mục "${sec.title}".`
    );
    setSelection({ kind: 'lesson', chapterId, lessonId });
  };

  const handleMoveBlock = (
    chapterId: string,
    lessonId: string,
    blockId: string,
    dir: 'up' | 'down'
  ) => {
    const next = chapters.map((c) => {
      if (c.id !== chapterId) return c;
      return {
        ...c,
        lessons: c.lessons.map((l) => {
          if (l.id !== lessonId) return l;
          const list = [...(l.blocks || [])];
          const idx = list.findIndex((b) => b.id === blockId);
          const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
          if (idx === -1 || swapIdx < 0 || swapIdx >= list.length) return l;
          [list[idx], list[swapIdx]] = [list[swapIdx], list[idx]];
          return { ...l, blocks: list };
        }),
      };
    });
    commitChapters(next, '✓ Đã đổi thứ tự khối nội dung!');
  };

  const handleDeleteBlock = (chapterId: string, lessonId: string, block: LessonBlock) => {
    setConfirmState({
      isOpen: true,
      title: 'Xóa khối nội dung',
      message: `Xóa "${getBlockLabel(block)}" khỏi bài học?`,
      onConfirm: () => {
        const next = chapters.map((c) =>
          c.id === chapterId
            ? {
                ...c,
                lessons: c.lessons.map((l) =>
                  l.id === lessonId
                    ? { ...l, blocks: (l.blocks || []).filter((b) => b.id !== block.id) }
                    : l
                ),
              }
            : c
        );
        commitChapters(next, '✓ Đã xóa khối nội dung!');
        setSelection({ kind: 'lesson', chapterId, lessonId });
      },
    });
  };

  // --- Save Inspector Edits back to original course ---
  const handleSaveInspector = () => {
    if (!selectedObjects) return;

    if (selectedObjects.kind === 'course') {
      const cleanTitle = draftTitle.trim() || course.title;
      const usedInline = collectUsedInlineImages([draftSummary], draftInlineImages);
      onUpdateCourse(
        {
          ...course,
          title: cleanTitle,
          description: draftSummary.trim(),
          inlineImages: usedInline,
        },
        '✓ Đã cập nhật thông tin & ý tưởng khóa học gốc!'
      );
      setIsDirty(false);
      return;
    }

    if (selectedObjects.kind === 'chapter') {
      const chap = selectedObjects.chap;
      const cleanTitle = draftTitle.trim() || chap.title;
      const usedInline = collectUsedInlineImages([draftSummary], draftInlineImages);
      commitChapters(
        chapters.map((c) =>
          c.id === chap.id
            ? { ...c, title: cleanTitle, description: draftSummary.trim(), inlineImages: usedInline }
            : c
        ),
        '✓ Đã cập nhật chương học vào nội dung gốc!'
      );
      setIsDirty(false);
      return;
    }

    if (selectedObjects.kind === 'lesson') {
      const { chap, les } = selectedObjects;
      const cleanTitle = draftTitle.trim() || les.title;
      const usedInline = collectUsedInlineImages([draftSummary], draftInlineImages);
      const updatedLesson: CourseLesson = {
        ...les,
        title: cleanTitle,
        summary: draftSummary.trim(),
        durationMinutes: Math.max(1, Number(draftDuration) || 25),
        inlineImages: usedInline,
      };
      const targetChapId = draftParentChapterId || chap.id;
      if (targetChapId !== chap.id) {
        const nextChapters = chapters.map((c) => {
          if (c.id === chap.id) {
            return { ...c, lessons: (c.lessons || []).filter((l) => l.id !== les.id) };
          }
          if (c.id === targetChapId) {
            return { ...c, lessons: [...(c.lessons || []), updatedLesson] };
          }
          return c;
        });
        commitChapters(nextChapters, '✓ Đã chuyển bài học sang chương mới và cập nhật nội dung!');
        setSelection({ kind: 'lesson', chapterId: targetChapId, lessonId: les.id });
      } else {
        commitChapters(
          chapters.map((c) =>
            c.id === chap.id
              ? {
                  ...c,
                  lessons: (c.lessons || []).map((l) => (l.id === les.id ? updatedLesson : l)),
                }
              : c
          ),
          '✓ Đã cập nhật bài học vào nội dung gốc!'
        );
      }
      setIsDirty(false);
      return;
    }

    if (selectedObjects.kind === 'section') {
      const { chap, les, sec } = selectedObjects;
      const cleanTitle = draftTitle.trim() || sec.title;
      const usedInline = collectUsedInlineImages([draftSummary], draftInlineImages);
      const invalidParentIds = getSectionDescendantIds(les.sections || [], sec.id);
      const safeParentId =
        draftParentSectionId && !invalidParentIds.has(draftParentSectionId)
          ? draftParentSectionId
          : undefined;
      updateLessonSections(
        chap.id,
        les.id,
        (sections) => ({
          sections: sections.map((s) =>
            s.id === sec.id
              ? {
                  ...s,
                  title: cleanTitle,
                  summary: draftSummary.trim() || undefined,
                  parentSectionId: safeParentId,
                  inlineImages: usedInline,
                }
              : s
          ),
        }),
        '✓ Đã cập nhật phân mục và cấu trúc cha/con!'
      );
      setIsDirty(false);
      return;
    }

    if (selectedObjects.kind === 'block') {
      const { chap, les, blk } = selectedObjects;
      const usedInline = collectUsedInlineImages([draftSummary], draftInlineImages);
      const updatedBlock: LessonBlock = {
        ...blk,
        title: draftTitle.trim() || undefined,
        sectionId: draftParentSectionId || undefined,
        ...(blk.type === 'callout' ? { calloutType: draftCalloutType } : {}),
        ...(blk.type === 'image'
          ? { caption: draftSummary.trim() || undefined, inlineImages: usedInline }
          : blk.type === 'theory' || blk.type === 'callout' || blk.type === 'file'
          ? { contentMarkdown: draftSummary.trim(), inlineImages: usedInline }
          : {}),
      };

      const targetLessonId = draftBlockLessonId || les.id;
      if (targetLessonId !== les.id) {
        // Move block to another lesson (finding its parent chapter)
        let destChapterId = chap.id;
        chapters.forEach((c) => {
          if ((c.lessons || []).some((l) => l.id === targetLessonId)) {
            destChapterId = c.id;
          }
        });
        const movedBlock = { ...updatedBlock, sectionId: undefined };
        const nextChapters = chapters.map((c) => ({
          ...c,
          lessons: (c.lessons || []).map((l) => {
            if (l.id === les.id) {
              return { ...l, blocks: (l.blocks || []).filter((b) => b.id !== blk.id) };
            }
            if (l.id === targetLessonId) {
              return { ...l, blocks: [...(l.blocks || []), movedBlock] };
            }
            return l;
          }),
        }));
        commitChapters(nextChapters, '✓ Đã di chuyển khối nội dung sang bài học mới!');
        setSelection({ kind: 'block', chapterId: destChapterId, lessonId: targetLessonId, blockId: blk.id });
      } else {
        commitChapters(
          chapters.map((c) =>
            c.id === chap.id
              ? {
                  ...c,
                  lessons: (c.lessons || []).map((l) =>
                    l.id === les.id
                      ? {
                          ...l,
                          blocks: (l.blocks || []).map((b) => (b.id === blk.id ? updatedBlock : b)),
                        }
                      : l
                  ),
                }
              : c
          ),
          '✓ Đã lưu nội dung khối vào khóa học gốc!'
        );
      }
      setIsDirty(false);
    }
  };

  // Recursive render helper for Section nodes and their assigned blocks
  const renderSectionBranch = (
    chap: CourseChapter,
    les: CourseLesson,
    orderedNodes: OrderedSectionNode[],
    parentId: string | undefined
  ): React.ReactNode => {
    const siblings = orderedNodes.filter((n) => (n.parentId || undefined) === parentId);
    if (siblings.length === 0) return null;

    return siblings.map((node, sibIdx) => {
      const sec = node.section;
      const secKey = `sec:${sec.id}`;
      const open = isExpanded(secKey);
      const isSelected =
        selection.kind === 'section' &&
        selection.lessonId === les.id &&
        selection.sectionId === sec.id;
      const childSections = orderedNodes.filter((n) => n.parentId === sec.id);
      const secBlocks = (les.blocks || []).filter((b) => b.sectionId === sec.id);
      const hasChildren = childSections.length > 0 || secBlocks.length > 0;

      return (
        <div key={sec.id} className="space-y-1">
          <div
            onClick={() => setSelection({ kind: 'section', chapterId: chap.id, lessonId: les.id, sectionId: sec.id })}
            className={`group flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border text-xs transition-all cursor-pointer ${
              isSelected
                ? 'bg-indigo-50 border-indigo-400 text-indigo-950 shadow-2xs'
                : 'bg-white border-slate-200 hover:border-indigo-300 text-slate-800'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(secKey);
                }}
                className={`p-0.5 rounded hover:bg-slate-200/70 shrink-0 ${
                  hasChildren ? 'text-slate-500' : 'text-slate-300'
                }`}
              >
                {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              <GitBranch className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="font-mono font-bold text-[11px] text-indigo-700 shrink-0">
                {node.numberPath}
              </span>
              <span className="font-semibold truncate">{sec.title}</span>
              {sec.summary && (
                <span className="hidden xl:inline text-[10px] text-slate-400 truncate max-w-[140px]">
                  — {sec.summary}
                </span>
              )}
            </div>

            <div className="flex items-center gap-0.5 shrink-0 opacity-85 group-hover:opacity-100">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddSection(chap.id, les.id, sec.id);
                }}
                className="p-1 text-indigo-700 hover:bg-indigo-100 rounded cursor-pointer"
                title="Thêm phân mục con"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              {sec.parentSectionId && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePromoteSection(chap.id, les.id, sec.id);
                  }}
                  className="p-1 text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                  title="Đưa ra ngoài 1 cấp (lên cấp cha)"
                >
                  <IndentDecrease className="w-3.5 h-3.5" />
                </button>
              )}
              {sibIdx > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDemoteSection(chap.id, les.id, sec.id);
                  }}
                  className="p-1 text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                  title="Lồng vào làm con của mục phía trên"
                >
                  <IndentIncrease className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                disabled={sibIdx === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  handleMoveSectionSibling(chap.id, les.id, sec.id, 'up');
                }}
                className="p-1 text-slate-500 hover:bg-slate-100 rounded disabled:opacity-30 cursor-pointer"
                title="Lên"
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                disabled={sibIdx === siblings.length - 1}
                onClick={(e) => {
                  e.stopPropagation();
                  handleMoveSectionSibling(chap.id, les.id, sec.id, 'down');
                }}
                className="p-1 text-slate-500 hover:bg-slate-100 rounded disabled:opacity-30 cursor-pointer"
                title="Xuống"
              >
                <ArrowDown className="w-3 h-3" />
              </button>
            </div>
          </div>

          {open && (hasChildren || isSelected) && (
            <div className="ml-4 pl-3 border-l border-indigo-200/80 space-y-1">
              {renderSectionBranch(chap, les, orderedNodes, sec.id)}

              {secBlocks.map((blk) => {
                const blkSelected =
                  selection.kind === 'block' &&
                  selection.lessonId === les.id &&
                  selection.blockId === blk.id;
                const flatIdx = (les.blocks || []).findIndex((x) => x.id === blk.id);
                return (
                  <div
                    key={blk.id}
                    onClick={() =>
                      setSelection({
                        kind: 'block',
                        chapterId: chap.id,
                        lessonId: les.id,
                        blockId: blk.id,
                      })
                    }
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-all ${
                      blkSelected
                        ? 'bg-purple-50 border-purple-400 text-purple-950 font-semibold'
                        : 'bg-slate-50/70 border-slate-200 hover:bg-white text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <CornerDownRight className="w-3 h-3 text-slate-400 shrink-0" />
                      {renderBlockTypeBadge(blk.type)}
                      <span className="truncate">{getBlockLabel(blk)}</span>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        disabled={flatIdx <= 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveBlock(chap.id, les.id, blk.id, 'up');
                        }}
                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        disabled={flatIdx >= (les.blocks || []).length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveBlock(chap.id, les.id, blk.id, 'down');
                        }}
                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => onOpenCreateBlockModal(chap.id, les.id, 'theory', sec.id)}
                className="px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 rounded-lg inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Thêm khối vào mục {node.numberPath}</span>
              </button>
            </div>
          )}
        </div>
      );
    });
  };

  // Breadcrumb label for selected node
  const breadcrumbItems = useMemo(() => {
    if (!selectedObjects) return [];
    const items: string[] = [course.title];
    if (selectedObjects.kind === 'course') return items;
    items.push(selectedObjects.chap.title);
    if (selectedObjects.kind === 'chapter') return items;
    items.push(selectedObjects.les.title);
    if (selectedObjects.kind === 'lesson') return items;
    const sections = selectedObjects.les.sections || [];
    if (selectedObjects.kind === 'section') {
      const chain: string[] = [];
      let cur: LessonSection | undefined = selectedObjects.sec;
      const seen = new Set<string>();
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        chain.unshift(cur.title);
        cur = cur.parentSectionId ? sections.find((s) => s.id === cur!.parentSectionId) : undefined;
      }
      return [...items, ...chain];
    }
    if (selectedObjects.blk.sectionId) {
      const chain: string[] = [];
      let cur = sections.find((s) => s.id === selectedObjects.blk.sectionId);
      const seen = new Set<string>();
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        chain.unshift(cur.title);
        cur = cur.parentSectionId ? sections.find((s) => s.id === cur!.parentSectionId) : undefined;
      }
      items.push(...chain);
    }
    items.push(getBlockLabel(selectedObjects.blk));
    return items;
  }, [selectedObjects, course.title]);

  const allLessonsFlat = useMemo(() => {
    const out: { chapterId: string; chapterTitle: string; lesson: CourseLesson }[] = [];
    chapters.forEach((ch) => {
      (ch.lessons || []).forEach((les) => {
        out.push({ chapterId: ch.id, chapterTitle: ch.title, lesson: les });
      });
    });
    return out;
  }, [chapters]);

  return (
    <div className="space-y-4">
      {/* Top Toolbar Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-purple-700" />
            <span>Cây nội dung khóa học (Quản lý Cha / Con &amp; Ý tưởng)</span>
          </h2>
          <p className="text-xs text-slate-600 mt-0.5 tabular-nums">
            {stats.chapterCount} chương · {stats.lessonCount} bài học · {stats.sectionCount} phân mục · {stats.blockCount} khối nội dung — Mọi chỉnh sửa trên cây tác động trực tiếp vào khóa học gốc.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAllExpanded(true)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
          >
            Mở rộng hết
          </button>
          <button
            type="button"
            onClick={() => setAllExpanded(false)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
          >
            Thu gọn hết
          </button>
          <button
            type="button"
            onClick={handleAddChapter}
            className="px-3.5 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm chương mới</span>
          </button>
        </div>
      </div>

      {/* Main Two-Column Tree + Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT PANE: HIERARCHICAL TREE */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3 max-h-[65dvh] lg:max-h-[calc(100dvh-13rem)] overflow-y-auto scroll-lane lg:sticky lg:top-20">
          {/* Course Root Node */}
          <div
            onClick={() => setSelection({ kind: 'course' })}
            className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
              selection.kind === 'course'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-100 text-slate-900 border-slate-200 hover:bg-slate-200/70'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Layers className="w-4 h-4 shrink-0" />
              <span className="truncate">Khóa học: {course.title}</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleAddChapter();
              }}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0 ${
                selection.kind === 'course'
                  ? 'bg-white/15 hover:bg-white/25 text-white'
                  : 'bg-white hover:bg-purple-50 text-purple-700 border border-slate-200'
              }`}
            >
              <Plus className="w-3 h-3" />
              <span>Chương</span>
            </button>
          </div>

          {chapters.length === 0 && (
            <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
              Chưa có chương nào. Nhấn &quot;+ Chương&quot; để bắt đầu xây dựng cây nội dung.
            </div>
          )}

          {/* Chapters */}
          <div className="space-y-2.5 pl-2 border-l border-slate-200">
            {chapters.map((chap, chapIdx) => {
              const chKey = `ch:${chap.id}`;
              const chOpen = isExpanded(chKey);
              const chSelected = selection.kind === 'chapter' && selection.chapterId === chap.id;

              return (
                <div key={chap.id} className="space-y-1.5">
                  <div
                    onClick={() => setSelection({ kind: 'chapter', chapterId: chap.id })}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs cursor-pointer transition-all ${
                      chSelected
                        ? 'bg-purple-50 border-purple-400 text-purple-950 font-bold'
                        : 'bg-white border-slate-200 hover:border-purple-300 text-slate-900 font-semibold'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(chKey);
                        }}
                        className="p-0.5 rounded hover:bg-slate-200/70 text-slate-500 shrink-0"
                      >
                        {chOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-mono text-[10px] font-bold shrink-0">
                        C{chapIdx + 1}
                      </span>
                      <span className="truncate">{chap.title}</span>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddLesson(chap.id);
                        }}
                        className="px-2 py-1 text-[11px] font-bold text-purple-700 hover:bg-purple-100 rounded-lg inline-flex items-center gap-0.5 cursor-pointer"
                        title="Thêm bài học vào chương này"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Bài</span>
                      </button>
                      <button
                        type="button"
                        disabled={chapIdx === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveChapter(chap.id, 'up');
                        }}
                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={chapIdx === chapters.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveChapter(chap.id, 'down');
                        }}
                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Lessons inside Chapter */}
                  {chOpen && (
                    <div className="ml-4 pl-3 border-l border-purple-200 space-y-2">
                      {(chap.lessons || []).length === 0 && (
                        <div className="text-[11px] text-slate-400 italic py-1">
                          Chưa có bài học trong chương này.
                        </div>
                      )}

                      {(chap.lessons || []).map((les, lesIdx) => {
                        const lesKey = `les:${les.id}`;
                        const lesOpen = isExpanded(lesKey);
                        const lesSelected =
                          selection.kind === 'lesson' &&
                          selection.chapterId === chap.id &&
                          selection.lessonId === les.id;
                        const orderedSections = buildOrderedSectionNodes(les.sections);
                        const validSecIds = new Set(orderedSections.map((n) => n.section.id));
                        const unassignedBlocks = (les.blocks || []).filter(
                          (b) => !b.sectionId || !validSecIds.has(b.sectionId)
                        );

                        return (
                          <div key={les.id} className="space-y-1.5">
                            <div
                              onClick={() =>
                                setSelection({ kind: 'lesson', chapterId: chap.id, lessonId: les.id })
                              }
                              className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border text-xs cursor-pointer transition-all ${
                                lesSelected
                                  ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold'
                                  : 'bg-slate-50 border-slate-200 hover:border-emerald-300 text-slate-800 font-semibold'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleExpand(lesKey);
                                  }}
                                  className="p-0.5 rounded hover:bg-slate-200/70 text-slate-500 shrink-0"
                                >
                                  {lesOpen ? (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <BookOpen className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span className="truncate">{les.title}</span>
                              </div>

                              <div className="flex items-center gap-0.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAddSection(chap.id, les.id);
                                  }}
                                  className="px-1.5 py-0.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 rounded inline-flex items-center gap-0.5 cursor-pointer"
                                  title="Thêm phân mục mới cho bài học"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Mục</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenCreateBlockModal(chap.id, les.id, 'theory');
                                  }}
                                  className="px-1.5 py-0.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 rounded inline-flex items-center gap-0.5 cursor-pointer"
                                  title="Chèn khối nội dung mới"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Khối</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={lesIdx === 0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveLesson(chap.id, les.id, 'up');
                                  }}
                                  className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowUp className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  disabled={lesIdx === (chap.lessons || []).length - 1}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveLesson(chap.id, les.id, 'down');
                                  }}
                                  className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowDown className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            {/* Sections + Unassigned Blocks inside Lesson */}
                            {lesOpen && (
                              <div className="ml-4 pl-3 border-l border-emerald-200 space-y-1.5">
                                {renderSectionBranch(chap, les, orderedSections, undefined)}

                                {unassignedBlocks.map((blk) => {
                                  const blkSelected =
                                    selection.kind === 'block' &&
                                    selection.lessonId === les.id &&
                                    selection.blockId === blk.id;
                                  const flatIdx = (les.blocks || []).findIndex((x) => x.id === blk.id);
                                  return (
                                    <div
                                      key={blk.id}
                                      onClick={() =>
                                        setSelection({
                                          kind: 'block',
                                          chapterId: chap.id,
                                          lessonId: les.id,
                                          blockId: blk.id,
                                        })
                                      }
                                      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                        blkSelected
                                          ? 'bg-purple-50 border-purple-400 text-purple-950 font-semibold'
                                          : 'bg-white border-slate-200 hover:border-purple-300 text-slate-700'
                                      }`}
                                    >
                                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                        {renderBlockTypeBadge(blk.type)}
                                        <span className="truncate">{getBlockLabel(blk)}</span>
                                      </div>
                                      <div className="flex items-center gap-0.5 shrink-0">
                                        <button
                                          type="button"
                                          disabled={flatIdx <= 0}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleMoveBlock(chap.id, les.id, blk.id, 'up');
                                          }}
                                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                        >
                                          <ArrowUp className="w-3 h-3" />
                                        </button>
                                        <button
                                          type="button"
                                          disabled={flatIdx >= (les.blocks || []).length - 1}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleMoveBlock(chap.id, les.id, blk.id, 'down');
                                          }}
                                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                        >
                                          <ArrowDown className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}

                                {orderedSections.length === 0 && unassignedBlocks.length === 0 && (
                                  <div className="text-[11px] text-slate-400 italic py-0.5">
                                    Bài học chưa có phân mục hay khối nội dung.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANE: INSPECTOR & LIVE EDITOR */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4 lg:max-h-[calc(100dvh-13rem)] lg:overflow-y-auto scroll-lane min-w-0">
          {/* Parent-Child Breadcrumb */}
          <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500 pb-3 border-b border-slate-100">
            {breadcrumbItems.map((label, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />}
                <span
                  className={
                    idx === breadcrumbItems.length - 1
                      ? 'font-bold text-purple-800 truncate max-w-[220px]'
                      : 'truncate max-w-[160px]'
                  }
                >
                  {label}
                </span>
              </React.Fragment>
            ))}
          </div>

          {selectedObjects && (
            <div className="space-y-4 text-xs">
              {/* Header + Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-bold uppercase tracking-wider text-[10px]">
                  {selectedObjects.kind === 'course'
                    ? 'Khóa học (Gốc)'
                    : selectedObjects.kind === 'chapter'
                    ? 'Chương học'
                    : selectedObjects.kind === 'lesson'
                    ? 'Bài học'
                    : selectedObjects.kind === 'section'
                    ? 'Phân mục trong bài'
                    : `Khối nội dung (${selectedObjects.blk.type})`}
                </span>

                <div className="flex flex-wrap items-center gap-1.5">
                  {selectedObjects.kind === 'lesson' && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenLessonInPlayer(selectedObjects.chap.id, selectedObjects.les.id)
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold cursor-pointer"
                    >
                      Mở bài trong trình học
                    </button>
                  )}
                  {selectedObjects.kind === 'block' && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenEditBlockModal(
                          selectedObjects.chap.id,
                          selectedObjects.les.id,
                          selectedObjects.blk
                        )
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Mở trình soạn đầy đủ</span>
                    </button>
                  )}
                  {selectedObjects.kind === 'chapter' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteChapter(selectedObjects.chap)}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa chương</span>
                    </button>
                  )}
                  {selectedObjects.kind === 'lesson' && (
                    <button
                      type="button"
                      onClick={() =>
                        handleDeleteLesson(selectedObjects.chap.id, selectedObjects.les)
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa bài</span>
                    </button>
                  )}
                  {selectedObjects.kind === 'section' && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          handleDeleteSection(
                            selectedObjects.chap.id,
                            selectedObjects.les.id,
                            selectedObjects.sec,
                            false
                          )
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold flex items-center gap-1 cursor-pointer"
                        title="Xóa nhãn phân mục nhưng vẫn giữ lại mục con & khối nội dung"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Gỡ mục (giữ khối)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmState({
                            isOpen: true,
                            title: 'Xóa phân mục và toàn bộ con',
                            message: `Xóa phân mục "${selectedObjects.sec.title}" cùng toàn bộ phân mục con và các khối nội dung bên trong?`,
                            onConfirm: () =>
                              handleDeleteSection(
                                selectedObjects.chap.id,
                                selectedObjects.les.id,
                                selectedObjects.sec,
                                true
                              ),
                          })
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa hết</span>
                      </button>
                    </>
                  )}
                  {selectedObjects.kind === 'block' && (
                    <button
                      type="button"
                      onClick={() =>
                        handleDeleteBlock(
                          selectedObjects.chap.id,
                          selectedObjects.les.id,
                          selectedObjects.blk
                        )
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa khối</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Title Input */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  {selectedObjects.kind === 'block' ? 'Tiêu đề khối (tùy chọn):' : 'Tiêu đề:'}
                </label>
                <input
                  type="text"
                  value={draftTitle}
                  onChange={(e) => {
                    setDraftTitle(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder="Nhập tiêu đề..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>

              {/* Parent Selector Controls */}
              {selectedObjects.kind === 'lesson' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Thuộc chương (Cha):
                    </label>
                    <select
                      value={draftParentChapterId}
                      onChange={(e) => {
                        setDraftParentChapterId(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-semibold"
                    >
                      {chapters.map((c, idx) => (
                        <option key={c.id} value={c.id}>
                          Chương {idx + 1}: {c.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Thời lượng học (phút):
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={draftDuration}
                      onChange={(e) => {
                        setDraftDuration(parseInt(e.target.value) || 25);
                        setIsDirty(true);
                      }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                    />
                  </div>
                </div>
              )}

              {selectedObjects.kind === 'section' && (() => {
                const invalidIds = getSectionDescendantIds(
                  selectedObjects.les.sections || [],
                  selectedObjects.sec.id
                );
                const candidateParents = buildOrderedSectionNodes(
                  selectedObjects.les.sections || []
                ).filter((n) => !invalidIds.has(n.section.id));

                return (
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Thuộc phân mục cha (chỉnh quan hệ Cha / Con):
                    </label>
                    <select
                      value={draftParentSectionId}
                      onChange={(e) => {
                        setDraftParentSectionId(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-semibold"
                    >
                      <option value="">-- Cấp 1 (Trực thuộc trực tiếp Bài học) --</option>
                      {candidateParents.map((node) => (
                        <option key={node.section.id} value={node.section.id}>
                          {'\u00A0'.repeat(node.depth * 3)}
                          {node.numberPath} {node.section.title}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })()}

              {selectedObjects.kind === 'block' && (() => {
                const targetLessonEntry = allLessonsFlat.find(
                  (it) => it.lesson.id === draftBlockLessonId
                );
                const availableSections = buildOrderedSectionNodes(
                  targetLessonEntry?.lesson.sections || []
                );
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        Thuộc bài học (Cha):
                      </label>
                      <select
                        value={draftBlockLessonId}
                        onChange={(e) => {
                          setDraftBlockLessonId(e.target.value);
                          setDraftParentSectionId('');
                          setIsDirty(true);
                        }}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-semibold"
                      >
                        {allLessonsFlat.map((it) => (
                          <option key={it.lesson.id} value={it.lesson.id}>
                            {it.chapterTitle} › {it.lesson.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        Nằm trong phân mục (Cha):
                      </label>
                      <select
                        value={draftParentSectionId}
                        onChange={(e) => {
                          setDraftParentSectionId(e.target.value);
                          setIsDirty(true);
                        }}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-semibold"
                      >
                        <option value="">-- Trực tiếp trong bài (chưa gán mục) --</option>
                        {availableSections.map((node) => (
                          <option key={node.section.id} value={node.section.id}>
                            {'\u00A0'.repeat(node.depth * 3)}
                            {node.numberPath} {node.section.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })()}

              {/* Rich Content / Idea Editor */}
              {!(
                selectedObjects.kind === 'block' && selectedObjects.blk.type === 'question'
              ) ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="font-bold text-slate-700">
                      {selectedObjects.kind === 'block'
                        ? selectedObjects.blk.type === 'image'
                          ? 'Chú thích ảnh:'
                          : 'Nội dung khối (Hỗ trợ KaTeX, Tiêu đề, List đa cấp, Chèn ảnh):'
                        : 'Ý tưởng / Mục tiêu / Ghi chú nội dung:'}
                    </label>
                    <label className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold flex items-center gap-1 cursor-pointer text-[11px]">
                      <Upload className="w-3 h-3" />
                      <span>Chèn ảnh</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            const el = summaryTextareaRef.current;
                            const range = el
                              ? {
                                  start: el.selectionStart ?? el.value.length,
                                  end: el.selectionEnd ?? el.value.length,
                                }
                              : null;
                            void processImageFile(f, 1200, 0.85)
                              .then((compressed) => uploadImageOrKeepFallback(compressed, f.name))
                              .then((uploadedUrl) => {
                                setPasteModal({
                                  imageSrc: uploadedUrl,
                                  defaultTitle: f.name.replace(/\.[^.]+$/, '') || 'Hình minh họa',
                                  el,
                                  range,
                                });
                              });
                          }
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>

                  {selectedObjects.kind === 'block' && selectedObjects.blk.type === 'callout' && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-slate-700 flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 text-purple-600" />
                        Kiểu hộp:
                      </span>
                      {(['formula', 'tip', 'warning', 'info'] as const).map((ct) => (
                        <button
                          key={ct}
                          type="button"
                          onClick={() => {
                            setDraftCalloutType(ct);
                            setIsDirty(true);
                          }}
                          className={`px-2 py-1 rounded-lg border font-bold cursor-pointer ${
                            draftCalloutType === ct
                              ? 'bg-purple-700 text-white border-purple-700'
                              : 'bg-white text-slate-600 border-slate-200'
                          }`}
                        >
                          {ct === 'formula'
                            ? 'Công thức'
                            : ct === 'tip'
                            ? 'Mẹo nhanh'
                            : ct === 'warning'
                            ? 'Lưu ý'
                            : 'Thông tin'}
                        </button>
                      ))}
                    </div>
                  )}

                  <MathToolbar
                    targetRef={summaryTextareaRef}
                    onInsert={(snippet) => {
                      if (!insertTextAtEditableElement(summaryTextareaRef.current, snippet)) {
                        const isBlock = snippet.trim().startsWith('|') || snippet.includes('\n');
                        setDraftSummary((prev) =>
                          prev ? (isBlock ? `${prev}\n${snippet}` : `${prev} ${snippet}`) : snippet
                        );
                      }
                      setIsDirty(true);
                    }}
                    onInsertInlineImage={(imgId, imgSrc, title) => {
                      registerImplicitImage(imgSrc, imgId);
                      setDraftInlineImages((prev) => ({ ...prev, [imgId]: imgSrc }));
                      const token = formatInlineImageToken(imgId, title);
                      if (!insertTextAtEditableElement(summaryTextareaRef.current, token)) {
                        setDraftSummary((prev) => (prev ? `${prev}\n${token}` : token));
                      }
                      setIsDirty(true);
                    }}
                  />

                  <textarea
                    ref={summaryTextareaRef}
                    rows={selectedObjects.kind === 'block' ? 6 : 4}
                    value={draftSummary}
                    onChange={(e) => {
                      setDraftSummary(e.target.value);
                      setIsDirty(true);
                    }}
                    onPaste={(e) => {
                      const file = extractImageFileFromClipboardEvent(e.nativeEvent);
                      if (!file) return;
                      e.preventDefault();
                      const el = e.currentTarget;
                      const range = {
                        start: el.selectionStart ?? el.value.length,
                        end: el.selectionEnd ?? el.value.length,
                      };
                      void processImageFile(file, 1200, 0.85)
                        .then((compressed) => uploadImageOrKeepFallback(compressed, file.name))
                        .then((uploadedUrl) => {
                          setPasteModal({
                            imageSrc: uploadedUrl,
                            defaultTitle: 'Hình minh họa',
                            el,
                            range,
                          });
                        });
                    }}
                    placeholder="Nhập nội dung hoặc ý tưởng sư phạm, ghi chú phân mục..."
                    className="w-full p-3 border border-slate-200 rounded-xl font-mono text-xs leading-relaxed"
                  />

                  <InlineImageStrip
                    content={draftSummary}
                    inlineImages={draftInlineImages}
                    label="Ảnh đã chèn"
                    onUpdateContent={(next) => {
                      setDraftSummary(next);
                      setIsDirty(true);
                    }}
                  />

                  {draftSummary.trim() && (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Xem trước hiển thị:
                      </div>
                      <div className="text-xs sm:text-sm text-slate-900 leading-relaxed">
                        <RichContentRenderer
                          content={draftSummary}
                          inlineImages={draftInlineImages}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-200 space-y-2">
                  <div className="font-bold text-purple-900 flex items-center gap-1.5">
                    <HelpCircle className="w-4 h-4" />
                    <span>Xem trước câu hỏi tương tác:</span>
                  </div>
                  <div className="p-3 rounded-lg bg-white border border-purple-100 text-sm text-slate-900">
                    <RichContentRenderer
                      content={selectedObjects.blk.question?.question || ''}
                      imageUrl={selectedObjects.blk.question?.imageUrl}
                      inlineImages={selectedObjects.blk.question?.inlineImages}
                    />
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Bạn có thể đổi Bài học / Phân mục cha ở trên, hoặc nhấn &quot;Mở trình soạn đầy đủ&quot; để sửa đáp án và lời giải câu hỏi.
                  </p>
                </div>
              )}

              {/* Save Footer */}
              <div className="sticky bottom-0 z-10 -mx-4 sm:-mx-5 px-4 sm:px-5 py-3 bg-white/95 backdrop-blur-xs border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500">
                  {isDirty
                    ? 'Có thay đổi chưa lưu — nhấn Lưu để cập nhật vào khóa học gốc.'
                    : 'Đang đồng bộ với nội dung khóa học gốc.'}
                </span>
                <button
                  type="button"
                  onClick={handleSaveInspector}
                  className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Lưu cập nhật vào khóa học</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onClose={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
      />

      <InlineImageTitleModal
        isOpen={Boolean(pasteModal)}
        initialImageSrc={pasteModal?.imageSrc || ''}
        initialTitle={pasteModal?.defaultTitle || ''}
        targetLabel="Cây nội dung khóa học"
        onClose={() => setPasteModal(null)}
        onConfirm={(imgSrc, title) => {
          const modal = pasteModal;
          setPasteModal(null);
          if (!modal) return;
          const imgId = registerImplicitImage(imgSrc);
          setDraftInlineImages((prev) => ({ ...prev, [imgId]: imgSrc }));
          const token = formatInlineImageToken(imgId, title);
          if (!modal.el || !insertTextAtEditableElement(modal.el, token, modal.range)) {
            setDraftSummary((prev) => (prev ? `${prev}\n${token}` : token));
          }
          setIsDirty(true);
        }}
      />
    </div>
  );
};
