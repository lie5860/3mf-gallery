"use client";

import React from "react";
import Link from "next/link";
import { motion, Variants } from "framer-motion";
import { Box, Layers, Printer, Search } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

// --- 动画变量定义 ---
const heroTitleVariants: Variants = {
  hidden: { y: 50, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.8, ease: "easeOut" } },
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.2 } },
};

const cardVariants: Variants = {
  hidden: { y: 40, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.6, ease: "easeOut" } },
};

export default function LandingUI() {
  return (
    <main
      className="font-sans selection:bg-blue-300 selection:text-black dark:selection:bg-blue-700 dark:selection:text-white"
      style={{ background: "var(--bg-page)", color: "var(--text-primary)" }}
    >

      {/* --- 顶部：极简导航栏 --- */}
      <header className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <div className="font-serif text-2xl font-bold tracking-tight flex items-center gap-2">
          <Printer className="w-6 h-6" />
          3MF Gallery.
        </div>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link
            href="/library"
            className="transition-colors"
            style={{ color: "var(--text-secondary)" }}
          >
            浏览模型
          </Link>
          <ThemeToggle />
        </nav>
        {/* 移动端仅显示切换按钮 */}
        <div className="flex md:hidden">
          <ThemeToggle />
        </div>
      </header>

      {/* --- 第一屏 (Hero) --- */}
      <section className="pt-24 pb-20 px-4 flex flex-col items-center text-center max-w-4xl mx-auto">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
        >
          <div className="overflow-hidden pb-2">
            <motion.h1
              variants={heroTitleVariants}
              className="font-serif text-5xl md:text-7xl tracking-tight leading-[1.1]"
            >
              深度解析 3MF
            </motion.h1>
          </div>
          <div className="overflow-hidden mt-2 pb-2">
            <motion.h1
              variants={heroTitleVariants}
              className="font-serif text-5xl md:text-7xl tracking-tight leading-[1.1]"
            >
              本地典藏室{" "}
              <span
                className="italic"
                style={{ color: "var(--text-secondary)" }}
              >
                Archive
              </span>
              .
            </motion.h1>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="mt-8 text-lg md:text-xl max-w-2xl font-light"
          style={{ color: "var(--text-secondary)" }}
        >
          极致极速、完全本地托管的 3MF 模型画廊系统。让您海量的本地 3D 模型库随时保持井然有序。
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="mt-12 flex items-center justify-center gap-4"
        >
          <Link
            href="/library"
            className="
              px-8 py-4 rounded-full font-medium transition-all group flex items-center gap-2 shadow-xl
              bg-stone-900 text-stone-50 hover:bg-stone-700
              dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white
            "
          >
            <Search className="w-5 h-5 opacity-70" />
            检索藏品空间
          </Link>
        </motion.div>
      </section>

      {/* --- 第二屏：功能 Bento 卡片 (浓缩) --- */}
      <section
        id="features"
        className="py-16 px-6 max-w-7xl mx-auto mb-8"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {/* 卡片 1 — 亮色 muted */}
          <motion.div
            variants={cardVariants}
            className="rounded-3xl p-8 flex flex-col h-full hover:-translate-y-1 transition-transform duration-500"
            style={{ background: "var(--bg-muted)" }}
          >
            <h3
              className="font-serif text-2xl font-semibold mb-3 flex items-center gap-2"
              style={{ color: "var(--text-primary)" }}
            >
              <Layers className="w-6 h-6" style={{ color: "var(--text-muted)" }} />
              无感极速加载
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              告别 loading。底层基于 Next.js 强大的 SSG 机制渲染构建，即便库中囊括数千余个工业级 3MF 原件，缩略图图解也能做到秒开就绪。
            </p>
          </motion.div>

          {/* 卡片 2 — 深色强调 */}
          <motion.div
            variants={cardVariants}
            className="rounded-3xl p-8 flex flex-col h-full hover:-translate-y-1 transition-transform duration-500 bg-zinc-900 dark:bg-blue-950 text-stone-100"
          >
            <h3 className="font-serif text-2xl font-semibold mb-3 flex items-center gap-2">
              <Box className="text-blue-300 w-6 h-6" /> 流式免解压抽取
            </h3>
            <p className="text-gray-400 dark:text-blue-200/60 text-sm leading-relaxed">
              核心算法告别解压全文件痛点，直接在海量 Zip 的底层流结构中实时抽取 <code>3D/3dmodel.model</code> 参数配置与内部高分辨率贴图。
            </p>
          </motion.div>

          {/* 卡片 3 — 亮色 muted */}
          <motion.div
            variants={cardVariants}
            className="rounded-3xl p-8 flex flex-col h-full hover:-translate-y-1 transition-transform duration-500 md:col-span-2 lg:col-span-1"
            style={{ background: "var(--bg-muted)" }}
          >
            <h3
              className="font-serif text-2xl font-semibold mb-3 flex items-center gap-2"
              style={{ color: "var(--text-primary)" }}
            >
              <Printer className="w-6 h-6" style={{ color: "var(--text-muted)" }} />
              私域离线伺服
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              绝对独立，零云端束缚。您的极空间、群晖 NAS 以及本地任意的基于 Nginx 的静态文件服务器，均可完美承载这款超世代画廊。
            </p>
          </motion.div>
        </motion.div>
      </section>

    </main>
  );
}
