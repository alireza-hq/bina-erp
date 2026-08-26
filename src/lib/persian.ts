const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
const latinDigits = "0123456789";

export function toPersianDigits(value: string | number) {
  return String(value).replace(/\d/g, (digit) => persianDigits[Number(digit)]);
}

export function persianizeInputValue(value: string) {
  return toPersianDigits(value);
}

export function toLatinDigits(value: string) {
  return value.replace(/[۰-۹]/g, (digit) => latinDigits[persianDigits.indexOf(digit)]);
}
