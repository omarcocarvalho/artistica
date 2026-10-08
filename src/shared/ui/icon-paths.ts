export const PATHS = {
  upload: ['M12 15V4M7 9l5-5 5 5', 'M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4'],
  download: ['M12 4v11M7 10l5 5 5-5', 'M4 20h16'],
  paste: ['M5 4h14v17H5z', 'M9 3h6v3H9z', 'M9 11h6M9 15h4'],
  link: [
    'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1',
    'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  ],
  edit: ['M4 20l4-1 11-11-3-3L5 16z', 'M14 6l3 3'],
  trash: ['M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13'],
  copy: ['M8 8h12v12H8z', 'M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3'],
  lock: ['M5 10h14v10H5z', 'M8 10V7a4 4 0 0 1 8 0v3'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M8.5 12l2.5 2.5 4.5-5'],
  help: [
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17v.3',
  ],
  sun: [
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
  ],
  moon: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'],
  auto: ['M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', 'M12 4a8 8 0 0 1 0 16z'],
  close: ['M6 6l12 12M18 6L6 18'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  plus: ['M12 5v14M5 12h14'],
  info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5M12 8v.3'],
  warning: ['M12 3l10 18H2z', 'M12 10v5M12 18v.3'],
  danger: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M9 9l6 6M15 9l-6 6'],
  rotateLeft: ['M4 12a8 8 0 1 0 3-6.2', 'M4 4v5h5'],
  rotateRight: ['M20 12a8 8 0 1 1-3-6.2', 'M20 4v5h-5'],
  flipH: ['M12 3v18', 'M8 7L3 17h5z', 'M16 7l5 10h-5z'],
  flipV: ['M3 12h18', 'M7 8h10l-5-5z', 'M7 16h10l-5 5z'],
  zoomIn: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-4-4M11 8v6M8 11h6'],
  zoomOut: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-4-4M8 11h6'],
  chevronLeft: ['M15 6l-6 6 6 6'],
  chevronRight: ['M9 6l6 6-6 6'],
} as const satisfies Record<string, readonly string[]>

export type IconName = keyof typeof PATHS
export const ICON_NAMES = Object.keys(PATHS) as IconName[]
