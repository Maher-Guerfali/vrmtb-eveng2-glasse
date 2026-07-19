// The ONLY file that imports @evenrealities/even_hub_sdk (v0.0.12, pinned).
// The SDK is young and churning - keeping every SDK symbol here means an SDK
// bump is a one-file change, same policy as DashboardBridge (Vuplex) and
// VoiceManager (LiveKit) in vrmtb-unity.

import {
  AudioInputSource,
  CreateStartUpPageContainer,
  EvenAppBridge,
  EventSourceType,
  OsEventTypeList,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  waitForEvenAppBridge,
  type DeviceStatus,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk';

import type {
  GlassBridge,
  GlassInputEvent,
  HudPage,
  InputSource,
  WearState,
} from './types';

function toInputSource(src: EventSourceType | undefined): InputSource {
  switch (src) {
    case EventSourceType.TOUCH_EVENT_FROM_GLASSES_R: return 'glassesRight';
    case EventSourceType.TOUCH_EVENT_FROM_GLASSES_L: return 'glassesLeft';
    case EventSourceType.TOUCH_EVENT_FROM_RING: return 'ring';
    default: return 'unknown';
  }
}

class EvenGlassBridge implements GlassBridge {
  readonly kind = 'even' as const;

  private inputCbs = new Set<(ev: GlassInputEvent) => void>();
  private wearCbs = new Set<(s: WearState) => void>();
  private audioCbs = new Set<(chunk: Uint8Array) => void>();

  constructor(private bridge: EvenAppBridge) {
    bridge.onEvenHubEvent((event: EvenHubEvent) => this.dispatch(event));
    bridge.onDeviceStatusChanged((status: DeviceStatus) => {
      const s: WearState = {
        connected: status.isConnected(),
        wearing: status.isWearing === true,
        inCase: status.isInCase === true,
        batteryLevel: status.batteryLevel,
      };
      this.wearCbs.forEach((cb) => cb(s));
    });
  }

  private dispatch(event: EvenHubEvent): void {
    if (event.audioEvent?.audioPcm) {
      this.audioCbs.forEach((cb) => cb(event.audioEvent!.audioPcm));
      return;
    }
    // Touch/system events arrive as sysEvent; list/text item events also carry
    // an eventType but v1 renders text-only pages, so sysEvent is the router.
    const sys = event.sysEvent;
    if (!sys) return;
    const source = toInputSource(sys.eventSource);
    let ev: GlassInputEvent | null = null;
    switch (sys.eventType) {
      case OsEventTypeList.CLICK_EVENT: ev = { kind: 'tap', source }; break;
      case OsEventTypeList.DOUBLE_CLICK_EVENT: ev = { kind: 'doubleTap', source }; break;
      // Scroll direction naming follows the OS ("top"/"bottom"); we translate
      // to deck semantics here so cards never think in scroll directions.
      case OsEventTypeList.SCROLL_BOTTOM_EVENT: ev = { kind: 'swipeForward', source }; break;
      case OsEventTypeList.SCROLL_TOP_EVENT: ev = { kind: 'swipeBack', source }; break;
      case OsEventTypeList.FOREGROUND_ENTER_EVENT: ev = { kind: 'foreground', entered: true }; break;
      case OsEventTypeList.FOREGROUND_EXIT_EVENT: ev = { kind: 'foreground', entered: false }; break;
      case OsEventTypeList.SYSTEM_EXIT_EVENT:
      case OsEventTypeList.ABNORMAL_EXIT_EVENT:
        ev = { kind: 'exit' };
        break;
      default: return; // IMU_DATA_REPORT etc. - unused in v1
    }
    this.inputCbs.forEach((cb) => cb(ev!));
  }

  private toTextContainers(page: HudPage): TextContainerProperty[] {
    return page.texts.map(
      (t) =>
        new TextContainerProperty({
          containerID: t.id,
          containerName: t.name,
          xPosition: t.x,
          yPosition: t.y,
          width: t.w,
          height: t.h,
          content: t.content,
          isEventCapture: 0,
          zOrderIndex: t.id,
        }),
    );
  }

  async renderPage(page: HudPage, fresh: boolean): Promise<void> {
    const texts = this.toTextContainers(page);
    if (fresh) {
      const result = await this.bridge.createStartUpPageContainer(
        new CreateStartUpPageContainer({ containerTotalNum: texts.length, textObject: texts }),
      );
      console.info('[evenBridge] createStartUpPageContainer ->', result);
    } else {
      await this.bridge.rebuildPageContainer(
        new RebuildPageContainer({ containerTotalNum: texts.length, textObject: texts }),
      );
    }
  }

  async updateText(id: number, name: string, content: string): Promise<void> {
    await this.bridge.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: id, containerName: name, content }),
    );
  }

  onInput(cb: (ev: GlassInputEvent) => void): () => void {
    this.inputCbs.add(cb);
    return () => this.inputCbs.delete(cb);
  }

  onWearState(cb: (s: WearState) => void): () => void {
    this.wearCbs.add(cb);
    return () => this.wearCbs.delete(cb);
  }

  onAudioPcm(cb: (chunk: Uint8Array) => void): () => void {
    this.audioCbs.add(cb);
    return () => this.audioCbs.delete(cb);
  }

  async setMic(open: boolean, source: 'glasses' | 'phone'): Promise<boolean> {
    return this.bridge.audioControl(
      open,
      source === 'glasses' ? AudioInputSource.Glasses : AudioInputSource.Phone,
    );
  }

  async shutdown(): Promise<void> {
    await this.bridge.shutDownPageContainer(0);
  }
}

/**
 * True only inside the Even App's WebView. The SDK bridge singleton reports
 * "ready" in ANY browser (it is just a JS object - readiness does not imply a
 * device), so detection must look for the flutter_inappwebview native handler
 * the SDK posts messages through.
 */
export function isEvenHost(): boolean {
  const w = window as unknown as Record<string, { callHandler?: unknown } | undefined>;
  return typeof w.flutter_inappwebview?.callHandler === 'function';
}

/**
 * Resolve the real Even App bridge, or null when not running inside the Even
 * App (browser dev -> caller falls back to the DOM mock).
 */
export async function connectEvenBridge(timeoutMs = 8000): Promise<GlassBridge | null> {
  if (!isEvenHost()) return null;
  const bridge = await Promise.race<EvenAppBridge | null>([
    waitForEvenAppBridge(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
  return bridge ? new EvenGlassBridge(bridge) : null;
}
