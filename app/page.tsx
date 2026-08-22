"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type ItemType = "note" | "link" | "document";
type ViewName = "inbox" | "library" | "favorites";

type VaultItem = {
  id: string;
  type: ItemType;
  title: string;
  content: string;
  url: string;
  category: string;
  inbox: boolean;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};

type Draft = {
  type: ItemType;
  title: string;
  content: string;
  url: string;
  category: string;
};

const emptyDraft: Draft = {
  type: "note",
  title: "",
  content: "",
  url: "",
  category: "uncategorized",
};

const typeMeta: Record<ItemType, { label: string; symbol: string; hint: string }> = {
  note: { label: "โน้ต", symbol: "Aa", hint: "จดไอเดียหรือข้อมูลสั้น ๆ" },
  link: { label: "ลิงก์", symbol: "↗", hint: "เก็บเว็บไซต์ที่ทีมต้องใช้" },
  document: { label: "เอกสาร", symbol: "▤", hint: "บันทึกเนื้อหาที่ยาวและเป็นระบบ" },
};

const categoryMeta: Record<string, { label: string; color: string }> = {
  uncategorized: { label: "ยังไม่จัดหมวด", color: "neutral" },
  project: { label: "โปรเจกต์", color: "orange" },
  team: { label: "ทีม", color: "green" },
  idea: { label: "ไอเดีย", color: "yellow" },
  reference: { label: "อ้างอิง", color: "blue" },
};

const viewMeta: Record<ViewName, { label: string; symbol: string; eyebrow: string }> = {
  inbox: { label: "Inbox", symbol: "⌂", eyebrow: "รายการใหม่" },
  library: { label: "คลังทั้งหมด", symbol: "▦", eyebrow: "ทุกอย่างของทีม" },
  favorites: { label: "รายการโปรด", symbol: "☆", eyebrow: "เปิดใช้บ่อย" },
};

function formatDate(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "ล่าสุด";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) {
    return `วันนี้ ${new Intl.DateTimeFormat("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)}`;
  }
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง";
}

