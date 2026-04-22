"use client";

import { useEffect, useState } from "react";

export default function HeaderBibleVerse() {
  const [verse, setVerse] = useState<{ text: string; ref: string } | null>(null);

  useEffect(() => {
    fetch("/api/bible-verse")
      .then((r) => r.json())
      .then((data) => { if (data?.text) setVerse(data); })
      .catch(() => {});
  }, []);

  if (!verse) return null;

  return (
    <div className="flex items-center gap-2 max-w-lg text-center">
      <p className="text-sm text-gray-500 leading-snug truncate">
        <span className="text-gray-300 mr-1.5">&ldquo;</span>
        {verse.text}
        <span className="text-gray-300 ml-1.5">&rdquo;</span>
        <span className="ml-2 text-xs text-gray-400 font-semibold whitespace-nowrap">
          {verse.ref}
        </span>
      </p>
    </div>
  );
}
