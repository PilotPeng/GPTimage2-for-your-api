export const getRoutePath = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (typeof window === "undefined") {
    return normalizedPath;
  }

  return window.location.pathname === "/sealed" || window.location.pathname.startsWith("/sealed/")
    ? `/sealed${normalizedPath === "/" ? "" : normalizedPath}`
    : normalizedPath;
};