export default function Home() {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [view, setView] = useState<ViewName>("inbox");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const loadItems = useCallback(async () => {
    try {
      setError("");
      const response = await fetch("/api/items", { cache: "no-store" });
      const data = (await response.json()) as { items?: VaultItem[]; error?: string };
      if (!response.ok) throw new Error(data.error || "เปิดคลังไม่สำเร็จ");
      setItems(data.items ?? []);
    } catch (loadError) {
      setError(messageFrom(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadItems(), 0);
    return () => window.clearTimeout(timer);
  }, [loadItems]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") setModalOpen(false);
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const timer = window.setTimeout(() => titleRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [modalOpen]);

  const inboxCount = items.filter((item) => item.inbox).length;
  const favoriteCount = items.filter((item) => item.favorite).length;
  const normalizedQuery = query.trim().toLocaleLowerCase("th");

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (view === "inbox" && !item.inbox) return false;
      if (view === "favorites" && !item.favorite) return false;
      if (category !== "all" && item.category !== category) return false;
      if (!normalizedQuery) return true;
      const haystack = [
        item.title,
        item.content,
        item.url,
        typeMeta[item.type].label,
        categoryMeta[item.category]?.label ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("th");
      return haystack.includes(normalizedQuery);
    });
  }, [category, items, normalizedQuery, view]);

  function selectView(nextView: ViewName) {
    setView(nextView);
    setCategory("all");
  }

  function openCreate(type: ItemType = "note") {
    setEditingId(null);
    setDraft({ ...emptyDraft, type });
    setError("");
    setModalOpen(true);
  }

  function openEdit(item: VaultItem) {
    setEditingId(item.id);
    setDraft({
      type: item.type,
      title: item.title,
      content: item.content,
      url: item.url,
      category: item.category,
    });
    setError("");
    setModalOpen(true);
  }

  async function updateItem(id: string, changes: Partial<VaultItem>, successMessage?: string) {
    setBusyId(id);
    setError("");
    try {
      const response = await fetch("/api/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...changes }),
      });
      const data = (await response.json()) as { item?: VaultItem; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error || "แก้ไขรายการไม่สำเร็จ");
      setItems((current) =>
        current.map((item) => (item.id === id ? data.item! : item)),
      );
      if (successMessage) {
        setNotice(successMessage);
        window.setTimeout(() => setNotice(""), 2400);
      }
      return data.item;
    } catch (updateError) {
      setError(messageFrom(updateError));
      return null;
    } finally {
      setBusyId(null);
    }
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyId(editingId ?? "new");
    setError("");
    try {
      const response = await fetch("/api/items", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...draft } : draft),
      });
      const data = (await response.json()) as { item?: VaultItem; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error || "บันทึกรายการไม่สำเร็จ");
      setItems((current) =>
        editingId
          ? current.map((item) => (item.id === editingId ? data.item! : item))
          : [data.item!, ...current],
      );
      setModalOpen(false);
      setNotice(editingId ? "บันทึกการแก้ไขแล้ว" : "เพิ่มรายการเข้า Inbox แล้ว");
      window.setTimeout(() => setNotice(""), 2400);
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteItem(id: string) {
    if (!window.confirm("ลบรายการนี้ออกจากคลังถาวรหรือไม่?")) return;
    setBusyId(id);
    try {
      const response = await fetch(`/api/items?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "ลบรายการไม่สำเร็จ");
      setItems((current) => current.filter((item) => item.id !== id));
      setModalOpen(false);
      setNotice("ลบรายการแล้ว");
      window.setTimeout(() => setNotice(""), 2400);
    } catch (deleteError) {
      setError(messageFrom(deleteError));
    } finally {
      setBusyId(null);
    }
  }

  const editingItem = editingId ? items.find((item) => item.id === editingId) : null;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand-mark" type="button" onClick={() => selectView("inbox")} aria-label="กลับไป Inbox">K</button>
        <nav aria-label="เมนูหลัก">
          {(Object.keys(viewMeta) as ViewName[]).map((name) => (
            <button
              className={`nav-item ${view === name ? "active" : ""}`}
              type="button"
              key={name}
              onClick={() => selectView(name)}
              aria-label={viewMeta[name].label}
              aria-current={view === name ? "page" : undefined}
            >
              <span aria-hidden="true">{viewMeta[name].symbol}</span>
              {name === "inbox" && inboxCount > 0 ? <small>{inboxCount}</small> : null}
            </button>
          ))}
        </nav>
        <button className="avatar" type="button" aria-label="พื้นที่ของทีม">ทีม</button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="wordmark" type="button" onClick={() => selectView("inbox")}>
            <span className="eyebrow">พื้นที่ของทีม</span>
            <strong>KLANG</strong>
          </button>
          <label className="search-box">
            <span className="search-symbol" aria-hidden="true">⌕</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาชื่อ เนื้อหา ลิงก์ หรือหมวด..."
              aria-label="ค้นหาในคลัง"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="ล้างคำค้น">×</button>
            ) : (
              <kbd>{typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl"} K</kbd>
            )}
          </label>
          <button className="primary-button" type="button" onClick={() => openCreate()}>
            <span aria-hidden="true">＋</span> เพิ่มรายการ
          </button>
        </header>

        <div className="content-grid">
          <section className="library-panel" aria-live="polite">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{viewMeta[view].eyebrow}</p>
                <h1>{viewMeta[view].label} <span>{filteredItems.length}</span></h1>
              </div>
              <p>{view === "inbox" ? "รับเข้าก่อน แล้วค่อยจัดหมวดเมื่อพร้อม" : "ค้นเจอทุกเรื่องที่ทีมเคยเก็บไว้"}</p>
            </div>

            {view === "inbox" && !query && category === "all" ? (
              <button className="quick-capture" type="button" onClick={() => openCreate()}>
                <span className="quick-icon" aria-hidden="true">＋</span>
                <span className="quick-copy">
                  <strong>เก็บอะไรไว้ดี?</strong>
                  <small>เพิ่มโน้ต วางลิงก์ หรือบันทึกเอกสารได้ทันที</small>
                </span>
                <span className="capture-types" aria-hidden="true">
                  <i>โน้ต</i><i>ลิงก์</i><i>เอกสาร</i>
                </span>
              </button>
            ) : null}

            <div className="filters" aria-label="กรองตามหมวด">
              <button type="button" className={category === "all" ? "selected" : ""} onClick={() => setCategory("all")}>ทั้งหมด</button>
              {Object.entries(categoryMeta).map(([key, meta]) => (
                <button type="button" key={key} className={category === key ? "selected" : ""} onClick={() => setCategory(key)}>
                  <span className={`category-dot ${meta.color}`} />{meta.label}
                </button>
              ))}
            </div>

            {error ? (
              <div className="message error-message" role="alert">
                <span>{error}</span>
                <button type="button" onClick={() => void loadItems()}>ลองอีกครั้ง</button>
              </div>
            ) : null}

            {loading ? (
              <div className="loading-state" role="status"><span />กำลังเปิดคลังของทีม...</div>
            ) : filteredItems.length ? (
              <div className="item-list">
                {filteredItems.map((item) => {
                  const meta = typeMeta[item.type];
                  const itemCategory = categoryMeta[item.category] ?? categoryMeta.uncategorized;
                  return (
                    <article className={`vault-item ${busyId === item.id ? "busy" : ""}`} key={item.id}>
                      <button className="item-main" type="button" onClick={() => openEdit(item)} aria-label={`เปิด ${item.title}`}>
                        <span className={`type-icon ${item.type}`} aria-hidden="true">{meta.symbol}</span>
                        <span className="item-copy">
                          <strong>{item.title}</strong>
                          <small>{item.type === "link" ? item.url : item.content || meta.hint}</small>
                        </span>
                      </button>
                      <label className="category-select">
                        <span className={`category-dot ${itemCategory.color}`} />
                        <select
                          value={item.category}
                          aria-label={`จัดหมวด ${item.title}`}
                          onChange={(event) => void updateItem(item.id, { category: event.target.value }, "จัดหมวดแล้ว")}
                        >
                          {Object.entries(categoryMeta).map(([key, metaOption]) => <option value={key} key={key}>{metaOption.label}</option>)}
                        </select>
                      </label>
                      {item.inbox ? (
                        <button className="archive-button" type="button" disabled={busyId === item.id} onClick={() => void updateItem(item.id, { inbox: false }, "เก็บเข้าคลังแล้ว")}>
                          เก็บเข้าคลัง
                        </button>
                      ) : (
                        <time>{formatDate(item.updatedAt)}</time>
                      )}
                      <button
                        className={`favorite-button ${item.favorite ? "active" : ""}`}
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void updateItem(item.id, { favorite: !item.favorite })}
                        aria-label={item.favorite ? `เอา ${item.title} ออกจากรายการโปรด` : `เพิ่ม ${item.title} เป็นรายการโปรด`}
                      >
                        {item.favorite ? "★" : "☆"}
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <div aria-hidden="true">{query ? "⌕" : viewMeta[view].symbol}</div>
                <h2>{query ? "ยังไม่พบสิ่งที่ค้นหา" : view === "inbox" ? "Inbox เรียบร้อยแล้ว" : "ยังไม่มีรายการตรงนี้"}</h2>
                <p>{query ? "ลองใช้คำที่สั้นลง หรือค้นจากชื่อหมวด" : "เพิ่มรายการใหม่เพื่อเริ่มสร้างคลังของทีม"}</p>
                {!query ? <button className="secondary-button" type="button" onClick={() => openCreate()}>＋ เพิ่มรายการแรก</button> : null}
              </div>
            )}
          </section>

          <aside className="insight-panel">
            <div>
              <p className="eyebrow">ภาพรวมคลัง</p>
              <h2>ทุกอย่าง<br />อยู่ใกล้มือ</h2>
            </div>
            <div className="stats">
              <button type="button" className="stat-row" onClick={() => selectView("library")}>
                <strong>{items.length}</strong><span>รายการทั้งหมด <b>↗</b></span>
              </button>
              <button type="button" className="stat-row" onClick={() => selectView("inbox")}>
                <strong>{inboxCount}</strong><span>รอจัดหมวด <b>↗</b></span>
              </button>
              <button type="button" className="stat-row" onClick={() => selectView("favorites")}>
                <strong>{favoriteCount}</strong><span>รายการโปรด <b>↗</b></span>
              </button>
            </div>
            <div className="type-shortcuts">
              <h3>เพิ่มอย่างรวดเร็ว</h3>
              <div>
                {(Object.keys(typeMeta) as ItemType[]).map((type) => (
                  <button type="button" key={type} onClick={() => openCreate(type)}>
                    <span className={`mini-type ${type}`}>{typeMeta[type].symbol}</span>{typeMeta[type].label}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>

      {notice ? <div className="toast" role="status"><span>✓</span>{notice}</div> : null}

      {modalOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
          <section className="item-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <header className="modal-header">
              <div>
                <p className="eyebrow">{editingId ? "แก้ไขรายการ" : "เพิ่มเข้า Inbox"}</p>
                <h2 id="modal-title">{editingId ? "รายละเอียดในคลัง" : "เก็บเรื่องนี้ไว้"}</h2>
              </div>
              <button className="close-button" type="button" onClick={() => setModalOpen(false)} aria-label="ปิด">×</button>
            </header>
            <form onSubmit={saveItem}>
              <fieldset className="type-picker" disabled={Boolean(editingId)}>
                <legend>ประเภท</legend>
                {(Object.keys(typeMeta) as ItemType[]).map((type) => (
                  <label className={draft.type === type ? "selected" : ""} key={type}>
                    <input type="radio" name="type" value={type} checked={draft.type === type} onChange={() => setDraft((current) => ({ ...current, type }))} />
                    <span className={`mini-type ${type}`}>{typeMeta[type].symbol}</span>
                    <strong>{typeMeta[type].label}</strong>
                  </label>
                ))}
              </fieldset>

              <label className="field">
                <span>ชื่อรายการ <b>*</b></span>
                <input ref={titleRef} value={draft.title} maxLength={160} required onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder={draft.type === "link" ? "เช่น คู่มือแบรนด์" : "ตั้งชื่อให้ค้นหาเจอง่าย"} />
              </label>

              {draft.type === "link" ? (
                <label className="field">
                  <span>URL <b>*</b></span>
                  <input type="url" value={draft.url} maxLength={2000} required onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} placeholder="https://example.com" inputMode="url" />
                </label>
              ) : null}

              <label className="field">
                <span>{draft.type === "document" ? "เนื้อหาเอกสาร" : draft.type === "link" ? "คำอธิบาย" : "รายละเอียด"}</span>
                <textarea value={draft.content} maxLength={12000} rows={draft.type === "document" ? 9 : 5} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} placeholder={typeMeta[draft.type].hint} />
                <small>{draft.content.length.toLocaleString("th-TH")} / 12,000</small>
              </label>

              <label className="field">
                <span>หมวดหมู่</span>
                <select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}>
                  {Object.entries(categoryMeta).map(([key, meta]) => <option value={key} key={key}>{meta.label}</option>)}
                </select>
              </label>

              {error ? <p className="form-error" role="alert">{error}</p> : null}

              <footer className="modal-actions">
                {editingItem ? <button className="danger-button" type="button" disabled={busyId === editingItem.id} onClick={() => void deleteItem(editingItem.id)}>ลบรายการ</button> : <span />}
                <div>
                  {editingItem?.type === "link" && editingItem.url ? <a href={editingItem.url} target="_blank" rel="noreferrer">เปิดลิงก์ ↗</a> : null}
                  <button className="ghost-button" type="button" onClick={() => setModalOpen(false)}>ยกเลิก</button>
                  <button className="primary-button" type="submit" disabled={busyId === (editingId ?? "new")}>{busyId === (editingId ?? "new") ? "กำลังบันทึก..." : editingId ? "บันทึก" : "เพิ่มเข้า Inbox"}</button>
                </div>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
