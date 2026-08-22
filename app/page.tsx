"use client";
/* eslint-disable react-hooks/set-state-in-effect, jsx-a11y/no-autofocus, jsx-a11y/no-static-element-interactions */

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ItemType = "note" | "link" | "document";
type ViewName = "inbox" | "library" | "favorites" | "trash" | "activity";
type Profile = {
  version: 1;
  deviceId: string;
  name: string;
  team: string;
  createdAt: string;
};
type VaultItem = {
  id: string;
  type: ItemType;
  title: string;
  content: string;
  url: string;
  category: string;
  inbox: boolean;
  favorite: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdByName: string;
  createdByTeam: string;
  updatedByName: string;
  updatedByTeam: string;
  deletedAt: string | null;
  deletedByName: string | null;
  deletedByTeam: string | null;
};
type Version = {
  id: string;
  versionNumber: number;
  title: string;
  actorName: string;
  actorTeam: string;
  createdAt: string;
  deletedAt: string | null;
};
type Attachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  uploadedByName: string;
  uploadedByTeam: string;
  createdAt: string;
};
type Tag = { id: string; name: string; color: string };
type Comment = { id: string; body: string; authorName: string; authorTeam: string; createdAt: string };
type Event = {
  id: string;
  action: string;
  summary: string;
  actorName: string;
  actorTeam: string;
  createdAt: string;
};
type Draft = {
  type: ItemType;
  title: string;
  content: string;
  url: string;
  category: string;
};
const profileKey = "klang_profile_v1";
const emptyDraft: Draft = {
  type: "note",
  title: "",
  content: "",
  url: "",
  category: "uncategorized",
};
const types: Record<ItemType, { label: string; symbol: string }> = {
  note: { label: "โน้ต", symbol: "Aa" },
  link: { label: "ลิงก์", symbol: "↗" },
  document: { label: "เอกสาร", symbol: "▤" },
};
const categories: Record<string, string> = {
  uncategorized: "ยังไม่จัดหมวด",
  project: "โปรเจกต์",
  team: "ทีม",
  idea: "ไอเดีย",
  reference: "อ้างอิง",
};
const views: Record<
  ViewName,
  { label: string; symbol: string; eyebrow: string }
> = {
  inbox: { label: "Inbox", symbol: "⌂", eyebrow: "รายการใหม่" },
  library: { label: "คลังทั้งหมด", symbol: "▤", eyebrow: "ทุกอย่างของทีม" },
  favorites: { label: "รายการโปรด", symbol: "☆", eyebrow: "หยิบใช้บ่อย" },
  trash: { label: "ถังขยะ", symbol: "♲", eyebrow: "กู้คืนได้ภายใน 30 วัน" },
  activity: { label: "Activity", symbol: "◷", eyebrow: "ความเคลื่อนไหวของทีม" },
};
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "ล่าสุด"
    : new Intl.DateTimeFormat("th-TH", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง";
}
function actor(profile: Profile) {
  return { deviceId: profile.deviceId, name: profile.name, team: profile.team };
}

