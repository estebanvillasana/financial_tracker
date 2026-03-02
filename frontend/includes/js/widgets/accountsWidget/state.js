// state.js — Factory for the accounts widget's mutable state object.
//
// The state is a plain object (no class, no proxy) that index.js reads and
// writes directly.  Keeping it in its own file makes the shape explicit and
// easy to find when adding new filter keys or pagination options.

// Returns the initial state. `pageSize` is stored here so render() can always
// reach it without needing it passed as a separate argument.
export function createAccountsWidgetState({ pageSize }) {
  return {
    holder: "",
    currency: "",
    type: "",
    page: 1,
    pageSize,
  };
}
