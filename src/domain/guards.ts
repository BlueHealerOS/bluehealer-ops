// Data rule: no deal or personal-finance information anywhere in the app. Block currency figures in free text.
const CURRENCY = /(?:[$€£]\s?\d|\bUSD\s?\d|\d[\d,.]*\s?(?:k|m|mm|million|thousand|billion)?\s?(?:dollars|usd|euros)\b)/i;

export function dealDataProblem(text: string | undefined | null): string | null {
  if (!text) return null;
  if (CURRENCY.test(text))
    return 'This text contains a currency figure. Amounts, valuations and terms are not kept in this app. Please remove it and link the matching folder in SharePoint Documents, under 09 Pitch and Investors.';
  return null;
}
