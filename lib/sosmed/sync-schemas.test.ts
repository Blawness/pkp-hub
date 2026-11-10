import { describe, expect, it } from "vitest";
import { syncPayloadSchema, tokenMatches } from "./sync-schemas";

/**
 * Kontrak payload sync diuji murni (tanpa DB/HTTP): bentuk yang diterima
 * pipeline lokal dan yang ditolak harus stabil, karena engine di mesin lain
 * mengikuti file ini.
 */

const validPayload = {
  brand: "pkp",
  handle: "@presisikonsulindoprima",
  source: "komentar-cli",
  posts: [
    {
      externalId: "2026-11-09-sistem-publikasi-sertipikat",
      title: "Sistem publikasi sertipikat",
      status: "published",
      postedAt: "2026-11-09T10:00:00.000Z",
      permalink: "https://www.instagram.com/p/ABC123/",
      caption: "Caption contoh",
      slideCount: 8,
    },
  ],
  comments: [
    {
      externalId: "k-261110-d3ed",
      mode: "sapa",
      class: "pujian",
      status: "posted",
      targetOwner: "@kantahkabsidoarjo",
      postId: "Dbm14GiTFPG",
      permalink: "https://www.instagram.com/reel/Dbm14GiTFPG/",
      draft: "Terima kasih sudah berbagi ceritanya.",
      postedAt: "2026-11-10T05:16:23.463Z",
    },
  ],
};

describe("syncPayloadSchema", () => {
  it("menerima payload lengkap dan mengubah timestamp jadi Date", () => {
    const parsed = syncPayloadSchema.parse(validPayload);
    expect(parsed.posts[0].postedAt).toBeInstanceOf(Date);
    expect(parsed.comments[0].postedAt).toBeInstanceOf(Date);
    expect(parsed.comments[0].targetOwner).toBe("@kantahkabsidoarjo");
  });

  it("mengisi array kosong bila posts/comments tidak dikirim", () => {
    const parsed = syncPayloadSchema.parse({ brand: "trihuni", handle: "@trihuni.id" });
    expect(parsed.posts).toEqual([]);
    expect(parsed.comments).toEqual([]);
  });

  it("menolak brand dan status di luar katalog", () => {
    expect(() => syncPayloadSchema.parse({ brand: "lain", handle: "@x" })).toThrow();
    expect(() =>
      syncPayloadSchema.parse({
        ...validPayload,
        posts: [{ externalId: "a", title: "b", status: "tayang" }],
      }),
    ).toThrow();
  });

  it("menolak komentar tanpa draft", () => {
    expect(() =>
      syncPayloadSchema.parse({
        ...validPayload,
        comments: [{ ...validPayload.comments[0], draft: "   " }],
      }),
    ).toThrow();
  });

  it("menolak permalink yang bukan URL", () => {
    expect(() =>
      syncPayloadSchema.parse({
        ...validPayload,
        comments: [{ ...validPayload.comments[0], permalink: "instagram.com/p/ABC123" }],
      }),
    ).toThrow();
  });

  it("menolak timestamp yang bukan ISO", () => {
    expect(() =>
      syncPayloadSchema.parse({
        ...validPayload,
        comments: [{ ...validPayload.comments[0], postedAt: "10 Nov 2026" }],
      }),
    ).toThrow();
  });
});

describe("tokenMatches", () => {
  const token = "a".repeat(32);

  it("menerima Bearer yang sama, apa pun kapitalisasi skemanya", () => {
    expect(tokenMatches(`Bearer ${token}`, token)).toBe(true);
    expect(tokenMatches(`bearer ${token}`, token)).toBe(true);
  });

  it("menolak token salah, kosong, atau tanpa skema Bearer", () => {
    expect(tokenMatches(`Bearer ${"b".repeat(32)}`, token)).toBe(false);
    expect(tokenMatches(null, token)).toBe(false);
    expect(tokenMatches(token, token)).toBe(false);
    expect(tokenMatches(`Bearer ${token.slice(1)}`, token)).toBe(false);
    expect(tokenMatches(`Bearer ${token}`, "")).toBe(false);
  });
});
