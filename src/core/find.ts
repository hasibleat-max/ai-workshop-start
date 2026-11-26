/** A skill found in a repository: its SKILL.md, its name and its copies. */
export type SkillFile = { path: string; name: string; copies: string[] };

/** Where agents keep a repository's own skills, relative to its root. */
export const SKILL_ROOTS = ['.agents/skills', '.claude/skills', '.github/skills', 'agent/skills'];

/**
 * The project skills: each `<root>/<name>/SKILL.md`, named after its directory. The same name in
 * several roots is one skill: the first of its paths in sorted order, the others its copies.
 * Any other path is not a project skill.
 */
export function findSkills(paths: string[]): SkillFile[] {
  const byName = new Map<string, string[]>();
  for (const path of paths) {
    const name = skillName(path);
    if (name !== undefined) byName.set(name, [...(byName.get(name) ?? []), path]);
  }
  return [...byName].map(([name, found]) => {
    const [path, ...copies] = found.sort();
    return { path, name, copies };
  });
}

/** The `<name>` of `<root>/<name>/SKILL.md`; undefined for any other path. */
function skillName(path: string): string | undefined {
  const root = SKILL_ROOTS.find((root) => path.startsWith(`${root}/`));
  if (!root) return undefined;
  const [name, file, ...deeper] = path.slice(root.length + 1).split('/');
  return file === 'SKILL.md' && deeper.length === 0 ? name : undefined;
}
