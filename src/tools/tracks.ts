import { gpcGet, gpcPut, gpcPost, getPackageName } from '../client.js';
import { PROJECT_LOCALES, type TrackType } from '../constants.js';

interface LocalizedText {
  language: string;
  text: string;
}

interface Release {
  name?: string;
  versionCodes?: string[];
  releaseNotes?: LocalizedText[];
  status: string;
  userFraction?: number;
  countryTargeting?: any;
  inAppUpdatePriority?: number;
}

interface Track {
  track: string;
  releases?: Release[];
}

interface TracksResponse {
  kind: string;
  tracks: Track[];
}

interface Edit {
  id: string;
  expiryTimeSeconds: string;
}

// Helper: create a new edit (all modifications go through edits)
async function createEdit(): Promise<string> {
  const pkg = getPackageName();
  const result = await gpcPost<Edit>(`/applications/${pkg}/edits`);
  return result.id;
}

// Helper: commit an edit (apply changes)
async function commitEdit(editId: string): Promise<void> {
  const pkg = getPackageName();
  await gpcPost(`/applications/${pkg}/edits/${editId}:commit`);
}

export async function listTracks(): Promise<string> {
  const pkg = getPackageName();
  const editId = await createEdit();

  const result = await gpcGet<TracksResponse>(
    `/applications/${pkg}/edits/${editId}/tracks`
  );

  const tracks = result.tracks || [];

  if (tracks.length === 0) {
    return `## Tracks\n\nNo tracks found for \`${pkg}\`.`;
  }

  let md = `## Google Play Tracks\n\n`;

  for (const track of tracks) {
    md += `### ${track.track.toUpperCase()}\n\n`;

    const releases = track.releases || [];
    if (releases.length === 0) {
      md += `No releases.\n\n`;
      continue;
    }

    md += `| Status | Version Code(s) | Rollout | Name |\n`;
    md += `|--------|----------------|---------|------|\n`;

    for (const release of releases) {
      const status = getStatusIndicator(release.status);
      const versionCodes = release.versionCodes?.join(', ') || '-';
      const rollout = release.userFraction !== undefined
        ? `${(release.userFraction * 100).toFixed(0)}%`
        : release.status === 'completed' ? '100%' : '-';
      md += `| ${status} ${release.status} | ${versionCodes} | ${rollout} | ${release.name || '-'} |\n`;
    }

    // Show release notes for latest release
    const latestRelease = releases[0];
    if (latestRelease?.releaseNotes && latestRelease.releaseNotes.length > 0) {
      md += `\n**Release Notes (latest):**\n`;
      for (const note of latestRelease.releaseNotes) {
        const preview = note.text.length > 80 ? note.text.slice(0, 80) + '...' : note.text;
        md += `- ${note.language}: ${preview}\n`;
      }
    }

    md += `\n`;
  }

  return md;
}

export async function createRelease(
  track: TrackType,
  versionCode: string,
  releaseNotes: Record<string, string>,
  releaseName?: string,
  status: string = 'draft',
  userFraction?: number,
): Promise<string> {
  const pkg = getPackageName();
  const editId = await createEdit();

  // Validate release notes length
  for (const [lang, text] of Object.entries(releaseNotes)) {
    if (text.length > 500) {
      return `**Error:** Release notes for \`${lang}\` exceed 500 characters (got ${text.length}).`;
    }
  }

  const notes: LocalizedText[] = Object.entries(releaseNotes).map(([language, text]) => ({
    language,
    text,
  }));

  const release: Release = {
    versionCodes: [versionCode],
    releaseNotes: notes,
    status,
  };

  if (releaseName) release.name = releaseName;
  if (userFraction !== undefined && status === 'inProgress') {
    release.userFraction = userFraction;
  }

  const body: Track = {
    track,
    releases: [release],
  };

  await gpcPut(`/applications/${pkg}/edits/${editId}/tracks/${track}`, body);
  await commitEdit(editId);

  let md = `## Release Created\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Track** | ${track} |\n`;
  md += `| **Version Code** | ${versionCode} |\n`;
  md += `| **Status** | ${status} |\n`;
  if (releaseName) md += `| **Name** | ${releaseName} |\n`;
  if (userFraction !== undefined) md += `| **Rollout** | ${(userFraction * 100).toFixed(0)}% |\n`;
  md += `\n**Release Notes:**\n`;
  for (const [lang, text] of Object.entries(releaseNotes)) {
    const preview = text.length > 60 ? text.slice(0, 60) + '...' : text;
    md += `- ${lang}: ${preview}\n`;
  }

  // Check for missing locales
  const noteLocales = Object.keys(releaseNotes);
  const missingLocales = PROJECT_LOCALES.filter(l => !noteLocales.includes(l));
  if (missingLocales.length > 0) {
    md += `\n> **Warning:** Release notes missing for: ${missingLocales.join(', ')}\n`;
  }

  return md;
}

