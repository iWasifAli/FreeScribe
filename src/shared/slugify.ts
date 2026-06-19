namespace LMCL {
  export function slugifyTitle(title: string | null | undefined): string {
    const normalized = (title || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

    const slug = normalized
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-")
      .slice(0, 72)
      .replace(/-+$/g, "");

    return slug;
  }
}
