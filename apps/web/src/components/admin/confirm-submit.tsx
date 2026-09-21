"use client";

import type { ReactNode } from "react";

/** A submit button that asks "are you sure?" first (a browser dialog: this page is for one person). */
export function ConfirmSubmit({ message, className, children }: { message: string; className?: string; children: ReactNode }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
