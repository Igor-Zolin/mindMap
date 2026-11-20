const paths = {
  brand: '<path d="M6 12h6m0 0V6h6m-6 6v6h6"/><circle cx="4" cy="12" r="2"/><circle cx="20" cy="6" r="2"/><circle cx="20" cy="18" r="2"/>',
  map: '<rect x="8.5" y="2.5" width="7" height="5" rx="1.2"/><rect x="2.5" y="16.5" width="7" height="5" rx="1.2"/><rect x="14.5" y="16.5" width="7" height="5" rx="1.2"/><path d="M12 7.5v4.5M6 16.5V12h12v4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  undo: '<path d="M9 5 4 10l5 5m-5-5h10a5 5 0 0 1 0 10h-1"/>',
  redo: '<path d="m15 5 5 5-5 5m5-5H10a5 5 0 0 0 0 10h1"/>',
  external: '<path d="M13 5h6v6m0-6-8 8"/><path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  plug: '<path d="m10 13 4-4m-5 7-2 2a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0m2-2 2-2a3 3 0 0 1 4 4l-4 4a3 3 0 0 1-4 0"/>',
  user: '<circle cx="12" cy="8" r="3"/><path d="M5.5 20v-2a4 4 0 0 1 4-4h5a4 4 0 0 1 4 4v2"/>',
  login: '<path d="M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5M4 12h10m-4-4 4 4-4 4"/>',
  logout: '<path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5m9-8H10m6-4 4 4-4 4"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
  upload: '<path d="M12 15V3m-4 4 4-4 4 4M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.5"/>',
  edit: '<path d="m14 6 4 4M5 19l1-5L16 4a1.4 1.4 0 0 1 2 0l2 2a1.4 1.4 0 0 1 0 2L10 18l-5 1Z"/>',
  text: '<path d="M4 6V4h16v2M12 4v16m-4 0h8"/>',
  move: '<path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3"/>',
  trackpad: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M9 15h6"/>',
  moon: '<path d="M20.5 14.1A8.8 8.8 0 0 1 9.9 3.5 8.8 8.8 0 1 0 20.5 14.1Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  sliders: '<path d="M4 7h7m4 0h5M4 17h3m4 0h9"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  fit: '<path d="M9 4H5a1 1 0 0 0-1 1v4m11-5h4a1 1 0 0 1 1 1v4M4 15v4a1 1 0 0 0 1 1h4m11-5v4a1 1 0 0 1-1 1h-4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  note: '<path d="M6 3h9l4 4v14H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 0v5h5M8 12h8m-8 4h6"/>'
};

export const icon = name => '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[name] + '</svg>';

export function applyIcons(parent = document) {
  for (const element of parent.querySelectorAll('[data-icon]')) element.innerHTML = icon(element.dataset.icon);
}