export async function updateReleaseNotes(
  track: TrackType,
  releaseNotes: Record<string, string>,
): Promise<string> {
  const pkg = getPackageName();
  const editId = await createEdit();

  // Get current track data
  const currentTrack = await gpcGet<Track>(
    `/applications/${pkg}/edits/${editId}/tracks/${track}`
  );

  const releases = currentTrack.releases || [];
  if (releases.length === 0) {
    return `**Error:** No releases found in track \`${track}\`. Create a release first.`;
  }

  // Validate release notes length
  for (const [lang, text] of Object.entries(releaseNotes)) {
    if (text.length > 500) {
      return `**Error:** Release notes for \`${lang}\` exceed 500 characters (got ${text.length}).`;
    }
  }

  // Update release notes on the latest release
  const latestRelease = releases[0];
  const notes: LocalizedText[] = Object.entries(releaseNotes).map(([language, text]) => ({
    language,
    text,
  }));
  latestRelease.releaseNotes = notes;

  await gpcPut(`/applications/${pkg}/edits/${editId}/tracks/${track}`, {
    track,
    releases,
  });
  await commitEdit(editId);

  let md = `## Release Notes Updated: ${track}\n\n`;
  md += `| Language | Text (preview) |\n`;
  md += `|----------|----------------|\n`;
  for (const [lang, text] of Object.entries(releaseNotes)) {
    const preview = text.length > 60 ? text.slice(0, 60) + '...' : text;
    md += `| ${lang} | ${preview} |\n`;
  }

  // Check for missing locales
  const noteLocales = Object.keys(releaseNotes);
  const missingLocales = PROJECT_LOCALES.filter(l => !noteLocales.includes(l));
  if (missingLocales.length > 0) {
    md += `\n> **Warning:** Release notes missing for: ${missingLocales.join(', ')}\n`;
  }

  md += `\n**Status:** Updated and committed successfully`;
  return md;
}

export async function setRollout(
  track: TrackType,
  userFraction: number,
): Promise<string> {
  const pkg = getPackageName();
  const editId = await createEdit();

  // Get current track
  const currentTrack = await gpcGet<Track>(
    `/applications/${pkg}/edits/${editId}/tracks/${track}`
  );

  const releases = currentTrack.releases || [];
  if (releases.length === 0) {
    return `**Error:** No releases found in track \`${track}\`.`;
  }

  const latestRelease = releases[0];

  if (latestRelease.status !== 'inProgress' && latestRelease.status !== 'halted') {
    return `**Error:** Release is in state \`${latestRelease.status}\`. Can only adjust rollout for \`inProgress\` or \`halted\` releases.`;
  }

  // If userFraction is 1.0, complete the rollout
  if (userFraction >= 1.0) {
    latestRelease.status = 'completed';
    delete latestRelease.userFraction;
  } else {
    latestRelease.status = 'inProgress';
    latestRelease.userFraction = userFraction;
  }

  await gpcPut(`/applications/${pkg}/edits/${editId}/tracks/${track}`, {
    track,
    releases,
  });
  await commitEdit(editId);

  let md = `## Rollout Updated: ${track}\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Track** | ${track} |\n`;
  md += `| **Version Code(s)** | ${latestRelease.versionCodes?.join(', ') || '-'} |\n`;
  md += `| **Status** | ${latestRelease.status} |\n`;
  md += `| **Rollout** | ${userFraction >= 1.0 ? '100% (completed)' : `${(userFraction * 100).toFixed(0)}%`} |\n`;

  return md;
}

