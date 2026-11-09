// 一级分类下的事项类型（记录级筛选维度）
export const SUB_TYPES: Record<string, string[]> = {
  知识产权: ['商标注册', '商标复审', '撤三无效', '商标异议', '外观申报', '实用新型申报', '发明申报', '侵权维权'],
  合同审查: ['非模板合同', '模板合同'],
  合规建设: ['法律咨询', '制度建设'],
  诉讼仲裁: ['劳动争议', '商事仲裁'],
}

export function subTypesOf(categoryName: string | undefined | null): string[] {
  if (!categoryName) return []
  return SUB_TYPES[categoryName] ?? []
}

export function allSubTypes(): string[] {
  return Array.from(new Set(Object.values(SUB_TYPES).flat()))
}
