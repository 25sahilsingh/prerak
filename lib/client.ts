export const store = {
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
