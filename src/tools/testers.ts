import { gpcGet, gpcPut, getPackageName, createEdit, commitEdit } from '../client.js';
import { type TrackType } from '../constants.js';

interface Testers {
  googleGroups?: string[];
}

export async function listTesters(track: TrackType): Promise<string> {
  const pkg = getPackageName();
  const editId = await createEdit();

  const result = await gpcGet<Testers>(
    `/applications/${pkg}/edits/${editId}/testers/${track}`,
  );

  let md = `## Testers: ${track}\n\n`;

  const groups = result.googleGroups || [];
  if (groups.length === 0) {
    md += `No Google Groups configured for \`${track}\` track.\n`;
    md += `\n> Use \`gpc_update_testers\` to add Google Group email addresses for testing.`;
    return md;
  }

  md += `### Google Groups (${groups.length})\n\n`;
  for (const group of groups) {
    md += `- ${group}\n`;
  }

  return md;
}

export async function updateTesters(
  track: TrackType,
  googleGroups: string[],
): Promise<string> {
  const pkg = getPackageName();
  const editId = await createEdit();

  const body: Testers = {
    googleGroups,
  };

  await gpcPut(`/applications/${pkg}/edits/${editId}/testers/${track}`, body);
  await commitEdit(editId);

  let md = `## Testers Updated: ${track}\n\n`;
  md += `### Google Groups (${googleGroups.length})\n\n`;
  for (const group of googleGroups) {
    md += `- ${group}\n`;
  }
  md += `\n**Status:** Updated and committed successfully`;

  return md;
}
