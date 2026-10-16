/**
 * Reads the Sonarr/Radarr "Webhook" connection payload (Settings → Connect): which videos were imported or upgraded
 * (Download event) and which were renamed. Paths are the ones inside the Sonarr/Radarr containers, which this service
 * mounts at the same places. Pure function, so the payload shapes can be tested.
 */
export interface WebhookPaths {
  /** Videos that just arrived (new or upgraded): evaluated right away and put ahead of the backlog. */
  imported: string[];
  /** [previous path, new path] of renamed videos: our subtitle is renamed with them. */
  renamed: Array<[string, string]>;
}

type FileRef = { path?: string; previousPath?: string } | null | undefined;

export function webhookPaths(body: any): WebhookPaths {
  const out: WebhookPaths = { imported: [], renamed: [] };
  const event = String(body?.eventType || '');
  if (event === 'Download') {
    // Sonarr v4 sends every file of a season pack in episodeFiles (and the first one in episodeFile); Radarr movieFile.
    const files: FileRef[] = [...(body.episodeFiles ?? []), body.episodeFile, body.movieFile];
    out.imported = [...new Set(files.map(f => f?.path).filter((p): p is string => !!p))];
  } else if (event === 'Rename') {
    for (const f of [...(body.renamedEpisodeFiles ?? []), ...(body.renamedMovieFiles ?? [])] as FileRef[]) {
      if (f?.path && f.previousPath && f.path !== f.previousPath) out.renamed.push([f.previousPath, f.path]);
    }
  }
  return out;
}
