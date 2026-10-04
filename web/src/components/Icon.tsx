const paths: Record<string, string> = {
  estimate: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  history: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4M12 8v4l3 2',
  printer: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L15 3h-4l-.3 2.6a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1L11 21h4l.3-2.6a7 7 0 0 0 1.7-1l2.4 1 2-3.4z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M6 9l6 6 6-6',
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  rates: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  products: 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8',
  gem: 'M6 4h12l4 6-10 11L2 10zM2 10h20M9 4l-2 6 5 11 5-11-2-6',
  stock: 'M3 9l9-5 9 5v10l-9 5-9-5zM3 9l9 5 9-5M7.5 6.5l9 5M12 14v10',
  gallery: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M8.5 9.5v.01',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  heart: 'M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10z',
  cart: 'M3 4h2.5l2.2 10.5h9.6L19.5 8H6.2M9.5 19.5v.01M16.5 19.5v.01',
  ring: 'M12 9l2.2-3.2L12 3 9.8 5.8zM12 21a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z',
  earrings: 'M8 3v4M16 3v4M8 7c-2.2 2.8-2.2 6 0 8 2.200-2 2.200-5.200 0-8zM16 7c-2.200 2.800-2.200 6 0 8 2.200-2 2.200-5.200 0-8z',
  necklace: 'M5 4c0 9 3 13 7 13s7-4 7-13M12 17v3M10.500 20h3',
  bracelet: 'M12 6c4.500 0 8 2.500 8 6s-3.500 6-8 6-8-2.500-8-6 3.500-6 8-6zM12 8c3 0 5.500 1.800 5.500 4S15 16 12 16 6.500 14.200 6.500 12 9 8 12 8z',
  pendant: 'M12 3v5M12 8c-3 3-3 6 0 10 3-4 3-7 0-10z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  cash: 'M3 7h18v10H3zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 10v.01M18 14v.01',
  search: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  zoomin: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5M10.5 7.5v6M7.5 10.5h6',
  zoomout: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5M7.5 10.5h6',
  draft: 'M5 20h4l10-10-4-4L5 16zM13 7l4 4',
};

export function Icon({ name, size = 20, fill = 'none' }: { name: keyof typeof paths | string; size?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? ''} />
    </svg>
  );
}
