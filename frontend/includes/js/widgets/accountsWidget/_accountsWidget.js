// _accountsWidget.js — Barrel export for the accounts widget.
//
// Importing from this file (rather than index.js directly) keeps the public
// API stable: if the internal folder structure changes, only this file needs
// updating — all callers stay untouched.
export { mountAccountsWidget } from "./index.js";
