import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decrypt, encrypt, encryptOptional } from "./crypto";

function makeKey(): string {
  return randomBytes(32).toString("base64");
}

/** Lật bit byte đầu tiên của một phần base64 trong payload, trả payload mới. */
function tamperPart(payload: string, index: number): string {
  const parts = payload.split(":");
  const bytes = Buffer.from(parts[index] ?? "", "base64");
  const flipped = Buffer.from(bytes);
  flipped[0] = (flipped[0] ?? 0) ^ 0xff;
  return parts.map((part, i) => (i === index ? flipped.toString("base64") : part)).join(":");
}

describe("crypto", () => {
  beforeEach(() => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", makeKey());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("round trip", () => {
    it("decrypts back to the original ASCII string", () => {
      // Arrange
      const plain = "ya29.a0AfH6SMB-example-access-token";

      // Act
      const result = decrypt(encrypt(plain));

      // Assert
      expect(result).toBe(plain);
    });

    it("decrypts back to the original unicode string", () => {
      // Arrange
      const plain = "Tiếng Việt có dấu ✓ 日本語 🚀";

      // Act
      const result = decrypt(encrypt(plain));

      // Assert
      expect(result).toBe(plain);
    });
  });

  describe("payload format", () => {
    it("produces v1:iv:tag:ciphertext with a 12-byte IV and 16-byte tag", () => {
      // Arrange
      const plain = "refresh-token";

      // Act
      const parts = encrypt(plain).split(":");

      // Assert
      expect(parts).toHaveLength(4);
      const [prefix, iv, tag, data] = parts;
      expect(prefix).toBe("v1");
      expect(Buffer.from(iv ?? "", "base64")).toHaveLength(12);
      expect(Buffer.from(tag ?? "", "base64")).toHaveLength(16);
      expect(Buffer.from(data ?? "", "base64").length).toBeGreaterThan(0);
    });

    it("does not contain the plaintext", () => {
      // Arrange
      const plain = "secret-token-value";

      // Act
      const payload = encrypt(plain);

      // Assert
      expect(payload).not.toContain(plain);
    });

    it("produces different payloads with different IVs for the same plaintext", () => {
      // Arrange
      const plain = "same-token";

      // Act
      const first = encrypt(plain);
      const second = encrypt(plain);

      // Assert
      expect(first).not.toBe(second);
      expect(first.split(":")[1]).not.toBe(second.split(":")[1]);
    });
  });

  describe("tamper detection", () => {
    it("throws when the ciphertext is modified", () => {
      // Arrange
      const tampered = tamperPart(encrypt("token"), 3);

      // Act + Assert
      expect(() => decrypt(tampered)).toThrow();
    });

    it("throws when the auth tag is modified", () => {
      // Arrange
      const tampered = tamperPart(encrypt("token"), 2);

      // Act + Assert
      expect(() => decrypt(tampered)).toThrow();
    });

    it("throws when the IV is modified", () => {
      // Arrange
      const tampered = tamperPart(encrypt("token"), 1);

      // Act + Assert
      expect(() => decrypt(tampered)).toThrow();
    });
  });

  describe("malformed payload", () => {
    it("throws when the v1 prefix is missing", () => {
      // Arrange
      const [, iv, tag, data] = encrypt("token").split(":");
      const withoutPrefix = [iv, tag, data].join(":");

      // Act + Assert
      expect(() => decrypt(withoutPrefix)).toThrow(/định dạng/);
    });

    it("throws when the prefix is an unknown version", () => {
      // Arrange
      const payload = encrypt("token").replace(/^v1:/, "v2:");

      // Act + Assert
      expect(() => decrypt(payload)).toThrow(/định dạng/);
    });

    it("throws when the IV has the wrong length", () => {
      // Arrange
      const [prefix, , tag, data] = encrypt("token").split(":");
      const payload = [prefix, randomBytes(16).toString("base64"), tag, data].join(":");

      // Act + Assert
      expect(() => decrypt(payload)).toThrow(/định dạng/);
    });

    it("throws when the tag has the wrong length", () => {
      // Arrange
      const [prefix, iv, , data] = encrypt("token").split(":");
      const payload = [prefix, iv, randomBytes(8).toString("base64"), data].join(":");

      // Act + Assert
      expect(() => decrypt(payload)).toThrow(/định dạng/);
    });

    it("throws when the ciphertext part is empty", () => {
      // Arrange
      const [prefix, iv, tag] = encrypt("token").split(":");
      const payload = [prefix, iv, tag, ""].join(":");

      // Act + Assert
      expect(() => decrypt(payload)).toThrow(/định dạng/);
    });

    it("throws when the ciphertext part is missing", () => {
      // Arrange
      const [prefix, iv, tag] = encrypt("token").split(":");
      const payload = [prefix, iv, tag].join(":");

      // Act + Assert
      expect(() => decrypt(payload)).toThrow(/định dạng/);
    });

    it("throws for an empty payload", () => {
      // Act + Assert
      expect(() => decrypt("")).toThrow(/định dạng/);
    });
  });

  describe("key handling", () => {
    it("throws on encrypt when the key is not configured", () => {
      // Arrange
      vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");

      // Act + Assert
      expect(() => encrypt("token")).toThrow(/chưa được cấu hình/);
    });

    it("throws on decrypt when the key is not configured", () => {
      // Arrange
      const payload = encrypt("token");
      vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");

      // Act + Assert
      expect(() => decrypt(payload)).toThrow(/chưa được cấu hình/);
    });

    it("throws when the key is shorter than 32 bytes", () => {
      // Arrange
      vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(16).toString("base64"));

      // Act + Assert
      expect(() => encrypt("token")).toThrow(/32 byte/);
    });

    it("throws when the key is longer than 32 bytes", () => {
      // Arrange
      vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(64).toString("base64"));

      // Act + Assert
      expect(() => encrypt("token")).toThrow(/32 byte/);
    });

    it("cannot decrypt a payload encrypted with a different key", () => {
      // Arrange
      const payload = encrypt("token");
      vi.stubEnv("TOKEN_ENCRYPTION_KEY", makeKey());

      // Act + Assert
      expect(() => decrypt(payload)).toThrow();
    });

    it("does not include the key value in error messages", () => {
      // Arrange
      const shortKey = randomBytes(16).toString("base64");
      vi.stubEnv("TOKEN_ENCRYPTION_KEY", shortKey);

      // Act
      let message = "";
      try {
        encrypt("token");
      } catch (error: unknown) {
        message = error instanceof Error ? error.message : String(error);
      }

      // Assert
      expect(message).not.toBe("");
      expect(message).not.toContain(shortKey);
    });
  });

  describe("encryptOptional", () => {
    it.each([
      ["null", null],
      ["undefined", undefined],
      ["empty string", ""],
    ])("returns null for %s", (_label, value) => {
      // Act
      const result = encryptOptional(value);

      // Assert
      expect(result).toBeNull();
    });

    it("returns null for empty input even when the key is not configured", () => {
      // Arrange
      vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");

      // Act
      const result = encryptOptional(null);

      // Assert
      expect(result).toBeNull();
    });

    it("encrypts a non-empty value into a decryptable payload", () => {
      // Arrange
      const plain = "refresh-token";

      // Act
      const result = encryptOptional(plain);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.startsWith("v1:")).toBe(true);
      expect(decrypt(result ?? "")).toBe(plain);
    });
  });
});
