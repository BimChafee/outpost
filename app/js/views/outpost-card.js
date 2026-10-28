// Home's outpost card: level, gold and how many quests are ready.
import { html, useMemo } from '../ui.js';
import { treasury, choreState } from '../outpost-model.js';
import { TreasuryPlate } from './quests.js';

export function OutpostCard({ quests = [], questlog = [] }) {
  const t = useMemo(() => treasury(questlog), [questlog]);
  const ready = quests.filter((q) => q.kind !== 'goal' && choreState(q).ready).length;
  const goals = quests.filter((q) => q.kind === 'goal' && !q.done).length;
  return html`<section class="block" aria-labelledby="op-h">
    <div class="block-head"><h2 id="op-h" class="block-title">The outpost</h2><a href="#shop">Shop</a></div>
    <a class="op-card" href="#quests">
      <${TreasuryPlate} t=${t} compact />
      <span class="op-ready">${ready ? `${ready} quest${ready === 1 ? '' : 's'} ready` : 'No quests ready'}${goals ? `, ${goals} goal${goals === 1 ? '' : 's'} in progress` : ''}</span>
    </a>
  </section>`;
}
