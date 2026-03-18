import { gpcPost, getPackageName } from '../client.js';

export async function refundOrder(
  orderId: string,
  fullRefund: boolean = true,
): Promise<string> {
  const pkg = getPackageName();

  const body: any = {};
  if (fullRefund) {
    body.fullRefund = {};
  }

  await gpcPost(`/applications/${pkg}/orders/${orderId}:refund`, body);

  let md = `## Order Refunded\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Order ID** | ${orderId} |\n`;
  md += `| **Type** | ${fullRefund ? 'Full refund' : 'Partial refund'} |\n`;
  md += `\n> The refund may take a few minutes to process and appear in the user's account.`;

  return md;
}
