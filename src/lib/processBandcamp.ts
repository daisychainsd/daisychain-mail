import { fetchSalesReport } from "./bandcamp";
import { subscribeWithSource } from "./subscribe";

export type ProcessBandcampResult = {
  lineItems: number;
  subscribed: number;
  skippedNoEmail: number;
  failed: number;
  errors: string[];
};

export async function processBandcampSalesWindow(
  accessToken: string,
  bandId: number,
  memberBandId: number | undefined,
  startTime: string,
  endTime: string | undefined
): Promise<ProcessBandcampResult> {
  const data = await fetchSalesReport(accessToken, {
    band_id: bandId,
    member_band_id: memberBandId,
    start_time: startTime,
    end_time: endTime,
  });

  const report = data.report ?? [];
  const result: ProcessBandcampResult = {
    lineItems: report.length,
    subscribed: 0,
    skippedNoEmail: 0,
    failed: 0,
    errors: [],
  };

  for (const line of report) {
    const email = line.buyer_email;
    if (typeof email !== "string" || !email.trim()) {
      result.skippedNoEmail += 1;
      continue;
    }

    const sub = await subscribeWithSource(email, "bandcamp");
    if (sub.ok) {
      result.subscribed += 1;
    } else {
      result.failed += 1;
      if (result.errors.length < 20) {
        result.errors.push(sub.reason);
      }
    }
  }

  return result;
}
