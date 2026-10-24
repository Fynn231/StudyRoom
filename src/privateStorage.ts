import { createContext, createElement, useContext, useState, type ReactNode } from 'react';
// Native storage and unrelated legacy keys remain untouched. Each mounted
// consumer captures its account prefix, including callbacks that finish later.
let account: string | null = null;
export function setStorageAccount(value: string | null) { account = value; }
export function privateKey(key: string, owner = account) { return owner === null ? key : `studyroom.account.${encodeURIComponent(owner)}.${key}`; }
export function privateStorage(kind: 'localStorage' | 'sessionStorage' = 'localStorage', owner = account): Storage {
  const prefix = owner === null ? '' : `studyroom.account.${encodeURIComponent(owner)}.`;
  // Resolve native storage lazily so denial is caught by each existing consumer.
  const native = () => globalThis[kind] ?? globalThis.window?.[kind];
  return {
    getItem: key => native().getItem(prefix + key), setItem: (key, value) => native().setItem(prefix + key, value), removeItem: key => native().removeItem(prefix + key),
    get length(): number { throw Error('Private storage enumeration unsupported'); }, key() { throw Error('Private storage enumeration unsupported'); }, clear() { throw Error('Use explicit private keys'); },
  };
}
const StorageAccount = createContext<string | null>(null);
export function StorageAccountProvider({ account, children }: { account: string | null; children: ReactNode }) {
  return createElement(StorageAccount.Provider, { value: account }, children);
}
export function usePrivateStorage(kind: 'localStorage' | 'sessionStorage' = 'localStorage') {
  const owner = useContext(StorageAccount);
  return useState(() => privateStorage(kind, owner))[0];
}
export function usePrivateKey(key: string) {
  const owner = useContext(StorageAccount);
  return useState(() => privateKey(key, owner))[0];
}
