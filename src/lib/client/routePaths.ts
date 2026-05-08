const routedPrefixes = ["/sealed", "/fengzhuang"] as const;

export const getCurrentRoutePrefix = () => {
  if (typeof window === "undefined") {
    return "";
  }

  return routedPrefixes.find((prefix) => window.location.pathname === prefix || window.location.pathname.startsWith(`${prefix}/`)) ?? "";
};

export const getRoutePath = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const prefix = getCurrentRoutePrefix();

  return prefix ? `${prefix}${normalizedPath === "/" ? "" : normalizedPath}` : normalizedPath;
};
