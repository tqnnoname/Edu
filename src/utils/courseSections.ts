import { CourseLesson, LessonBlock, LessonSection } from '../types/exam';

export interface OrderedSectionNode {
  section: LessonSection;
  depth: number;
  numberPath: string;
  parentId?: string;
}

export function buildOrderedSectionNodes(sections?: LessonSection[]): OrderedSectionNode[] {
  if (!sections || sections.length === 0) return [];
  const validIds = new Set(sections.map((s) => s.id));
  const childrenMap = new Map<string, LessonSection[]>();

  const sorted = [...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  sorted.forEach((sec) => {
    const parentKey =
      sec.parentSectionId && sec.parentSectionId !== sec.id && validIds.has(sec.parentSectionId)
        ? sec.parentSectionId
        : '__root__';
    const list = childrenMap.get(parentKey) || [];
    list.push(sec);
    childrenMap.set(parentKey, list);
  });

  const result: OrderedSectionNode[] = [];
  const visited = new Set<string>();

  const dfs = (parentKey: string, depth: number, prefix: string) => {
    const children = childrenMap.get(parentKey) || [];
    children.forEach((sec, idx) => {
      if (visited.has(sec.id)) return;
      visited.add(sec.id);
      const numberPath = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`;
      result.push({
        section: sec,
        depth,
        numberPath,
        parentId: parentKey === '__root__' ? undefined : parentKey,
      });
      dfs(sec.id, depth + 1, numberPath);
    });
  };

  dfs('__root__', 0, '');

  // Safeguard: include any disconnected cycle nodes at root depth
  sorted.forEach((sec) => {
    if (!visited.has(sec.id)) {
      visited.add(sec.id);
      result.push({
        section: sec,
        depth: 0,
        numberPath: `${result.length + 1}`,
        parentId: undefined,
      });
    }
  });

  return result;
}

export function getSectionDescendantIds(
  sections: LessonSection[],
  rootSectionId: string
): Set<string> {
  const descendants = new Set<string>([rootSectionId]);
  let changed = true;
  while (changed) {
    changed = false;
    sections.forEach((sec) => {
      if (sec.parentSectionId && descendants.has(sec.parentSectionId) && !descendants.has(sec.id)) {
        descendants.add(sec.id);
        changed = true;
      }
    });
  }
  return descendants;
}

export function getSectionBreadcrumb(
  sections: LessonSection[] | undefined,
  sectionId?: string
): string {
  if (!sections || sections.length === 0 || !sectionId) return '';
  const map = new Map(sections.map((s) => [s.id, s]));
  const chain: string[] = [];
  const seen = new Set<string>();
  let curId: string | undefined = sectionId;
  while (curId && !seen.has(curId)) {
    seen.add(curId);
    const found = map.get(curId);
    if (!found) break;
    chain.unshift(found.title);
    curId = found.parentSectionId;
  }
  return chain.join(' › ');
}

export interface GroupedLessonSectionBlocks {
  sectionNode: OrderedSectionNode | null;
  blocks: { block: LessonBlock; flatIndex: number }[];
}

export function groupBlocksBySections(lesson: CourseLesson): GroupedLessonSectionBlocks[] {
  const blocks = lesson.blocks || [];
  const orderedSections = buildOrderedSectionNodes(lesson.sections);
  if (orderedSections.length === 0) {
    return [{ sectionNode: null, blocks: blocks.map((block, flatIndex) => ({ block, flatIndex })) }];
  }

  const sectionIds = new Set(orderedSections.map((n) => n.section.id));
  const groups: GroupedLessonSectionBlocks[] = [];
  const unassigned: { block: LessonBlock; flatIndex: number }[] = [];
  const bySec = new Map<string, { block: LessonBlock; flatIndex: number }[]>();

  blocks.forEach((block, flatIndex) => {
    if (block.sectionId && sectionIds.has(block.sectionId)) {
      const list = bySec.get(block.sectionId) || [];
      list.push({ block, flatIndex });
      bySec.set(block.sectionId, list);
    } else {
      unassigned.push({ block, flatIndex });
    }
  });

  if (unassigned.length > 0) {
    groups.push({ sectionNode: null, blocks: unassigned });
  }
  orderedSections.forEach((node) => {
    groups.push({
      sectionNode: node,
      blocks: bySec.get(node.section.id) || [],
    });
  });

  return groups;
}
