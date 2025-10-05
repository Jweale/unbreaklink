type PointerPosition = {
  x: number;
  y: number;
};

type RectSnapshot = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

const cloneRect = (rect: DOMRect): RectSnapshot => ({
  top: rect.top,
  right: rect.right,
  bottom: rect.bottom,
  left: rect.left,
  width: rect.width,
  height: rect.height
});

const clonePointer = (pointer: PointerPosition | null): PointerPosition | null =>
  pointer ? { x: pointer.x, y: pointer.y } : null;

const STYLE_CONTENT = `
  :host {
    color: inherit;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  .tooltip-card {
    pointer-events: none;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    line-height: 1.35;
    background: rgba(17, 24, 39, 0.95);
    color: #f9fafb;
    border-radius: 8px;
    padding: 8px 12px;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.28);
    border: 1px solid rgba(148, 163, 184, 0.25);
    max-width: min(480px, calc(100vw - 32px));
    display: flex;
    flex-direction: column;
    gap: 2px;
    backdrop-filter: blur(8px);
  }

  .tooltip-card[data-visible="false"] {
    visibility: hidden;
  }

  .tooltip-label {
    word-break: break-word;
    white-space: normal;
  }
`;

export class DestinationPreviewTooltip {
  private host: HTMLDivElement;

  private root: ShadowRoot;

  private card: HTMLDivElement;

  private label: HTMLSpanElement;

  private visible = false;

  private lastRect: RectSnapshot | null = null;

  private lastPointer: PointerPosition | null = null;

  constructor() {
    this.host = document.createElement('div');
    this.host.setAttribute('data-unbreaklink-role', 'tooltip');
    this.host.style.position = 'fixed';
    this.host.style.inset = '0 auto auto 0';
    this.host.style.pointerEvents = 'none';
    this.host.style.zIndex = '2147483646';
    this.host.style.opacity = '0';
    this.host.style.transition = 'opacity 120ms ease';
    this.host.style.display = 'none';

    this.root = this.host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = STYLE_CONTENT;

    this.card = document.createElement('div');
    this.card.className = 'tooltip-card';
    this.card.dataset.visible = 'false';
    this.card.setAttribute('role', 'status');
    this.card.setAttribute('aria-live', 'polite');
    this.card.setAttribute('aria-hidden', 'true');

    this.label = document.createElement('span');
    this.label.className = 'tooltip-label';
    this.card.append(this.label);

    this.root.append(style, this.card);

    this.host.addEventListener('transitionend', () => {
      if (!this.visible) {
        this.host.style.display = 'none';
        this.card.dataset.visible = 'false';
        this.card.setAttribute('aria-hidden', 'true');
      }
    });

    const hostParent = document.body ?? document.documentElement;
    hostParent.append(this.host);
  }

  isVisible(): boolean {
    return this.visible;
  }

  show(text: string, rect: DOMRect, pointer: PointerPosition | null): void {
    this.label.textContent = text;
    this.lastRect = cloneRect(rect);
    this.lastPointer = clonePointer(pointer);

    this.visible = true;
    this.card.dataset.visible = 'true';
    this.card.setAttribute('aria-hidden', 'false');

    this.host.style.display = 'block';
    this.host.style.opacity = '0';

    requestAnimationFrame(() => {
      if (!this.visible) {
        return;
      }
      this.updatePosition();
      this.host.style.opacity = '1';
    });
  }

  hide(): void {
    if (!this.visible) {
      return;
    }

    this.visible = false;
    this.lastRect = null;
    this.lastPointer = null;
    this.host.style.opacity = '0';
  }

  updatePointer(pointer: PointerPosition): void {
    if (!this.visible) {
      return;
    }
    this.lastPointer = clonePointer(pointer);
    this.updatePosition();
  }

  updateRect(rect: DOMRect): void {
    if (!this.visible) {
      return;
    }
    this.lastRect = cloneRect(rect);
    this.updatePosition();
  }

  private updatePosition(): void {
    if (!this.lastRect) {
      return;
    }

    const { innerWidth, innerHeight } = window;
    const bounds = {
      width: this.card.offsetWidth,
      height: this.card.offsetHeight
    };
    const margin = 12;

    let left: number;
    let top: number;

    if (this.lastPointer) {
      left = this.lastPointer.x + margin;
      top = this.lastPointer.y + margin;

      if (left + bounds.width > innerWidth - margin) {
        left = Math.max(margin, innerWidth - bounds.width - margin);
      }
      if (top + bounds.height > innerHeight - margin) {
        top = Math.max(margin, this.lastPointer.y - bounds.height - margin);
      }
    } else {
      left = this.lastRect.left + this.lastRect.width / 2 - bounds.width / 2;
      top = this.lastRect.bottom + margin;

      if (left < margin) {
        left = margin;
      }
      if (left + bounds.width > innerWidth - margin) {
        left = Math.max(margin, innerWidth - bounds.width - margin);
      }
      if (top + bounds.height > innerHeight - margin) {
        top = Math.max(margin, this.lastRect.top - bounds.height - margin);
      }
    }

    this.host.style.left = `${Math.round(left)}px`;
    this.host.style.top = `${Math.round(top)}px`;
  }
}
