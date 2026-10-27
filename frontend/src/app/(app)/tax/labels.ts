// Plain module, not "use client": the server page reads this too, and a value
// imported from a client module is only a reference there, not the object.
export const TAX_TYPE_LABEL: Record<string, string> = {
  PERSONAL_INCOME: "Dividend",
  WITHHOLDING: "Dividend (tax withheld)",
  CAPITAL_GAIN: "Capital gain",
};
