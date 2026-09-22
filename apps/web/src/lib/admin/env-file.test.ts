import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasEnv, setEnv } from "./env-file";

describe(".env editing for admin:setup", () => {
  it("replaces a key in place and adds missing ones, leaving every other line exactly as it was", () => {
    const before = 'DATABASE_URL="postgresql://x"\nADMIN_EMAIL="old@x.com"\n# ADMIN_PASSWORD_HASH=commented\nGROQ_API_KEY="keep"\n';
    const after = setEnv(setEnv(before, "ADMIN_EMAIL", "new@x.com"), "ADMIN_PASSWORD_HASH", "h");
    assert.equal(after, 'DATABASE_URL="postgresql://x"\nADMIN_EMAIL="new@x.com"\n# ADMIN_PASSWORD_HASH=commented\nGROQ_API_KEY="keep"\nADMIN_PASSWORD_HASH="h"\n');
  });

  it("keeps a Windows (CRLF) file intact: no glued lines, still CRLF everywhere", () => {
    const before = 'DATABASE_URL="x"\r\nGROQ_API_KEY="keep"\r\nADMIN_EMAIL="old"';
    const after = setEnv(setEnv(before, "ADMIN_EMAIL", "new@x.com"), "ADMIN_SESSION_SECRET", "s");
    assert.equal(after, 'DATABASE_URL="x"\r\nGROQ_API_KEY="keep"\r\nADMIN_EMAIL="new@x.com"\r\nADMIN_SESSION_SECRET="s"\r\n');
    const rest = after.replace(/\r\n/g, "");
    assert.equal(rest.includes("\n") || rest.includes("\r"), false, "no bare LF or CR");
  });

  it("replaces a key that sits in the middle of a CRLF file without touching its neighbours", () => {
    const before = 'A="1"\r\nADMIN_EMAIL="old"\r\nB="2"\r\n';
    assert.equal(setEnv(before, "ADMIN_EMAIL", "new"), 'A="1"\r\nADMIN_EMAIL="new"\r\nB="2"\r\n');
  });

  it("starts a file from nothing, and appends after a last line that has no newline", () => {
    assert.equal(setEnv("", "A", "1"), 'A="1"\n');
    assert.equal(setEnv("B=2", "A", "1"), 'B=2\nA="1"\n');
  });

  it("knows whether a key already has a value (commented out or empty does not count)", () => {
    const text = 'A="x"\n# B=y\nC=""\nD=\n  E = z\n';
    assert.deepEqual(["A", "B", "C", "D", "E", "F"].map((k) => hasEnv(text, k)), [true, false, false, false, true, false]);
  });
});
