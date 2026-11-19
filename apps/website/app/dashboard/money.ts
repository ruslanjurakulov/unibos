export function formatWorkspaceMoney(
  minor: string,
  currency: string,
  locale?: string,
) {
  const amount = BigInt(minor);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const major = absolute / 100n;
  const fraction = absolute % 100n;
  const currencyFormatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const groupedMajor = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(major);
  const exactFraction = new Intl.NumberFormat(locale, {
    minimumIntegerDigits: 2,
    maximumFractionDigits: 0,
    useGrouping: false,
  }).format(fraction);
  let integerReplaced = false;
  return currencyFormatter
    .formatToParts(negative ? -0.01 : 0.01)
    .map((part) => {
      if (part.type === "integer" && !integerReplaced) {
        integerReplaced = true;
        return groupedMajor;
      }
      if (part.type === "fraction") return exactFraction;
      return part.value;
    })
    .join("");
}
