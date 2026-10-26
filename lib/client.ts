export type ModelSettings = { baseUrl: string; model: string; apiKey: string };

export const store = {
  /** The visitor's own model. It stays in this browser and is sent with each request; the server never saves it. */
  get llm(): ModelSettings | null {
    if (typeof window === "undefined") return null;
    try {
      const v = JSON.parse(localStorage.getItem("llm") ?? "null");
      return v && typeof v.baseUrl === "string" ? v : null;
    } catch {
      return null;
    }
  },
  set llm(v: ModelSettings | null) {
    if (v) localStorage.setItem("llm", JSON.stringify(v));
    else localStorage.removeItem("llm");
  },
  get profileId() {
    return typeof window === "undefined" ? null : localStorage.getItem("profileId");
  },
  set profileId(v: string | null) {
    if (v) localStorage.setItem("profileId", v);
    else localStorage.removeItem("profileId");
  },
  get conversationId() {
    return typeof window === "undefined" ? null : localStorage.getItem("conversationId");
  },
  set conversationId(v: string | null) {
    if (v) localStorage.setItem("conversationId", v);
    else localStorage.removeItem("conversationId");
  },
};
