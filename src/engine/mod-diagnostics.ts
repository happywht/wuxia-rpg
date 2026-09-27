import type { Diagnostic, LoadedResource } from './data-loader';

/** The loader fields needed to attribute a later runtime warning to its file. */
type ResourceLocation = Pick<LoadedResource, 'path' | 'source'>;

/**
 * Combines file-layer failures with warnings raised later during content
 * assembly. Assembly warnings only carry a manifest resource id, so this
 * helper restores the winning MOD and exact mirrored path for the F2 panel.
 */
export function collectModDiagnostics(
  resources: ReadonlyMap<string, ResourceLocation>,
  loaderDiagnostics: readonly Diagnostic[],
  runtimeDiagnostics: readonly Diagnostic[],
): Diagnostic[] {
  const output = loaderDiagnostics.filter((diagnostic) => diagnostic.origin.startsWith('mod:'));

  for (const diagnostic of runtimeDiagnostics) {
    if (diagnostic.origin.startsWith('mod:')) {
      output.push(diagnostic);
      continue;
    }
    if (diagnostic.resource === undefined) continue;
    const resource = resources.get(diagnostic.resource);
    if (resource?.source.kind !== 'mod') continue;

    const { modId } = resource.source;
    output.push({
      ...diagnostic,
      severity: diagnostic.severity ?? 'warning',
      origin: `mod:${modId} · ${diagnostic.origin}`,
      path: diagnostic.path ?? `mods/${modId}/${resource.path}`,
      hint: diagnostic.hint ??
        `该覆盖通过文件级校验，但运行时装配发现引用或跨资源关系问题。检查 mods/${modId}/${resource.path}，再运行 npm run inspect:mods 并重启游戏；该命令不替代运行时语义校验。`,
    });
  }

  return output;
}
