// Shared frame for the full-screen overlays (technology tree, civics tree,
// almanac, economy ledger): a chrome header with title, optional tabs/tools and
// a close button, over a body the overlay fills as it likes.
import type { ComponentChildren } from 'preact';
import { Icon } from '../icons';
import { closeOverlay } from '../store';
import { t } from '../i18n';
import { cx } from '../ui';

export function OverlayFrame({ icon, title, kicker, tabs, tools, children, testid, class: cls }: {
  icon: string; title: string; kicker?: string; tabs?: ComponentChildren; tools?: ComponentChildren;
  children?: ComponentChildren; testid?: string; class?: string;
}) {
  return (
    <section class={cx('fs-overlay', cls)} role="dialog" aria-label={title} data-testid={testid}>
      <header class="fs-head">
        <span class="fs-crest" aria-hidden="true"><Icon name={icon} size={20} /></span>
        <div class="fs-title">
          {kicker ? <span class="fs-kicker">{kicker}</span> : null}
          <h2>{title}</h2>
        </div>
        {tabs ? <div class="fs-tabs">{tabs}</div> : null}
        <div class="fs-tools">{tools}</div>
        <button type="button" class="fs-close" aria-label={t('Close (Esc)')} title={t('Close (Esc)')} data-testid="overlay-close" onClick={closeOverlay}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <div class="fs-body">{children}</div>
    </section>
  );
}

/** A designed empty / loading / error state. */
export function StatePlate({ icon, title, children, tone }: { icon: string; title: string; children?: ComponentChildren; tone?: 'bad' | 'muted' }) {
  return (
    <div class={cx('state-plate', tone && 'is-' + tone)}>
      <span class="state-icon" aria-hidden="true"><Icon name={icon} size={26} /></span>
      <b>{title}</b>
      {children ? <div class="state-text">{children}</div> : null}
    </div>
  );
}
