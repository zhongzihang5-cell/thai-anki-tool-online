/** 解析 search 脚本返回的日期短语，如 "3 กรกฎาคม 2564" */

const THAI_MONTHS: Record<string, number> = {
  มกราคม: 1,
  กุมภาพันธ์: 2,
  มีนาคม: 3,
  เมษายน: 4,
  พฤษภาคม: 5,
  มิถุนายน: 6,
  กรกฎาคม: 7,
  สิงหาคม: 8,
  กันยายน: 9,
  ตุลาคม: 10,
  พฤศจิกายน: 11,
  ธันวาคม: 12,
};

const REV_THAI_DIGITS = "0123456789";
const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

function normalizeDigits(s: string): string {
  let out = "";
  for (const ch of s) {
    const i = THAI_DIGITS.indexOf(ch);
    out += i >= 0 ? REV_THAI_DIGITS[i]! : ch;
  }
  return out;
}

/** 从短语得到佛历年（已是 BE）与日、月 */
export function parseThaiDatePhrase(
  phrase: string
): { day: number; monthThai: string; monthNum: number; beYear: number } | null {
  const p = phrase.trim();
  if (!p) return null;
  const monthsPat = Object.keys(THAI_MONTHS).join("|");
  const re = new RegExp(
    `^(\\d{1,2})\\s+(${monthsPat})\\s*(?:พ\\.ศ\\.\\s*)?(\\d{4})$`
  );
  const m = normalizeDigits(p).match(re);
  if (!m) return null;
  const day = parseInt(m[1]!, 10);
  const monthThai = m[2]!;
  const yRaw = parseInt(m[3]!, 10);
  const monthNum = THAI_MONTHS[monthThai];
  if (!monthNum || day < 1 || day > 31) return null;
  let beYear = yRaw;
  if (yRaw >= 1900 && yRaw <= 2199) beYear = yRaw + 543;
  if (beYear < 2400 || beYear > 2700) return null;
  return { day, monthThai, monthNum, beYear };
}

export function buddhistDisplay(phrase: string): string {
  const x = parseThaiDatePhrase(phrase);
  if (!x) return phrase;
  return `${x.day} ${x.monthThai} พ.ศ. ${x.beYear}`;
}

export function gregorianDisplay(phrase: string): string {
  const x = parseThaiDatePhrase(phrase);
  if (!x) return "—";
  const ce = x.beYear - 543;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${ce}-${pad(x.monthNum)}-${pad(x.day)}（公历）`;
}

export function youtubeLuangporQuery(datePhrase: string | undefined): string {
  const base = "หลวงพ่อปราโมทย์";
  const p = (datePhrase || "").trim();
  if (!p) return base;
  const bud = buddhistDisplay(p);
  return `${base} ${bud}`.trim();
}
