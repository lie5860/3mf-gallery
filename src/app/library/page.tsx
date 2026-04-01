import React from "react";
import SearchFilter from "@/components/SearchFilter";
import type { ModelEntry } from "@/components/SearchFilter";
import { getEntries } from "@/lib/manifest";

export const dynamic = 'force-static';

/**
 * 精简数据：剥离客户端不需要的重字段，大幅缩减 RSC Flight 载荷
 * - meta（4.14MB）：构建缓存用的内部字段，前端完全不显示
 * - abs_path / file_name / profile_description：前端接口无此字段
 */
function slimEntries(raw: Awaited<ReturnType<typeof getEntries>>): ModelEntry[] {
  return raw.map((e) => ({
    id: e.id,
    rel_path: e.rel_path,
    title: e.title,
    description: e.description,
    designer: e.designer,
    license: e.license,
    creation_date: e.creation_date,
    profile_title: e.profile_title,
    thumb: e.thumb,
    pictures: e.pictures,
  }));
}

export default async function LibraryPage() {
  const entries = await getEntries();
  const slim = slimEntries(entries);
  
  return (
    <main
      className="min-h-screen font-sans"
      style={{
        background: "var(--bg-page)",
        color: "var(--text-primary)",
      }}
    >
      <SearchFilter items={slim} />
    </main>
  );
}
