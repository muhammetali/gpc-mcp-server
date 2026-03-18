import { gpcGet, getPackageName, createEdit } from '../client.js';
import { type TrackType } from '../constants.js';

interface CountryAvailability {
  countries?: CountryEntry[];
  restOfWorld?: boolean;
}

interface CountryEntry {
  countryCode: string;
}

export async function listCountryAvailability(track: TrackType): Promise<string> {
  const pkg = getPackageName();
  const editId = await createEdit();

  const result = await gpcGet<CountryAvailability>(
    `/applications/${pkg}/edits/${editId}/countryAvailability/${track}`,
  );

  const countries = result.countries || [];

  let md = `## Country Availability: ${track}\n\n`;
  md += `| Setting | Value |\n`;
  md += `|---------|-------|\n`;
  md += `| **Rest of World** | ${result.restOfWorld ? 'Yes' : 'No'} |\n`;
  md += `| **Specific Countries** | ${countries.length} |\n`;

  if (countries.length > 0) {
    md += `\n### Countries\n\n`;
    // Display in columns of 6
    const codes = countries.map(c => c.countryCode).sort();
    md += codes.join(', ');
    md += '\n';
  }

  return md;
}
