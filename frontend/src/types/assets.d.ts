/**
 * Типы для импортов медиа-активов в TS.
 *
 * Зачем это нужно:
 * - В современном фронтенде (Vite/webpack/Rspack/Next) импорты картинок и SVG — обычные строки-URL,
 *   а SVG часто ещё и как React-компоненты через SVGR. Без этих деклараций TypeScript «не знает»,
 *   что такое `import logo from './logo.svg'`, и ругнётся.
*/

// Общий тип пропсов для SVG-компонента (подходит для большинства UI-кейсов).
import type * as React from "react";
type SvgProps = React.SVGProps<SVGSVGElement> & { title?: string };

/* =========================
 * SVG: URL + React Component
 * ========================= */

// Классический случай: и URL, и компонент доступны из одного импорта.
declare module "*.svg" {
  export const ReactComponent: React.FC<SvgProps>;
  const src: string;
  export default src;
}

// Варианты c query-параметрами SVGR (встречаются в готовых шаблонах/конфигах).
declare module "*.svg?react" {
  const Component: React.FC<SvgProps>;
  export default Component;
}
declare module "*.svg?component" {
  const Component: React.FC<SvgProps>;
  export default Component;
}

/* =========================
 * Растровая графика: URL
 * ========================= */

declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.jpg" {
  const src: string;
  export default src;
}

declare module "*.jpeg" {
  const src: string;
  export default src;
}

declare module "*.webp" {
  const src: string;
  export default src;
}

declare module "*.avif" {
  const src: string;
  export default src;
}

declare module "*.gif" {
  const src: string;
  export default src;
}

declare module "*.bmp" {
  const src: string;
  export default src;
}

declare module "*.ico" {
  const src: string;
  export default src;
}
