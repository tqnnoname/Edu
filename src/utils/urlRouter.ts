import {
  Classroom,
  CourseChapter,
  CourseLesson,
  CustomSubject,
  MicroCourse,
  NavTabItem,
} from '../types/exam';

export type AppViewRoute =
  | 'home'
  | 'taking'
  | 'result'
  | 'create'
  | 'history'
  | 'bundle-create'
  | 'bundle-taking'
  | 'bundle-result'
  | 'classrooms'
  | 'courses'
  | 'battle'
  | 'analytics'
  | 'teacher-tools';

export type ClassroomTabRouteId =
  | 'overview'
  | 'exams'
  | 'courses'
  | 'homework'
  | 'students'
  | 'analytics'
  | 'ranking'
  | 'requests'
  | 'all_accounts';

export const CLASSROOM_TAB_TO_SLUG: Record<ClassroomTabRouteId, string> = {
  overview: 'tong-quan',
  exams: 'de-thi',
  courses: 'khoa-hoc',
  homework: 'btvn',
  students: 'hoc-sinh',
  analytics: 'phan-tich',
  ranking: 'xep-hang',
  requests: 'yeu-cau',
  all_accounts: 'tai-khoan',
};

export const SLUG_TO_CLASSROOM_TAB: Record<string, ClassroomTabRouteId> = Object.entries(
  CLASSROOM_TAB_TO_SLUG
).reduce((acc, [tab, slug]) => {
  acc[slug] = tab as ClassroomTabRouteId;
  return acc;
}, {} as Record<string, ClassroomTabRouteId>);

/**
 * Chuyển chuỗi tiếng Việt có dấu thành slug URL sạch (không dấu, gạch ngang)
 * VD: "Chương I: Hàm số" -> "chuong-i-ham-so"
 */