export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileForm, setProfileForm] = useState({ name: "", team: "" });
  const [items, setItems] = useState<VaultItem[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [view, setView] = useState<ViewName>("inbox");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [itemTags, setItemTags] = useState<Tag[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [modal, setModal] = useState<"item" | "profile" | null>(null);
  const [editing, setEditing] = useState<VaultItem | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [history, setHistory] = useState<Version[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [conflict, setConflict] = useState<VaultItem | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const load = useCallback(
    async (nextView = view) => {
      if (!profile) return;
      setLoading(true);
      try {
        setError("");
        if (nextView === "activity") {
          const response = await fetch("/api/activity", { cache: "no-store" });
          const data = (await response.json()) as {
            events?: Event[];
            error?: string;
          };
          if (!response.ok) throw new Error(data.error);
          setEvents(data.events ?? []);
        } else {
          const params = new URLSearchParams({ page: String(page), pageSize: "50" });
          if (nextView === "trash") params.set("view", "trash");
          if (query.trim()) params.set("q", query.trim());
          const response = await fetch(`/api/items?${params}`, {
            cache: "no-store",
          });
          const data = (await response.json()) as {
            items?: VaultItem[];
            hasMore?: boolean;
            error?: string;
          };
          if (!response.ok) throw new Error(data.error);
          setItems(data.items ?? []);
          setHasMore(Boolean(data.hasMore));
        }
      } catch (reason) {
        setError(message(reason));
      } finally {
        setLoading(false);
      }
    },
    [profile, view, query, page],
  );
  useEffect(() => {
    try {
      const saved = localStorage.getItem(profileKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Profile;
        if (parsed.name && parsed.team && parsed.deviceId) setProfile(parsed);
      }
    } catch {
      localStorage.removeItem(profileKey);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (profile) void load(view);
  }, [profile, view, load]);
  useEffect(() => {
    if (modal === "item") setTimeout(() => titleRef.current?.focus(), 40);
  }, [modal]);
  useEffect(() => { if (!profile) return; const refresh = () => { void load(view); }; const timer = window.setInterval(refresh, 20_000); return () => window.clearInterval(timer); }, [profile, view, load]);
  useEffect(() => { if (!profile) return; void fetch("/api/collaboration", { cache: "no-store" }).then((response) => response.json()).then((data: { tags?: Tag[] }) => setAllTags(data.tags ?? [])).catch(() => undefined); }, [profile]);
  const filtered = useMemo(
    () =>
      items.filter((item) => {
        if (view === "inbox" && !item.inbox) return false;
        if (view === "favorites" && !item.favorite) return false;
        if (category !== "all" && item.category !== category) return false;
        return (
          !query ||
          [
            item.title,
            item.content,
            item.url,
            item.updatedByName,
            item.updatedByTeam,
          ]
            .join(" ")
            .toLowerCase()
            .includes(query.trim().toLowerCase())
        );
      }),
    [items, view, category, query],
  );
  const categoryOptions = useMemo(() => Array.from(new Set([...Object.keys(categories), ...items.map((item) => item.category), draft.category])).filter(Boolean).map((value) => [value, categories[value] ?? value] as const), [items, draft.category]);
  function toast(text: string) {
    setNotice(text);
    setTimeout(() => setNotice(""), 2600);
  }
  async function restoreBackup(file: File | null) {
    if (!file || !profile) return;
    try {
      const backup = JSON.parse(await file.text());
      const response = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actor: actor(profile), backup }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "กู้คืนข้อมูลไม่สำเร็จ");
      await load(view); toast("กู้คืนข้อมูลจากไฟล์สำรองแล้ว");
    } catch (reason) { setError(message(reason)); }
  }
  function saveProfile(event: FormEvent) {
    event.preventDefault();
    const name = profileForm.name.trim().slice(0, 80);
    const team = profileForm.team.trim().slice(0, 80);
    if (!name || !team) return;
    const next: Profile = profile
      ? { ...profile, name, team }
      : {
          version: 1,
          deviceId: crypto.randomUUID(),
          name,
          team,
          createdAt: new Date().toISOString(),
        };
    localStorage.setItem(profileKey, JSON.stringify(next));
    setProfile(next);
    setModal(null);
    toast(
      profile
        ? "อัปเดตชื่อและทีมแล้ว"
        : "พร้อมใช้งานแล้ว ยินดีต้อนรับสู่ KLANG",
    );
  }
  function openCreate(type: ItemType = "note") {
    setEditing(null);
    setDraft({ ...emptyDraft, type });
    setHistory([]);
    setAttachments([]);
    setSelectedFile(null);
    setCustomCategory("");
    setShowHistory(false);
    setConflict(null);
    setModal("item");
  }
  async function openEdit(item: VaultItem) {
    setEditing(item);
    setDraft({
      type: item.type,
      title: item.title,
      content: item.content,
      url: item.url,
      category: item.category,
    });
    setHistory([]);
    setAttachments([]);
    setSelectedFile(null);
    setCustomCategory("");
    setShowHistory(false);
    setConflict(null);
    setModal("item");
    try {
      const [historyResponse, filesResponse, collaborationResponse] = await Promise.all([
        fetch(`/api/items?id=${encodeURIComponent(item.id)}&history=1`, {
          cache: "no-store",
        }),
        fetch(`/api/files?itemId=${encodeURIComponent(item.id)}`, {
          cache: "no-store",
        }),
        fetch(`/api/collaboration?itemId=${encodeURIComponent(item.id)}`, { cache: "no-store" }),
      ]);
      const data = (await historyResponse.json()) as { versions?: Version[] };
      const fileData = (await filesResponse.json()) as {
        attachments?: Attachment[];
      };
      const collaborationData = (await collaborationResponse.json()) as { tags?: Tag[]; comments?: Comment[] };
      if (historyResponse.ok) setHistory(data.versions ?? []);
      if (filesResponse.ok) setAttachments(fileData.attachments ?? []);
      if (collaborationResponse.ok) { setItemTags(collaborationData.tags ?? []); setComments(collaborationData.comments ?? []); }
    } catch {
      /* supplemental data */
    }
  }
  async function addComment() {
    if (!editing || !profile || !commentDraft.trim()) return;
    const response = await fetch("/api/collaboration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "comment", itemId: editing.id, body: commentDraft, actor: actor(profile) }) });
    const data = await response.json() as { comment?: Comment; error?: string }; if (!response.ok) { setError(data.error || "เพิ่มความคิดเห็นไม่สำเร็จ"); return; } setComments((current) => [...current, data.comment!]); setCommentDraft("");
  }
  async function saveTags(tagIds: string[]) { if (!editing || !profile) return; const response = await fetch("/api/collaboration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set_tags", itemId: editing.id, tagIds, actor: actor(profile) }) }); if (response.ok) setItemTags(allTags.filter((tag) => tagIds.includes(tag.id))); }
  async function createTag() { if (!profile || !newTagName.trim()) return; const response = await fetch("/api/collaboration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_tag", name: newTagName, actor: actor(profile) }) }); const data = await response.json() as { tag?: Tag }; if (data.tag) { setAllTags((current) => [...current, data.tag!]); setNewTagName(""); } }
  async function write(
    method: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown>,
  ) {
    if (!profile) throw new Error("กรุณาระบุชื่อและทีม");
    const response = await fetch("/api/items", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, actor: actor(profile) }),
    });
    const data = (await response.json()) as {
      item?: VaultItem;
      current?: VaultItem;
      error?: string;
    };
    if (response.status === 409 && data.current) {
      setConflict(data.current);
      throw new Error("รายการนี้ถูกแก้ไขโดยคนอื่นแล้ว");
    }
    if (!response.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
    return data.item;
  }
  async function saveItem(event: FormEvent) {
    event.preventDefault();
    setBusyId(editing?.id ?? "new");
    setError("");
    try {
      const item = await write(
        editing ? "PATCH" : "POST",
        editing
          ? { id: editing.id, expectedVersion: editing.version, ...draft, category: customCategory.trim() || draft.category }
          : { ...draft, category: customCategory.trim() || draft.category },
      );
      if (!item) throw new Error("บันทึกไม่สำเร็จ");
      if (selectedFile && profile) {
        const form = new FormData();
        form.set("itemId", item.id);
        form.set("file", selectedFile);
        form.set("actor", JSON.stringify(actor(profile)));
        const response = await fetch("/api/files", {
          method: "POST",
          body: form,
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(data.error || "อัปโหลดไฟล์ไม่สำเร็จ");
      }
      setModal(null);
      await load(view);
      toast(
        selectedFile
          ? "บันทึกรายการและอัปโหลดไฟล์แล้ว"
          : editing
            ? "บันทึกการแก้ไขแล้ว"
            : "เพิ่มรายการเข้า Inbox แล้ว",
      );
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusyId(null);
    }
  }
  async function patchItem(
    item: VaultItem,
    changes: Record<string, unknown>,
    success: string,
  ) {
    setBusyId(item.id);
    try {
      await write("PATCH", {
        id: item.id,
        expectedVersion: item.version,
        ...changes,
      });
      await load(view);
      toast(success);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusyId(null);
    }
  }
  async function trashItem(item: VaultItem) {
    if (!confirm(`ย้าย “${item.title}” ไปถังขยะ?\nกู้คืนได้ภายใน 30 วัน`))
      return;
    setBusyId(item.id);
    try {
      await write("DELETE", { id: item.id, expectedVersion: item.version });
      setModal(null);
      await load(view);
      toast("ย้ายไปถังขยะแล้ว");
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusyId(null);
    }
  }
  async function restoreVersion(version: Version) {
    if (!editing) return;
    await patchItem(
      editing,
      { restoreVersionId: version.id },
      "กู้คืนเวอร์ชันแล้ว",
    );
    setModal(null);
  }
  const inboxCount = items.filter((item) => item.inbox).length;
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button
          className="brand-mark"
          type="button"
          onClick={() => { setView("inbox"); setPage(1); }}
        >
          K
        </button>
        <nav aria-label="เมนูหลัก">
          {(Object.keys(views) as ViewName[]).map((name) => (
            <button
              className={`nav-item ${view === name ? "active" : ""}`}
              type="button"
              key={name}
              onClick={() => {
                setView(name); setPage(1);
                setCategory("all");
              }}
              title={views[name].label}
            >
              <span>{views[name].symbol}</span>
              {name === "inbox" && inboxCount ? (
                <small>{inboxCount}</small>
              ) : null}
            </button>
          ))}
        </nav>
        <button
          className="avatar"
          type="button"
          onClick={() => {
            setProfileForm({
              name: profile?.name ?? "",
              team: profile?.team ?? "",
            });
            setModal("profile");
          }}
        >
          {profile?.name.slice(0, 2) || "คุณ"}
        </button>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <button
            className="wordmark"
            type="button"
            onClick={() => { setView("inbox"); setPage(1); }}
          >
            <span className="eyebrow">คลังงานกลางของทีม</span>
            <strong>KLANG</strong>
          </button>
          <label className="search-box">
            <span>⌕</span>
            <input
              type="search"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1); }}
              placeholder="ค้นหาชื่อ เนื้อหา ลิงก์ หรือคนที่แก้ไข"
            />
            <kbd>Public</kbd>
          </label>
          <button
            className="primary-button"
            type="button"
            onClick={() => openCreate()}
          >
            ＋ เพิ่มรายการ
          </button>
        </header>
        <div className="content-grid">
          <section className="library-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{views[view].eyebrow}</p>
                <h1>
                  {views[view].label}{" "}
                  <span>
                    {view === "activity" ? events.length : filtered.length}
                  </span>
                </h1>
              </div>
              <p>
                {profile
                  ? `กำลังใช้งานในชื่อ ${profile.name} · ${profile.team}`
                  : "กรุณาระบุชื่อและทีมก่อนเริ่ม"}
              </p>
            </div>
            {view !== "activity" && view !== "trash" ? (
              <>
                <button
                  className="quick-capture"
                  type="button"
                  onClick={() => openCreate()}
                >
                  <span className="quick-icon">＋</span>
                  <span className="quick-copy">
                    <strong>เก็บอะไรไว้ดี?</strong>
                    <small>
                      เพิ่มโน้ต ลิงก์ หรือเอกสารได้ทันที ทุกอย่างใหม่จะเข้า
                      Inbox ก่อน
                    </small>
                  </span>
                </button>
                <div className="filters">
                  <button
                    className={category === "all" ? "selected" : ""}
                    type="button"
                    onClick={() => setCategory("all")}
                  >
                    ทั้งหมด
                  </button>
                  {categoryOptions.map(([key, label]) => (
                    <button
                      key={key}
                      className={category === key ? "selected" : ""}
                      type="button"
                      onClick={() => setCategory(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            {error ? (
              <div className="message error-message" role="alert">
                <span>{error}</span>
                <button type="button" onClick={() => void load(view)}>
                  ลองอีกครั้ง
                </button>
              </div>
            ) : null}
            {loading ? (
              <div className="loading-state">
                <span />
                กำลังเปิดคลัง...
              </div>
            ) : view === "activity" ? (
              <div className="item-list">
                {events.map((event) => (
                  <article className="vault-item activity-row" key={event.id}>
                    <span className="type-icon note">◷</span>
                    <span className="item-copy">
                      <strong>{event.summary}</strong>
                      <small>
                        {event.actorName} · {event.actorTeam} · {event.action}
                      </small>
                    </span>
                    <time>{formatDate(event.createdAt)}</time>
                  </article>
                ))}
              </div>
            ) : filtered.length ? (
              <>
              <div className="item-list">
                {filtered.map((item) => (
                  <article
                    className={`vault-item ${busyId === item.id ? "busy" : ""}`}
                    key={item.id}
                  >
                    <button
                      className="item-main"
                      type="button"
                      onClick={() =>
                        view === "trash" ? undefined : void openEdit(item)
                      }
                    >
                      <span className={`type-icon ${item.type}`}>
                        {types[item.type].symbol}
                      </span>
                      <span className="item-copy">
                        <strong>{item.title}</strong>
                        <small>
                          {view === "trash"
                            ? `ลบโดย ${item.deletedByName} · ${item.deletedByTeam}`
                            : `${item.type === "link" ? item.url : item.content || types[item.type].label} · ล่าสุดโดย ${item.updatedByName} · ${item.updatedByTeam}`}
                        </small>
                      </span>
                    </button>
                    {view === "trash" ? (
                      <button
                        className="archive-button"
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() =>
                          void patchItem(
                            item,
                            { operation: "restore" },
                            "กู้คืนรายการแล้ว",
                          )
                        }
                      >
                        กู้คืน
                      </button>
                    ) : (
                      <>
                        <label className="category-select">
                          <select
                            value={item.category}
                            onChange={(event) =>
                              void patchItem(
                                item,
                                { category: event.target.value },
                                "จัดหมวดแล้ว",
                              )
                            }
                          >
                            {categoryOptions.map(([key, label]) => (
                              <option key={key} value={key}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {item.inbox ? (
                          <button
                            className="archive-button"
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() =>
                              void patchItem(
                                item,
                                { inbox: false },
                                "เก็บเข้าคลังแล้ว",
                              )
                            }
                          >
                            เก็บเข้าคลัง
                          </button>
                        ) : (
                          <time>{formatDate(item.updatedAt)}</time>
                        )}
                        <button
                          className={`favorite-button ${item.favorite ? "active" : ""}`}
                          type="button"
                          onClick={() =>
                            void patchItem(
                              item,
                              { favorite: !item.favorite },
                              "อัปเดตรายการโปรดแล้ว",
                            )
                          }
                        >
                          {item.favorite ? "★" : "☆"}
                        </button>
                      </>
                    )}
                  </article>
                ))}
              </div>
              <div className="pagination-controls">
                <button className="secondary-button" type="button" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>ก่อนหน้า</button>
                <span>หน้า {page}</span>
                <button className="secondary-button" type="button" disabled={!hasMore} onClick={() => setPage((current) => current + 1)}>ถัดไป</button>
              </div>
              </>
            ) : (
              <div className="empty-state">
                <div>{views[view].symbol}</div>
                <h2>
                  {view === "trash" ? "ถังขยะว่าง" : "ยังไม่มีรายการตรงนี้"}
                </h2>
                <p>
                  {view === "trash"
                    ? "รายการที่ย้ายมาจะกู้คืนได้เป็นเวลา 30 วัน"
                    : "เริ่มเพิ่มโน้ต ลิงก์ หรือเอกสารให้ทีมได้เลย"}
                </p>
                {view !== "trash" ? (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => openCreate()}
                  >
                    ＋ เพิ่มรายการแรก
                  </button>
                ) : null}
              </div>
            )}
          </section>
          <aside className="insight-panel">
            <div>
              <p className="eyebrow">สถานะการใช้งาน</p>
              <h2>
                คลังเดียว
                <br />
                ใช้ร่วมกัน
              </h2>
            </div>
            <div className="stats">
              <button
                className="stat-row"
                type="button"
                onClick={() => setView("library")}
              >
                <strong>{items.length}</strong>
                <span>รายการทั้งหมด</span>
              </button>
              <button
                className="stat-row"
                type="button"
                onClick={() => setView("inbox")}
              >
                <strong>{inboxCount}</strong>
                <span>รอจัดหมวด</span>
              </button>
              <button
                className="stat-row"
                type="button"
                onClick={() => setView("trash")}
              >
                <strong>30</strong>
                <span>วันก่อนลบถาวร</span>
              </button>
            </div>
            <div className="type-shortcuts">
              <h3>เพิ่มอย่างรวดเร็ว</h3>
              <div>
                {(Object.keys(types) as ItemType[]).map((type) => (
                  <button
                    type="button"
                    key={type}
                    onClick={() => openCreate(type)}
                  >
                    <span className={`mini-type ${type}`}>
                      {types[type].symbol}
                    </span>
                    {types[type].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="backup-actions">
              <a className="secondary-button" href="/api/backup">ดาวน์โหลด Backup</a>
              <label className="secondary-button">
                กู้คืน Backup
                <input type="file" accept="application/json" onChange={(event) => void restoreBackup(event.target.files?.[0] ?? null)} />
              </label>
            </div>
          </aside>
        </div>
      </section>
      {notice ? (
        <div className="toast" role="status">
          ✓ {notice}
        </div>
      ) : null}
      {!profile || modal === "profile" ? (
        <div className="modal-backdrop">
          <section
            className="item-modal profile-modal"
            role="dialog"
            aria-modal="true"
          >
            <header className="modal-header">
              <div>
                <p className="eyebrow">เริ่มใช้งาน KLANG</p>
                <h2>คุณชื่ออะไร อยู่ทีมไหน?</h2>
              </div>
              {profile ? (
                <button
                  className="close-button"
                  type="button"
                  onClick={() => setModal(null)}
                >
                  ×
                </button>
              ) : null}
            </header>
            <form onSubmit={saveProfile}>
              <p className="profile-copy">
                ใช้เพียงเพื่อแสดงว่าใครเป็นผู้เพิ่มหรือแก้ไขรายการ ชื่อซ้ำได้
                ทุกคนใช้สิทธิ์เท่ากัน
                และข้อมูลนี้จำไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น
              </p>
              <label className="field">
                <span>
                  ชื่อของคุณ <b>*</b>
                </span>
                <input
                  value={profileForm.name}
                  maxLength={80}
                  required
                  autoFocus
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="เช่น เอ"
                />
              </label>
              <label className="field">
                <span>
                  ทีม <b>*</b>
                </span>
                <input
                  value={profileForm.team}
                  maxLength={80}
                  required
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      team: event.target.value,
                    }))
                  }
                  placeholder="เช่น มังกร"
                />
              </label>
              <footer className="modal-actions">
                <span />{" "}
                <button className="primary-button" type="submit">
                  เริ่มใช้งาน
                </button>
              </footer>
              {profile ? (
                <button
                  className="danger-button forget-button"
                  type="button"
                  onClick={() => {
                    localStorage.removeItem(profileKey);
                    setProfile(null);
                    setModal(null);
                  }}
                >
                  ลืมชื่อในเครื่องนี้
                </button>
              ) : null}
            </form>
          </section>
        </div>
      ) : null}
      {modal === "item" ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setModal(null);
          }}
        >
          <section className="item-modal" role="dialog" aria-modal="true">
            <header className="modal-header">
              <div>
                <p className="eyebrow">
                  {editing
                    ? `เวอร์ชัน ${editing.version} · ล่าสุดโดย ${editing.updatedByName}`
                    : "เพิ่มเข้า Inbox"}
                </p>
                <h2>{editing ? "รายละเอียดรายการ" : "เก็บเรื่องนี้ไว้"}</h2>
              </div>
              <button
                className="close-button"
                type="button"
                onClick={() => setModal(null)}
              >
                ×
              </button>
            </header>
            {showHistory ? (
              <div className="history-panel">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => setShowHistory(false)}
                >
                  ← กลับไปแก้ไข
                </button>
                <h3>ประวัติการแก้ไข</h3>
                {history.length ? (
                  history.map((version) => (
                    <div className="history-entry" key={version.id}>
                      <strong>
                        เวอร์ชัน {version.versionNumber}: {version.title}
                      </strong>
                      <small>
                        {version.actorName} · {version.actorTeam} ·{" "}
                        {formatDate(version.createdAt)}
                        {version.deletedAt ? " · ย้ายลงถังขยะ" : ""}
                      </small>
                      {editing && version.versionNumber !== editing.version ? (
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => void restoreVersion(version)}
                        >
                          กู้คืนเวอร์ชันนี้
                        </button>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p>ยังไม่มีประวัติเพิ่มเติม</p>
                )}
              </div>
            ) : (
              <form onSubmit={saveItem}>
                <fieldset className="type-picker" disabled={Boolean(editing)}>
                  <legend>ประเภท</legend>
                  {(Object.keys(types) as ItemType[]).map((type) => (
                    <label
                      className={draft.type === type ? "selected" : ""}
                      key={type}
                    >
                      <input
                        type="radio"
                        checked={draft.type === type}
                        onChange={() =>
                          setDraft((current) => ({ ...current, type }))
                        }
                      />
                      <span className={`mini-type ${type}`}>
                        {types[type].symbol}
                      </span>
                      <strong>{types[type].label}</strong>
                    </label>
                  ))}
                </fieldset>
                <label className="field">
                  <span>
                    ชื่อรายการ <b>*</b>
                  </span>
                  <input
                    ref={titleRef}
                    value={draft.title}
                    required
                    maxLength={160}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                {draft.type === "link" ? (
                  <label className="field">
                    <span>
                      URL <b>*</b>
                    </span>
                    <input
                      type="url"
                      value={draft.url}
                      required
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          url: event.target.value,
                        }))
                      }
                      placeholder="https://example.com"
                    />
                  </label>
                ) : null}
                <label className="field">
                  <span>รายละเอียด</span>
                  <textarea
                    value={draft.content}
                    maxLength={12000}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        content: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>ไฟล์แนบ (PDF, Word หรือรูปภาพ; ไม่เกิน 15 MB)</span>
                  <input
                    type="file"
                    accept="application/pdf,.doc,.docx,image/jpeg,image/png,image/webp,image/gif"
                    onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  />
                  {selectedFile ? <small>{selectedFile.name}</small> : null}
                </label>
                {attachments.length ? (
                  <div className="attachment-list">
                    <span>ไฟล์ที่แนบแล้ว</span>
                    {attachments.map((attachment) => (
                      <a key={attachment.id} href={`/api/files?id=${attachment.id}`} target="_blank" rel="noreferrer">
                        {attachment.filename} ({Math.ceil(attachment.size / 1024)} KB)
                      </a>
                    ))}
                  </div>
                ) : null}
                {editing ? <div className="tag-panel"><strong>แท็ก</strong><div>{allTags.map((tag) => <label key={tag.id}><input type="checkbox" checked={itemTags.some((current) => current.id === tag.id)} onChange={(event) => { const ids = event.target.checked ? [...itemTags.map((current) => current.id), tag.id] : itemTags.filter((current) => current.id !== tag.id).map((current) => current.id); void saveTags(ids); }} /> {tag.name}</label>)}</div><div><input value={newTagName} maxLength={40} onChange={(event) => setNewTagName(event.target.value)} placeholder="สร้างแท็กใหม่" /><button className="secondary-button" type="button" onClick={() => void createTag()}>เพิ่มแท็ก</button></div></div> : null}
                <label className="field">
                  <span>หมวดหมู่</span>
                  <select
                    value={draft.category}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        category: event.target.value,
                      }))
                    }
                  >
                    {categoryOptions.map(([key, label]) => (
                      <option value={key} key={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>หรือสร้างหมวดใหม่</span>
                  <input value={customCategory} maxLength={40} onChange={(event) => setCustomCategory(event.target.value)} placeholder="เช่น ลูกค้า, การตลาด, Sprint 1" />
                </label>
                {error ? <p className="form-error">{error}</p> : null}
                {editing ? (
                  <div className="comments-panel">
                    <strong>ความคิดเห็น</strong>
                    {comments.map((comment) => <p key={comment.id}><b>{comment.authorName} · {comment.authorTeam}</b><span>{comment.body}</span></p>)}
                    <div><input value={commentDraft} maxLength={2000} onChange={(event) => setCommentDraft(event.target.value)} placeholder="เขียนความคิดเห็น" /><button className="secondary-button" type="button" onClick={() => void addComment()}>ส่ง</button></div>
                  </div>
                ) : null}
                {conflict ? (
                  <div className="conflict-box">
                    <strong>มีคนบันทึกเวอร์ชันใหม่ก่อนคุณ</strong>
                    <p>
                      เวอร์ชันล่าสุดคือ {conflict.version} โดย{" "}
                      {conflict.updatedByName} · {conflict.updatedByTeam}
                    </p>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => {
                        void openEdit(conflict);
                        setConflict(null);
                      }}
                    >
                      โหลดเวอร์ชันล่าสุด
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => {
                        setEditing(null);
                        setDraft((current) => ({
                          ...current,
                          title: `${current.title} (สำเนา)`,
                        }));
                        setConflict(null);
                      }}
                    >
                      บันทึกเป็นสำเนา
                    </button>
                  </div>
                ) : null}
                <footer className="modal-actions">
                  {editing ? (
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() => void trashItem(editing)}
                    >
                      ย้ายลงถังขยะ
                    </button>
                  ) : (
                    <span />
                  )}
                  <div>
                    {editing ? (
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => setShowHistory(true)}
                      >
                        ประวัติ
                      </button>
                    ) : null}
                    {editing?.url ? (
                      <a href={editing.url} target="_blank" rel="noreferrer">
                        เปิดลิงก์ ↗
                      </a>
                    ) : null}
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={busyId !== null}
                    >
                      {busyId
                        ? "กำลังบันทึก..."
                        : editing
                          ? "บันทึก"
                          : "เพิ่มเข้า Inbox"}
                    </button>
                  </div>
                </footer>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}
