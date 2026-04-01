"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Layers, Download, Printer } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

export interface ModelEntry {
  id: string;
  rel_path: string;
  title: string;
  description: string;
  designer: string;
  license: string;
  creation_date: string;
  profile_title: string;
  thumb: string | null;
  pictures: string[];
}

interface ModelGroup {
  title: string;
  thumb: string | null;
  profiles: ModelEntry[];
}

// ─── URL 工具 ───
function updateUrlParams(updates: Record<string, string | null>) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
  }
  const qs = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? "?" + qs : ""}`);
}

const SCROLL_KEY = "gallery_scroll_y";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';
function assetUrl(p: string | null): string | undefined {
  return p ? `${BASE_PATH}${p}` : undefined;
}

// ═══════════════════════════════════════════════════════════════
// 弹窗内容组件 — 独立管理 hoveredPic / activePicIdx 等状态
// hover 分盘图片时只会重渲染此组件，不会波及外部 197 张卡片网格
// ═══════════════════════════════════════════════════════════════
function ModelDetailContent({
  group,
  onClose,
}: {
  group: ModelGroup;
  onClose: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeProfile = group.profiles[activeIndex];

  const [activePicIdx, setActivePicIdx] = useState(0);
  const [hoveredPic, setHoveredPic] = useState<string | null>(null);



  // 切换配置变体时重置图片索引
  useEffect(() => {
    setActivePicIdx(0);
    setHoveredPic(null);
  }, [activeIndex]);

  const { modelPics, platePics } = useMemo(() => {
    const allPics = Array.from(new Set(activeProfile.pictures || []));
    const mp = allPics.filter((p) => !p.match(/_plate(\d+)/i));

    const uniquePlates = new Map<number, string>();
    allPics.forEach((p) => {
      const m = p.match(/_plate(\d+)/i);
      if (m) {
        const pid = parseInt(m[1], 10);
        if (!uniquePlates.has(pid)) uniquePlates.set(pid, p);
      }
    });
    const plates = Array.from(uniquePlates.entries())
      .sort((a, b) => a[0] - b[0])
      .map((e) => e[1]);

    if (mp.length === 0 && activeProfile.thumb) mp.push(activeProfile.thumb);
    return { modelPics: Array.from(new Set(mp)), platePics: plates };
  }, [activeProfile]);

  // ESC 关闭
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // 锁定页面滚动
  useEffect(() => {
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, []);



  const displaySrc = assetUrl(hoveredPic || modelPics[activePicIdx] || null);

  return (
    <>
      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="
          absolute top-4 right-4 z-20 p-2.5 rounded-full shadow-sm transition-all hover:scale-105
          bg-white/80 dark:bg-stone-700/80 backdrop-blur
          hover:bg-white dark:hover:bg-stone-600
          text-stone-900 dark:text-stone-100
        "
      >
        <X className="w-5 h-5" />
      </button>

      <div className="flex flex-col md:flex-row h-full overflow-hidden">

        {/* ── 左侧：图片画廊 (固定比例布局，切换配置时无抖动) ── */}
        <div className="w-full md:w-[45%] flex-shrink-0 p-4 md:p-6 flex flex-col max-h-[45vh] md:max-h-full overflow-hidden">
          {/* 主预览图 — 固定占 70% 高度 */}
          <div
            className="rounded-2xl overflow-hidden shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] flex items-center justify-center relative group select-none"
            style={{ background: "rgba(0,0,0,0.04)", height: "70%", flexShrink: 0 }}
          >
            {displaySrc ? (
              <>
                <img
                  src={displaySrc}
                  alt="预览"
                  className="w-full h-full object-contain"
                />

                {!hoveredPic && modelPics.length > 1 && (
                  <>
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1/4 cursor-pointer z-10 hover:bg-gradient-to-r hover:from-black/5 hover:to-transparent transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivePicIdx((prev) =>
                          prev > 0 ? prev - 1 : modelPics.length - 1
                        );
                      }}
                      title="上一张"
                    />
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1/4 cursor-pointer z-10 hover:bg-gradient-to-l hover:from-black/5 hover:to-transparent transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivePicIdx((prev) =>
                          prev < modelPics.length - 1 ? prev + 1 : 0
                        );
                      }}
                      title="下一张"
                    />
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
                      {modelPics.map((_, i) => (
                        <div
                          key={i}
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            i === activePicIdx
                              ? "w-4 bg-stone-800 dark:bg-stone-200"
                              : "w-1.5 bg-stone-400/50"
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <span style={{ color: "var(--text-muted)" }} className="font-medium">
                无展示数据
              </span>
            )}
          </div>

          {/* 分盘缩略图 — 占剩余 30%，内容多时可滚动 */}
          {platePics.length > 0 && (
            <div className="mt-2.5 min-h-0 flex-1 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-5 lg:grid-cols-6 gap-1.5">
                {platePics.map((pic, i) => {
                  const isPlate = pic.match(/_plate(\d+)/i);
                  const label = isPlate ? `P${isPlate[1]}` : `${i + 1}`;
                  const isHovered = hoveredPic === pic;
                  return (
                    <div
                      key={i}
                      onPointerEnter={() => setHoveredPic(pic)}
                      onPointerLeave={() => setHoveredPic(null)}
                      className={`aspect-square rounded-lg overflow-hidden cursor-default relative transition-shadow duration-150 ${
                        isHovered
                          ? "ring-2 ring-stone-900 dark:ring-stone-200 ring-offset-1"
                          : "border border-stone-200/50 dark:border-stone-600/50"
                      }`}
                      style={{ background: "var(--bg-muted)" }}
                    >
                      <span
                        className={`absolute bottom-0.5 right-0.5 px-1 py-px rounded text-[8px] font-bold pointer-events-none z-10 transition-colors duration-150 ${
                          isHovered
                            ? "bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900"
                            : "bg-black/50 text-white/90"
                        }`}
                      >
                        {label}
                      </span>
                      <img
                        src={assetUrl(pic)}
                        alt={`分盘 ${i + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── 右侧：固定标题 + 独立滚动内容区（避免 sticky + transform 冲突） ── */}
        <div className="flex-1 min-h-0 flex flex-col">
          {/* 标题 — 不滚动，固定在顶部 */}
          <div
            className="flex-shrink-0 px-6 md:px-8 md:pr-14 pt-6 md:pt-8 pb-3"
            style={{ background: "var(--bg-modal)", borderBottom: "1px solid var(--border-subtle)" }}
          >
            <h1
              className="font-serif text-2xl md:text-4xl leading-tight tracking-tight line-clamp-3 cursor-default"
              style={{ color: "var(--text-primary)" }}
              title={group.title}
            >
              {group.title}
            </h1>
          </div>

          {/* 内容区 — 独立滚动 */}
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <div className="px-6 md:px-8 pb-8 pt-5">

              {/* 配置变体选择器 */}
              {group.profiles.length > 1 && (
                <div
                  className="mb-5 p-4 rounded-2xl"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <span
                    className="uppercase text-[10px] font-bold tracking-widest block mb-3"
                    style={{ color: "var(--text-muted)" }}
                  >
                    配置变体表 ({group.profiles.length})
                  </span>
                  <div className="flex flex-wrap gap-2 max-h-[100px] overflow-y-auto pr-2 custom-scrollbar">
                    {group.profiles.map((prof: ModelEntry, idx: number) => {
                      const btnLabel =
                        prof.profile_title ||
                        prof.rel_path.split("/").pop() ||
                        `配置项 ${idx + 1}`;
                      return (
                        <button
                          key={prof.id}
                          onClick={() => setActiveIndex(idx)}
                          className={`px-3.5 py-1.5 text-xs font-medium rounded-xl border transition-all ${
                            idx === activeIndex
                              ? "border-stone-900 dark:border-stone-100 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-md"
                              : "text-stone-600 dark:text-stone-400 hover:border-stone-500 dark:hover:border-stone-400"
                          }`}
                          style={
                            idx !== activeIndex
                              ? {
                                  background: "var(--bg-card)",
                                  borderColor: "var(--border-subtle)",
                                }
                              : undefined
                          }
                        >
                          {btnLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 下载按钮 */}
              <a
                href={`/${activeProfile.rel_path
                  .split("/")
                  .map(encodeURIComponent)
                  .join("/")}`}
                download
                target="_blank"
                rel="noreferrer"
                className="dl-btn flex items-center justify-center gap-2.5 w-full py-3.5 text-sm font-semibold rounded-2xl mb-6"
              >
                <Download className="w-4.5 h-4.5" />
                下载 3MF 工程文件
              </a>

              {/* 元数据 — 创作者 + 切片配置 */}
              <div
                className="flex flex-wrap gap-x-10 gap-y-4 mb-8 pb-8"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                <div>
                  <span
                    className="uppercase text-[10px] font-bold tracking-widest block mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    创作者
                  </span>
                  <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {activeProfile.designer || "匿名/未知"}
                  </p>
                </div>
                <div>
                  <span
                    className="uppercase text-[10px] font-bold tracking-widest block mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    切片参数配置
                  </span>
                  <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {activeProfile.profile_title || "通用默认参数"}
                  </p>
                </div>
              </div>

              {/* 描述 */}
              <div className="max-w-none">
                <h3
                  className="font-serif text-xl mb-4 border-l-4 pl-3"
                  style={{
                    color: "var(--text-primary)",
                    borderColor: "var(--text-primary)",
                  }}
                >
                  模型详细描述
                </h3>
                {activeProfile.description ? (
                  <div
                    className="text-sm whitespace-pre-wrap break-words leading-relaxed font-light"
                    style={{ color: "var(--text-secondary)" }}
                    dangerouslySetInnerHTML={{
                      __html: activeProfile.description,
                    }}
                  />
                ) : (
                  <p
                    className="italic text-sm"
                    style={{ color: "var(--text-muted)" }}
                  >
                    该工程文件未附加任何描述信息。
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// 主画廊组件
// ═══════════════════════════════════════════════════════════════
export default function SearchFilter({ items }: { items: ModelEntry[] }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [openDetailTitle, setOpenDetailTitle] = useState<string | null>(null);
  const isInitialized = useRef(false);

  // ─── 水合：从 URL 恢复状态 ───
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q") || "";
    const detail = params.get("detail") || null;
    setQuery(q);
    setDebouncedQuery(q);
    setOpenDetailTitle(detail);
    isInitialized.current = true;

    // 恢复滚动位置
    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (saved) {
      requestAnimationFrame(() => window.scrollTo(0, parseInt(saved, 10)));
    }
  }, []);

  // ─── 搜索防抖 250ms ───
  useEffect(() => {
    if (!isInitialized.current) return;
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  // ─── 防抖后同步搜索词到 URL ───
  useEffect(() => {
    if (!isInitialized.current) return;
    updateUrlParams({ q: debouncedQuery || null });
  }, [debouncedQuery]);

  // ─── 页面卸载前保存滚动位置 ───
  useEffect(() => {
    const save = () => sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", save);
    return () => {
      window.removeEventListener("beforeunload", save);
      document.removeEventListener("visibilitychange", save);
    };
  }, []);

  // ─── 聚合同名模型 ───
  const groupedItems = useMemo<ModelGroup[]>(() => {
    const groups: Record<string, ModelEntry[]> = {};
    items.forEach((item) => {
      const key = item.title;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return Object.entries(groups).map(([title, profiles]) => ({
      title,
      thumb: profiles.find((p) => p.thumb)?.thumb || null,
      profiles,
    }));
  }, [items]);

  // ─── 过滤（使用防抖值） ───
  const filtered = useMemo(() => {
    if (!debouncedQuery) return groupedItems;
    const q = debouncedQuery.toLowerCase();
    return groupedItems.filter(
      (group) =>
        group.title.toLowerCase().includes(q) ||
        group.profiles.some((p) => p.rel_path.toLowerCase().includes(q))
    );
  }, [groupedItems, debouncedQuery]);

  // ─── 从 URL 参数查找选中的组 ───
  const selectedGroup = useMemo(() => {
    if (!openDetailTitle) return null;
    return groupedItems.find((g) => g.title === openDetailTitle) || null;
  }, [openDetailTitle, groupedItems]);

  // ─── 打开/关闭弹窗（同步 URL） ───
  const openDetail = useCallback((group: ModelGroup) => {
    setOpenDetailTitle(group.title);
    updateUrlParams({ detail: group.title });
  }, []);

  const closeDetail = useCallback(() => {
    setOpenDetailTitle(null);
    updateUrlParams({ detail: null });
  }, []);

  return (
    <>
      {/* 顶部吸顶区域：导航 + 搜索栏合为一体 */}
      <div
        className="sticky top-0 z-30 backdrop-blur-md"
        style={{
          background: "var(--bg-nav)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <header className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
          <a
            href="/"
            className="font-serif text-2xl font-bold tracking-tight flex items-center gap-2 hover:opacity-80 transition-opacity"
            style={{ color: "var(--text-primary)" }}
          >
            <Printer className="w-6 h-6" />
            3MF Gallery.
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <a
              href="/"
              className="transition-colors hover:opacity-70"
              style={{ color: "var(--text-secondary)" }}
            >
              返回首页
            </a>
            <ThemeToggle />
          </nav>
          <div className="flex md:hidden">
            <ThemeToggle />
          </div>
        </header>
        <div className="px-8 pb-4 max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div
              className="text-sm font-medium tracking-wide"
              style={{ color: "var(--text-muted)" }}
            >
              共检索到 {groupedItems.length} 个独立模型 (包含 {items.length}{" "}
              份配置文件)
            </div>
            <div className="relative w-full md:w-96">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                type="text"
                placeholder="输入名称或所在文件夹搜索..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="
                  w-full rounded-full py-3 pl-12 pr-6
                  focus:outline-none focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-300
                  transition-all
                "
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <section
        className="px-6 max-w-7xl mx-auto w-full pb-24 pt-6 relative z-10"
        style={{ color: "var(--text-primary)" }}
      >

        {/* ★ 卡片网格：移除 framer-motion，使用纯 CSS 交互 + 图片 lazy loading */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {filtered.map((group) => (
            <div
              onClick={() => openDetail(group)}
              key={group.title}
              className="
                rounded-2xl overflow-hidden shadow-sm cursor-pointer
                hover:shadow-xl hover:ring-2 hover:ring-stone-900 dark:hover:ring-stone-300
                transition-all duration-200 hover:-translate-y-1
                block group/card relative
              "
              style={{ background: "var(--bg-card)" }}
            >
              {group.profiles.length > 1 && (
                <div className="absolute top-3 left-3 z-10 bg-black/60 backdrop-blur-md text-white text-[10px] uppercase font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                  <Layers className="w-3 h-3" /> {group.profiles.length} 份配置
                </div>
              )}

              <div
                className="h-48 flex items-center justify-center overflow-hidden"
                style={{ background: "var(--bg-muted)" }}
              >
                {group.thumb ? (
                  <img
                    src={assetUrl(group.thumb)}
                    alt={group.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <span
                    className="text-sm"
                    style={{ color: "var(--text-muted)" }}
                  >
                    暂无缩略图
                  </span>
                )}
              </div>
              <div className="p-5">
                <h3
                  className="font-medium text-lg leading-tight mb-2 truncate"
                  style={{ color: "var(--text-primary)" }}
                  title={group.title}
                >
                  {group.title}
                </h3>
                <p
                  className="text-sm truncate"
                  style={{ color: "var(--text-muted)" }}
                  title={`${group.profiles.length} 个本地源文件`}
                >
                  {group.profiles.length === 1
                    ? group.profiles[0].rel_path
                    : `内置 ${group.profiles.length} 种切片参数配置`}
                </p>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div
              className="col-span-full text-center py-20"
              style={{ color: "var(--text-muted)" }}
            >
              抱歉，未找到名称包含 &quot;{query}&quot; 的 3MF 模型。
            </div>
          )}
        </div>
      </section>

      {/* ─── 全局详情弹窗 ─── */}
      <AnimatePresence>
        {selectedGroup && (
          <motion.div
            key="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-12"
          >
            <div
              onClick={closeDetail}
              className="absolute inset-0 bg-black/40 backdrop-blur-[4px] cursor-pointer"
            />
            <motion.div
              initial={{ y: 20, scale: 0.96 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 15, scale: 0.96 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative w-full max-w-5xl h-[90vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col"
              style={{ background: "var(--bg-modal)" }}
            >
              <ModelDetailContent
                group={selectedGroup}
                onClose={closeDetail}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
