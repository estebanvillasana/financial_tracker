export function createAccountsWidgetState({ pageSize }) {
  return {
    holder: "",
    currency: "",
    type: "",
    page: 1,
    pageSize,
  };
}
