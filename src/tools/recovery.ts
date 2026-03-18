import { gpcGet, gpcPost, getPackageName } from '../client.js';

interface RecoveryAction {
  appRecoveryId?: string;
  status?: string; // DRAFT, ACTIVE, CANCELED, GENERATION_IN_PROGRESS, GENERATION_FAILED
  targeting?: RecoveryTargeting;
  createTime?: string;
  deployTime?: string;
  cancelTime?: string;
  lastUpdateTime?: string;
}

interface RecoveryTargeting {
  allUsers?: {};
  regions?: { regionCode: string[] };
  androidSdks?: { sdkLevels: number[] };
  versionList?: { versionCodes: string[] };
  versionRange?: { versionCodeStart: string; versionCodeEnd: string };
}

interface RecoveryActionsResponse {
  recoveryActions?: RecoveryAction[];
}

function formatRecoveryStatus(status: string): string {
  switch (status) {
    case 'DRAFT': return '[DRAFT]';
    case 'ACTIVE': return '[ACTIVE]';
    case 'CANCELED': return '[CANCELED]';
    case 'GENERATION_IN_PROGRESS': return '[GENERATING]';
    case 'GENERATION_FAILED': return '[FAILED]';
    default: return `[${status}]`;
  }
}

function describeTargeting(targeting?: RecoveryTargeting): string {
  if (!targeting) return 'None';
  if (targeting.allUsers) return 'All users';
  if (targeting.regions) return `Regions: ${targeting.regions.regionCode.join(', ')}`;
  if (targeting.androidSdks) return `SDK levels: ${targeting.androidSdks.sdkLevels.join(', ')}`;
  if (targeting.versionList) return `Versions: ${targeting.versionList.versionCodes.join(', ')}`;
  if (targeting.versionRange) return `Versions ${targeting.versionRange.versionCodeStart}-${targeting.versionRange.versionCodeEnd}`;
  return 'Custom';
}

export async function listRecoveryActions(): Promise<string> {
  const pkg = getPackageName();
  const result = await gpcGet<RecoveryActionsResponse>(
    `/applications/${pkg}/appRecoveries`,
  );

  const actions = result.recoveryActions || [];

  if (actions.length === 0) {
    return `## App Recovery Actions\n\nNo recovery actions found for \`${pkg}\`.`;
  }

  let md = `## App Recovery Actions (${actions.length})\n\n`;
  md += `| ID | Status | Targeting | Created |\n`;
  md += `|----|--------|-----------|----------|\n`;

  for (const action of actions) {
    const status = formatRecoveryStatus(action.status || 'UNKNOWN');
    const targeting = describeTargeting(action.targeting);
    const created = action.createTime || '-';
    md += `| ${action.appRecoveryId || '-'} | ${status} | ${targeting} | ${created} |\n`;
  }

  return md;
}

export async function createRecoveryAction(
  targetVersionCodes?: string[],
  targetRegions?: string[],
  targetAllUsers?: boolean,
): Promise<string> {
  const pkg = getPackageName();

  const targeting: RecoveryTargeting = {};
  if (targetAllUsers) {
    targeting.allUsers = {};
  } else if (targetVersionCodes && targetVersionCodes.length > 0) {
    targeting.versionList = { versionCodes: targetVersionCodes };
  } else if (targetRegions && targetRegions.length > 0) {
    targeting.regions = { regionCode: targetRegions };
  } else {
    return `**Error:** Specify at least one targeting option: targetVersionCodes, targetRegions, or targetAllUsers.`;
  }

  const result = await gpcPost<RecoveryAction>(
    `/applications/${pkg}/appRecoveries`,
    { targeting },
  );

  let md = `## Recovery Action Created\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **ID** | ${result.appRecoveryId || 'pending'} |\n`;
  md += `| **Status** | ${result.status || 'DRAFT'} |\n`;
  md += `| **Targeting** | ${describeTargeting(targeting)} |\n`;
  md += `\n> **Next:** Use \`gpc_deploy_recovery\` to activate this recovery action.\n`;
  md += `> Recovery actions in DRAFT state are not visible to users.`;

  return md;
}

export async function deployRecoveryAction(recoveryId: string): Promise<string> {
  const pkg = getPackageName();
  await gpcPost(
    `/applications/${pkg}/appRecoveries/${recoveryId}:deploy`,
    {},
  );

  let md = `## Recovery Action Deployed\n\n`;
  md += `Recovery action \`${recoveryId}\` is now **ACTIVE**.\n\n`;
  md += `> Targeted users will receive the recovery notification. This may take some time to propagate.`;

  return md;
}

export async function cancelRecoveryAction(recoveryId: string): Promise<string> {
  const pkg = getPackageName();
  await gpcPost(
    `/applications/${pkg}/appRecoveries/${recoveryId}:cancel`,
    {},
  );

  return `## Recovery Action Canceled\n\nRecovery action \`${recoveryId}\` has been canceled. Users will no longer receive the recovery notification.`;
}
