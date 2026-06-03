"use client";

import Link from "next/link";
import { useRef } from "react";

export interface CategoryChipRailItem {
  category: string;
}

export function CategoryChipRail({
  categories,
  selectedCategory,
}: {
  categories: CategoryChipRailItem[];
  selectedCategory?: string;
}) {
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const items = [
    { key: "__all__", label: "All", href: "/listings", selected: !selectedCategory },
    ...categories.map((c) => ({
      key: c.category,
      label: c.category,
      href: `/listings?category=${encodeURIComponent(c.category)}`,
      selected: selectedCategory === c.category,
    })),
  ];

  const moveFocus = (index: number, key: string) => {
    let next = index;
    if (key === "ArrowRight") next = (index + 1) % items.length;
    if (key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    if (key === "Home") next = 0;
    if (key === "End") next = items.length - 1;
    refs.current[next]?.focus();
  };

  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1" role="tablist" aria-label="Filter listings by category">
      {items.map((item, index) => (
        <Link
          key={item.key}
          href={item.href}
          ref={(el) => {
            refs.current[index] = el;
          }}
          role="tab"
          aria-selected={item.selected}
          aria-current={item.selected ? "page" : undefined}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "Home" || e.key === "End") {
              e.preventDefault();
              moveFocus(index, e.key);
            }
          }}
          className={`ss-chip whitespace-nowrap ${item.selected ? "border-indigo-400 bg-indigo-500/20 text-white" : ""}`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