export async function haltRollout(
  track: TrackType,
): Promise<string> {
  const pkg = getPackageName();
  const editId = await createEdit();

  // Get current track
  const currentTrack = await gpcGet<Track>(
    `/applications/${pkg}/edits/${editId}/tracks/${track}`
  );

  const releases = currentTrack.releases || [];
  if (releases.length === 0) {
    return `**Error:** No releases found in track \`${track}\`.`;
  }

  const latestRelease = releases[0];

  if (latestRelease.status !== 'inProgress') {
    return `**Error:** Release is in state \`${latestRelease.status}\`. Can only halt \`inProgress\` releases.`;
  }

  latestRelease.status = 'halted';

  await gpcPut(`/applications/${pkg}/edits/${editId}/tracks/${track}`, {
    track,
    releases,
  });
  await commitEdit(editId);

  let md = `## Rollout Halted: ${track}\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Track** | ${track} |\n`;
  md += `| **Version Code(s)** | ${latestRelease.versionCodes?.join(', ') || '-'} |\n`;
  md += `| **Previous Rollout** | ${latestRelease.userFraction !== undefined ? `${(latestRelease.userFraction * 100).toFixed(0)}%` : '-'} |\n`;
  md += `| **Status** | HALTED |\n`;
  md += `\n> **Note:** Use \`gpc_set_rollout\` to resume the rollout or increase the percentage.\n`;

  return md;
}

export async function promoteRelease(
  fromTrack: TrackType,
  toTrack: TrackType,
  status: string = 'completed',
  userFraction?: number,
): Promise<string> {
  if (fromTrack === toTrack) {
    return `**Error:** Source and destination tracks are the same (\`${fromTrack}\`).`;
  }

  const pkg = getPackageName();
  const editId = await createEdit();

  // Get current track data from source
  const sourceTrack = await gpcGet<Track>(
    `/applications/${pkg}/edits/${editId}/tracks/${fromTrack}`
  );

  const releases = sourceTrack.releases || [];
  if (releases.length === 0) {
    return `**Error:** No releases found in track \`${fromTrack}\`.`;
  }

  // Find the latest completed or inProgress release
  const sourceRelease = releases.find(r => r.status === 'completed' || r.status === 'inProgress');
  if (!sourceRelease) {
    return `**Error:** No active release found in track \`${fromTrack}\`. Latest release status: \`${releases[0].status}\`.`;
  }

  if (!sourceRelease.versionCodes || sourceRelease.versionCodes.length === 0) {
    return `**Error:** Source release has no version codes.`;
  }

  // Create release on destination track
  const newRelease: Release = {
    versionCodes: sourceRelease.versionCodes,
    releaseNotes: sourceRelease.releaseNotes || [],
    status,
    name: sourceRelease.name,
  };

  if (userFraction !== undefined && status === 'inProgress') {
    newRelease.userFraction = userFraction;
  }

  await gpcPut(`/applications/${pkg}/edits/${editId}/tracks/${toTrack}`, {
    track: toTrack,
    releases: [newRelease],
  });

  await commitEdit(editId);

  let md = `## Release Promoted\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **From Track** | ${fromTrack} |\n`;
  md += `| **To Track** | ${toTrack} |\n`;
  md += `| **Version Code(s)** | ${sourceRelease.versionCodes.join(', ')} |\n`;
  md += `| **Name** | ${sourceRelease.name || '-'} |\n`;
  md += `| **Status** | ${status} |\n`;
  if (userFraction !== undefined) {
    md += `| **Rollout** | ${(userFraction * 100).toFixed(0)}% |\n`;
  }

  return md;
}

function getStatusIndicator(status: string): string {
  switch (status) {
    case 'completed': return '[LIVE]';
    case 'inProgress': return '[ROLLING]';
    case 'halted': return '[HALTED]';
    case 'draft': return '[DRAFT]';
    default: return `[${status.toUpperCase()}]`;
  }
}
