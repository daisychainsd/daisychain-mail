export type BandcampLineItem = {
  bandcamp_transaction_id?: number;
  bandcamp_transaction_item_id?: number;
  date?: string;
  buyer_email?: string;
  [key: string]: unknown;
};

export type SalesReportResponse = {
  report?: BandcampLineItem[];
};

const SALES_REPORT_URL = "https://bandcamp.com/api/sales/4/sales_report";

export async function fetchSalesReport(
  accessToken: string,
  body: {
    band_id: number;
    member_band_id?: number;
    start_time: string;
    end_time?: string;
  }
): Promise<SalesReportResponse> {
  const res = await fetch(SALES_REPORT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      band_id: body.band_id,
      ...(body.member_band_id != null
        ? { member_band_id: body.member_band_id }
        : {}),
      start_time: body.start_time,
      ...(body.end_time ? { end_time: body.end_time } : {}),
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Bandcamp sales_report ${res.status}: ${text}`);
  }

  return JSON.parse(text) as SalesReportResponse;
}

/** Bandcamp expects UTC times like "2021-01-01 00:00:00" */
export function formatBandcampUtcTime(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

/** Parse Bandcamp line item date e.g. "04 Jan 2021 23:22:11 GMT" */
export function parseBandcampDate(line: BandcampLineItem): Date | null {
  if (!line.date || typeof line.date !== "string") return null;
  const d = new Date(line.date);
  return Number.isNaN(d.getTime()) ? null : d;
}
