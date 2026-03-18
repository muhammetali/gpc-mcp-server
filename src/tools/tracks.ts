import { gpcGet, gpcPut, getPackageName, createEdit, commitEdit } from '../client.js';
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
  autoFillLocales: boolean = true,
): Promise<string> {
  const pkg = getPackageName();
  const editId = await createEdit();

  // Work on a copy to avoid mutating caller's object
  const effectiveNotes = { ...releaseNotes };

  // Auto-fill missing locales from en-US fallback
  const autoFilledLocales: string[] = [];
  if (autoFillLocales) {
    const fallbackText = effectiveNotes['en-US'];
    if (fallbackText) {
      for (const locale of PROJECT_LOCALES) {
        if (!effectiveNotes[locale]) {
          effectiveNotes[locale] = fallbackText;
          autoFilledLocales.push(locale);
        }
      }
    }
  }

  // Validate release notes length
  for (const [lang, text] of Object.entries(effectiveNotes)) {
    if (text.length > 500) {
      return `**Error:** Release notes for \`${lang}\` exceed 500 characters (got ${text.length}).`;
    }
  }

  const notes: LocalizedText[] = Object.entries(effectiveNotes).map(([language, text]) => ({
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
  for (const [lang, text] of Object.entries(effectiveNotes)) {
    const preview = text.length > 60 ? text.slice(0, 60) + '...' : text;
    const suffix = autoFilledLocales.includes(lang) ? ' *(auto-filled from en-US)*' : '';
    md += `- ${lang}: ${preview}${suffix}\n`;
  }

  // Check for missing locales
  const noteLocales = Object.keys(effectiveNotes);
  const missingLocales = PROJECT_LOCALES.filter(l => !noteLocales.includes(l));
  if (missingLocales.length > 0) {
    md += `\n> **Warning:** Release notes missing for: ${missingLocales.join(', ')}\n`;
  }

  if (autoFilledLocales.length > 0) {
    md += `\n> **Info:** Auto-filled ${autoFilledLocales.length} locale(s) from en-US: ${autoFilledLocales.join(', ')}\n`;
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
  releaseNotes?: Record<string, string>,
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

  // Use provided release notes or fall back to source track's notes
  let effectiveReleaseNotes: LocalizedText[];
  let notesOverridden = false;
  if (releaseNotes && Object.keys(releaseNotes).length > 0) {
    for (const [lang, text] of Object.entries(releaseNotes)) {
      if (text.length > 500) {
        return `**Error:** Release notes for \`${lang}\` exceed 500 characters (got ${text.length}).`;
      }
    }
    effectiveReleaseNotes = Object.entries(releaseNotes).map(([language, text]) => ({ language, text }));
    notesOverridden = true;
  } else {
    effectiveReleaseNotes = sourceRelease.releaseNotes || [];
  }

  // Create release on destination track
  const newRelease: Release = {
    versionCodes: sourceRelease.versionCodes,
    releaseNotes: effectiveReleaseNotes,
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
  md += `| **Release Notes** | ${notesOverridden ? 'Custom (overridden)' : 'Copied from source track'} |\n`;

  return md;
}

export async function validateRelease(
  track: TrackType,
  versionCode: string,
): Promise<string> {
  const pkg = getPackageName();
  const editId = await createEdit();

  const checks: { name: string; pass: boolean; detail: string }[] = [];

  // Check 1: Is version code uploaded (exists in any bundle)?
  try {
    const bundles = await gpcGet<{ bundles?: { versionCode: number }[] }>(
      `/applications/${pkg}/edits/${editId}/bundles`
    );
    const bundleVersions = (bundles.bundles || []).map(b => String(b.versionCode));
    const uploaded = bundleVersions.includes(versionCode);
    checks.push({
      name: 'Bundle uploaded',
      pass: uploaded,
      detail: uploaded
        ? `Version code ${versionCode} found in uploaded bundles`
        : `Version code ${versionCode} not found. Available: ${bundleVersions.join(', ') || 'none'}`,
    });
  } catch {
    checks.push({
      name: 'Bundle uploaded',
      pass: false,
      detail: `Could not verify bundle for version code ${versionCode}`,
    });
  }

  // Check 2+3: Track state and release notes (single API call)
  try {
    const currentTrack = await gpcGet<Track>(
      `/applications/${pkg}/edits/${editId}/tracks/${track}`
    );
    const releases = currentTrack.releases || [];
    const hasDraft = releases.some(r => r.status === 'draft');
    const hasActive = releases.some(r => r.status === 'completed' || r.status === 'inProgress');
    checks.push({
      name: 'No blocking draft',
      pass: !hasDraft,
      detail: hasDraft
        ? `Track ${track} has a draft release that may block new releases`
        : `Track ${track} has no blocking drafts`,
    });
    if (hasActive) {
      const active = releases.find(r => r.status === 'completed' || r.status === 'inProgress')!;
      checks.push({
        name: 'Current active release',
        pass: true,
        detail: `Version ${active.versionCodes?.join(', ') || '-'} is ${active.status}${active.userFraction !== undefined ? ` at ${(active.userFraction * 100).toFixed(0)}%` : ''}`,
      });
    }

    // Release notes coverage from the same track data
    const latestRelease = releases[0];
    if (latestRelease?.releaseNotes && latestRelease.releaseNotes.length > 0) {
      const coveredLocales = latestRelease.releaseNotes.map(n => n.language);
      const missingLocales = PROJECT_LOCALES.filter(l => !coveredLocales.includes(l));
      checks.push({
        name: 'Release notes locales',
        pass: missingLocales.length === 0,
        detail: missingLocales.length === 0
          ? `All ${PROJECT_LOCALES.length} locales covered`
          : `Missing locales: ${missingLocales.join(', ')}`,
      });
    } else {
      checks.push({
        name: 'Release notes locales',
        pass: false,
        detail: 'No release notes found on current track release — you will need to provide them',
      });
    }
  } catch {
    checks.push({
      name: 'Track state',
      pass: true,
      detail: `Track ${track} appears empty (no prior releases)`,
    });
    checks.push({
      name: 'Release notes locales',
      pass: false,
      detail: 'Could not check release notes coverage',
    });
  }

  // Commit the read-only edit to avoid orphaned edits
  await commitEdit(editId);

  // Build result
  const allPassed = checks.every(c => c.pass);
  let md = `## Release Validation: ${track}\n\n`;
  md += `| Check | Status | Detail |\n`;
  md += `|-------|--------|--------|\n`;
  for (const check of checks) {
    const safeDetail = check.detail.replace(/\|/g, '\\|');
    md += `| ${check.name} | ${check.pass ? 'PASS' : 'FAIL'} | ${safeDetail} |\n`;
  }
  md += `\n**Result:** ${allPassed ? 'Ready to release' : 'Issues found — review above before releasing'}\n`;

  return md;
}

export async function releaseHistory(
  track: TrackType,
  limit: number = 10,
): Promise<string> {
  const pkg = getPackageName();
  const editId = await createEdit();

  const currentTrack = await gpcGet<Track>(
    `/applications/${pkg}/edits/${editId}/tracks/${track}`
  );

  // Commit read-only edit to avoid orphaned edits
  await commitEdit(editId);

  const releases = currentTrack.releases || [];
  if (releases.length === 0) {
    return `## Release History: ${track}\n\nNo releases found in track \`${track}\`.`;
  }

  const displayReleases = releases.slice(0, limit);

  let md = `## Release History: ${track.toUpperCase()}\n\n`;
  md += `| # | Status | Version Code(s) | Rollout | Name |\n`;
  md += `|---|--------|----------------|---------|------|\n`;

  for (let i = 0; i < displayReleases.length; i++) {
    const release = displayReleases[i];
    const status = getStatusIndicator(release.status);
    const versionCodes = release.versionCodes?.join(', ') || '-';
    const rollout = release.userFraction !== undefined
      ? `${(release.userFraction * 100).toFixed(0)}%`
      : release.status === 'completed' ? '100%' : '-';
    md += `| ${i + 1} | ${status} ${release.status} | ${versionCodes} | ${rollout} | ${release.name || '-'} |\n`;
  }

  // Show release notes for each release
  for (let i = 0; i < displayReleases.length; i++) {
    const release = displayReleases[i];
    if (release.releaseNotes && release.releaseNotes.length > 0) {
      md += `\n### Release ${i + 1} Notes${release.name ? ` (${release.name})` : ''}\n`;
      for (const note of release.releaseNotes) {
        const preview = note.text.length > 100 ? note.text.slice(0, 100) + '...' : note.text;
        md += `- **${note.language}:** ${preview}\n`;
      }
    }
  }

  if (releases.length > limit) {
    md += `\n> Showing ${limit} of ${releases.length} releases. Increase limit to see more.\n`;
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
