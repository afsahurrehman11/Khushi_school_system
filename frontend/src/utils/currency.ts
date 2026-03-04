export const formatRs = (amount: number, decimals = 0): string => {
  const formatted = amount.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `Rs ${formatted}`;
};

export default formatRs;
