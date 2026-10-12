"use client";

import { useCallback } from "react";

/** Brand panel visual with graceful degradation: if the image asset is ever
 *  missing (fresh clone, old deploy), the emerald gradient underneath shows
 *  instead of a broken panel / 404'd blank. */
export function AuthVisual() {
  const hide = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    (e.target as HTMLImageElement).style.visibility = "hidden";
  }, []);

  return (
    <img
      src="/images/auth-visual.jpg"
      alt=""
      loading="eager"
      className="absolute inset-0 h-full w-full object-cover opacity-60"
      onError={hide}
    />
  );
}