export function toUrlSlug(input?: string | null): string {
  if (!input) return '';
  return input
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Chuẩn hóa khóa so khớp lỏng (loại bỏ dấu gạch ngang) để URL dạng
 * /khoa-hoc/chuongI/baiI hay /khoa-hoc/chuong-i/bai-i đều khớp được
 */
export function normalizeRouteKey(input?: string | null): string {
  return toUrlSlug(input).replace(/-/g, '');
}

function doesSlugMatch(segment: string, candidateId?: string, candidateTitle?: string): boolean {
  if (!segment) return false;
  if (candidateId && segment.toLowerCase() === candidateId.toLowerCase()) return true;
  if (!candidateTitle) return false;
  const segSlug = toUrlSlug(segment);
  const titleSlug = toUrlSlug(candidateTitle);
  if (segSlug === titleSlug) return true;
  const segKey = normalizeRouteKey(segment);
  const titleKey = normalizeRouteKey(candidateTitle);
  if (!segKey || !titleKey) return false;
  return titleKey === segKey || titleKey.startsWith(segKey);
}

export function buildNavTabPath(
  tab: NavTabItem,
  subjects: CustomSubject[]
): string {
  switch (tab.targetView) {
    case 'single':
      return '/de-thi';
    case 'bundle':
      return '/to-hop-mon';
    case 'classrooms':
      return '/lop-hoc';
    case 'courses':
      return '/khoa-hoc';
    case 'battle':
      return '/dau-truong';
    case 'history':
      return '/lich-su-thi';
    case 'analytics':
      return '/phan-tich-nang-luc';
    default: {
      const subjectObj = subjects.find(
        (s) => s.id === tab.targetView || s.id === tab.subjectFilter
      );
      const slug = toUrlSlug(subjectObj?.name || tab.subjectFilter || tab.targetView);
      return slug ? `/de-thi/${slug}` : '/de-thi';
    }
  }
}

export function buildCourseUrlPath(params: {
  course?: MicroCourse | null;
  chapter?: CourseChapter | null;
  lesson?: CourseLesson | null;
  blockIndex?: number;
}): string {
  const { course, chapter, lesson } = params;
  if (!course) return '/khoa-hoc';
  const parts = ['/khoa-hoc', toUrlSlug(course.title) || course.id];
  if (chapter) {
    parts.push(toUrlSlug(chapter.title) || chapter.id);
  }
  if (lesson) {
    parts.push(toUrlSlug(lesson.title) || lesson.id);
  }
  return parts.join('/');
}

export function buildClassroomUrlPath(params: {
  classroom?: Classroom | null;
  tab?: ClassroomTabRouteId;
}): string {
  const { classroom, tab } = params;
  if (!classroom) return '/lop-hoc';
  const classSlug = toUrlSlug(classroom.name) || classroom.id;
  const tabSlug = tab ? CLASSROOM_TAB_TO_SLUG[tab] : '';
  return tabSlug ? `/lop-hoc/${classSlug}/${tabSlug}` : `/lop-hoc/${classSlug}`;
}

export function buildAppUrlPath(params: {
  currentView: AppViewRoute;
  homeTab: 'single' | 'bundle';
  selectedSubject: string;
  subjects: CustomSubject[];
  courseState?: {
    course?: MicroCourse | null;
    chapter?: CourseChapter | null;
    lesson?: CourseLesson | null;
  };
  classroomState?: {
    classroom?: Classroom | null;
    tab?: ClassroomTabRouteId;
  };
  activeExamTitle?: string;
  activeBundleTitle?: string;
  editingExamTitle?: string;
  resultExamTitle?: string;
}): string {
  const {
    currentView,
    homeTab,
    selectedSubject,
    subjects,
    courseState,
    classroomState,
    activeExamTitle,
    activeBundleTitle,
    editingExamTitle,
    resultExamTitle,
  } = params;

  switch (currentView) {
    case 'home': {
      if (homeTab === 'bundle') return '/to-hop-mon';
      if (selectedSubject === 'all') return '/de-thi';
      if (selectedSubject === 'custom') return '/de-thi/de-tu-tao';
      const sub = subjects.find((s) => s.id === selectedSubject);
      return `/de-thi/${toUrlSlug(sub?.name || selectedSubject)}`;
    }
    case 'courses':
      return buildCourseUrlPath(courseState || {});
    case 'classrooms':
      return buildClassroomUrlPath(classroomState || {});
    case 'battle':
      return '/dau-truong';
    case 'history':
      return '/lich-su-thi';
    case 'analytics':
      return '/phan-tich-nang-luc';
    case 'teacher-tools':
      return '/cong-cu-giao-vien';
    case 'create': {
      const slug = toUrlSlug(editingExamTitle);
      return slug ? `/soan-de/${slug}` : '/soan-de';
    }
    case 'bundle-create':
      return '/tao-to-hop';
    case 'taking': {
      const slug = toUrlSlug(activeExamTitle);
      return slug ? `/lam-bai/${slug}` : '/lam-bai';
    }
    case 'result': {
      const slug = toUrlSlug(resultExamTitle);
      return slug ? `/ket-qua/${slug}` : '/ket-qua';
    }
    case 'bundle-taking': {
      const slug = toUrlSlug(activeBundleTitle);
      return slug ? `/thi-to-hop/${slug}` : '/thi-to-hop';
    }
    case 'bundle-result':
      return '/ket-qua-to-hop';
    default:
      return '/de-thi';
  }
}

export interface ParsedAppRoute {
  view: AppViewRoute;
  homeTab?: 'single' | 'bundle';
  selectedSubject?: string;
  courseId?: string;
  courseChapterSlug?: string;
  courseLessonSlug?: string;
  classroomId?: string;
  classroomTab?: ClassroomTabRouteId;
}

export function resolveCourseSegments(
  segments: string[],
  courses: MicroCourse[]
): { courseId?: string; chapterSlug?: string; lessonSlug?: string } {
  if (segments.length === 0 || courses.length === 0) return {};
  const [seg0, seg1, seg2] = segments;

  // 1) Try matching first segment as a course
  const matchedCourse = courses.find((c) => doesSlugMatch(seg0, c.id, c.title));
  if (matchedCourse) {
    if (!seg1) {
      return { courseId: matchedCourse.id };
    }
    const chapters = matchedCourse.chapters || [];
    const matchedChap = chapters.find((ch) => doesSlugMatch(seg1, ch.id, ch.title));
    if (matchedChap) {
      return {
        courseId: matchedCourse.id,
        chapterSlug: seg1,
        lessonSlug: seg2,
      };
    }
    // Maybe course has flat lessons without chapter in URL
    return {
      courseId: matchedCourse.id,
      lessonSlug: seg1,
    };
  }

  // 2) Fallback: support shorthand /khoa-hoc/chuongI/baiI against any course
  for (const c of courses) {
    const chapters = c.chapters || [];
    const matchedChap = chapters.find((ch) => doesSlugMatch(seg0, ch.id, ch.title));
    if (matchedChap) {
      return {
        courseId: c.id,
        chapterSlug: seg0,
        lessonSlug: seg1,
      };
    }
  }

  return {
    courseId: courses[0]?.id,
    chapterSlug: seg0,
    lessonSlug: seg1,
  };
}

export function matchChapterAndLessonBySlug(
  course: MicroCourse,
  chapterSlug?: string,
  lessonSlug?: string
): { chapterId?: string; lessonId?: string } {
  const chapters = course.chapters || [];
  let targetChap: CourseChapter | undefined;

  if (chapterSlug) {
    targetChap = chapters.find((ch) => doesSlugMatch(chapterSlug, ch.id, ch.title));
  }

  if (lessonSlug) {
    if (targetChap) {
      const targetLes = (targetChap.lessons || []).find((l) =>
        doesSlugMatch(lessonSlug, l.id, l.title)
      );
      if (targetLes) {
        return { chapterId: targetChap.id, lessonId: targetLes.id };
      }
    }
    for (const ch of chapters) {
      const targetLes = (ch.lessons || []).find((l) =>
        doesSlugMatch(lessonSlug, l.id, l.title)
      );
      if (targetLes) {
        return { chapterId: ch.id, lessonId: targetLes.id };
      }
    }
    const flatLes = (course.lessons || []).find((l) =>
      doesSlugMatch(lessonSlug, l.id, l.title)
    );
    if (flatLes) {
      return { lessonId: flatLes.id };
    }
  }

  if (targetChap) {
    return {
      chapterId: targetChap.id,
      lessonId: targetChap.lessons?.[0]?.id,
    };
  }

  return {};
}

export function parsePathnameToRoute(
  pathname: string,
  context: {
    courses: MicroCourse[];
    classrooms: Classroom[];
    subjects: CustomSubject[];
  }
): ParsedAppRoute {
  const cleanPath = decodeURIComponent(pathname || '/').replace(/\/+$/, '') || '/';
  if (cleanPath === '/') {
    return { view: 'home', homeTab: 'single', selectedSubject: 'all' };
  }

  const segments = cleanPath.split('/').filter(Boolean);
  const root = toUrlSlug(segments[0]);

  if (root === 'de-thi') {
    const subSeg = segments[1];
    if (!subSeg) {
      return { view: 'home', homeTab: 'single', selectedSubject: 'all' };
    }
    if (toUrlSlug(subSeg) === 'de-tu-tao') {
      return { view: 'home', homeTab: 'single', selectedSubject: 'custom' };
    }
    const matchedSub = context.subjects.find(
      (s) => doesSlugMatch(subSeg, s.id, s.name)
    );
    return {
      view: 'home',
      homeTab: 'single',
      selectedSubject: matchedSub?.id || 'all',
    };
  }

  if (root === 'to-hop-mon') {
    return { view: 'home', homeTab: 'bundle' };
  }

  if (root === 'khoa-hoc') {
    const resolved = resolveCourseSegments(segments.slice(1), context.courses);
    return {
      view: 'courses',
      courseId: resolved.courseId,
      courseChapterSlug: resolved.chapterSlug,
      courseLessonSlug: resolved.lessonSlug,
    };
  }

  if (root === 'lop-hoc') {
    const classSeg = segments[1];
    const tabSeg = segments[2];
    let classroomId: string | undefined;
    let classroomTab: ClassroomTabRouteId | undefined;

    if (classSeg) {
      const maybeTabOnly = SLUG_TO_CLASSROOM_TAB[toUrlSlug(classSeg)];
      if (maybeTabOnly && !tabSeg) {
        classroomTab = maybeTabOnly;
      } else {
        const matchedCls = context.classrooms.find((c) =>
          doesSlugMatch(classSeg, c.id, c.name)
        );
        classroomId = matchedCls?.id;
        if (tabSeg) {
          classroomTab = SLUG_TO_CLASSROOM_TAB[toUrlSlug(tabSeg)];
        }
      }
    }

    return {
      view: 'classrooms',
      classroomId,
      classroomTab,
    };
  }

  if (root === 'dau-truong') return { view: 'battle' };
  if (root === 'lich-su-thi') return { view: 'history' };
  if (root === 'phan-tich-nang-luc') return { view: 'analytics' };
  if (root === 'cong-cu-giao-vien') return { view: 'teacher-tools' };
  if (root === 'soan-de') return { view: 'create' };
  if (root === 'tao-to-hop') return { view: 'bundle-create' };

  return { view: 'home', homeTab: 'single', selectedSubject: 'all' };
}
