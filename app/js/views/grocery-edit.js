// Grocery item editor, category/store manager and colour picker.
import { html, useState, Icon, Sheet, Chip, toast } from '../ui.js';
import { TAG_COLORS, bumpQty, nextSortOrder, statusOf, statusPatch } from '../grocery-model.js';

export const KIND_LABEL = { category: ['Category', 'Categories'], store: ['Store', 'Stores'] };

export function ColorPicker({ value, onChange }) {
  return html`<div class="swatches" role="radiogroup" aria-label="Colour">
    ${TAG_COLORS.map((c) => html`<button type="button" role="radio" aria-checked=${String(value === c)} aria-label=${c}
      class=${`swatch ${value === c ? 'on' : ''}`} style=${{ '--c': c }} onClick=${() => onChange(c)}></button>`)}
  </div>`;
}

export const TagChip = ({ tag, on, onClick, small }) => html`
  <button type="button" class=${`tag ${small ? 'tag-sm' : ''} ${on ? 'on' : ''}`} style=${{ '--c': tag.color }}
          onClick=${onClick} disabled=${!onClick} aria-pressed=${on === undefined ? undefined : String(!!on)}>
    <i aria-hidden="true"></i>${tag.name}
  </button>`;

/** Create a category or store; resolves to its id. */
export function NewTagSheet({ st, hid, kind, count, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(TAG_COLORS[(count * 5) % TAG_COLORS.length]);
  const create = async () => {
    if (!name.trim()) return toast(`Name the ${KIND_LABEL[kind][0].toLowerCase()}`);
    try {
      const id = await st.add(hid, 'tags', { kind, name: name.trim(), color });
      onCreated?.(id);
      onClose();
    } catch (e) { toast(`Couldn't create it: ${e.message}`); }
  };
  return html`<${Sheet} title=${`New ${KIND_LABEL[kind][0].toLowerCase()}`} onClose=${onClose}
    actions=${html`<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" onClick=${create}>Create</button>`}>
    <label class="field"><span>Name</span><input value=${name} onInput=${(e) => setName(e.target.value)}
      placeholder=${kind === 'store' ? 'No Frills, Costco' : 'Produce, Dairy, Cleaning'} autofocus /></label>
    <div class="field"><span>Colour</span><${ColorPicker} value=${color} onChange=${setColor} /></div>
  <//>`;
}

/** Rename, recolour or delete categories and stores. Deleting removes the tag from every item. */
export function TagManager({ st, hid, tags, groceries, onClose }) {
  const [adding, setAdding] = useState(null);
  const [editing, setEditing] = useState(null);
  const remove = async (t) => {
    const used = groceries.filter((g) => (g.categoryIds || []).includes(t.id) || (g.storeIds || []).includes(t.id));
    if (!confirm(`Delete ${t.name}?${used.length ? ` ${used.length} item${used.length === 1 ? '' : 's'} will lose it.` : ''}`)) return;
    try {
      await st.remove(hid, 'tags', t.id);
      for (const g of used) {
        await st.update(hid, 'groceries', g.id, {
          categoryIds: (g.categoryIds || []).filter((x) => x !== t.id),
          storeIds: (g.storeIds || []).filter((x) => x !== t.id),
        });
      }
      toast(`Deleted ${t.name}`);
    } catch (e) { toast(`Couldn't delete it: ${e.message}`); }
  };
  return html`<${Sheet} title="Categories and stores" onClose=${onClose}>
    ${['category', 'store'].map((kind) => {
      const list = tags.filter((t) => t.kind === kind);
      return html`<section class="tagman">
        <div class="block-head"><h3>${KIND_LABEL[kind][1]}</h3>
          <button class="btn small" onClick=${() => setAdding(kind)}><${Icon} name="plus" size=${18} /> New</button></div>
        ${list.length === 0 ? html`<p class="hint">None yet.</p>` : html`<ul class="rows">
          ${list.map((t) => html`<li class="row">
            <button class="tag-edit" onClick=${() => setEditing(t)} style=${{ '--c': t.color }}><i aria-hidden="true"></i>${t.name}</button>
            <button class="icon-btn subtle" aria-label=${`Edit ${t.name}`} onClick=${() => setEditing(t)}><${Icon} name="edit" size=${18} /></button>
            <button class="icon-btn subtle" aria-label=${`Delete ${t.name}`} onClick=${() => remove(t)}><${Icon} name="trash" size=${18} /></button>
          </li>`)}
        </ul>`}
      </section>`;
    })}
    ${adding && html`<${NewTagSheet} st=${st} hid=${hid} kind=${adding} count=${tags.length} onClose=${() => setAdding(null)} />`}
    ${editing && html`<${EditTagSheet} st=${st} hid=${hid} tag=${editing} onClose=${() => setEditing(null)} />`}
  <//>`;
}

function EditTagSheet({ st, hid, tag, onClose }) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const save = async () => {
    if (!name.trim()) return toast('Give it a name');
    try { await st.update(hid, 'tags', tag.id, { name: name.trim(), color }); onClose(); }
    catch (e) { toast(`Couldn't save it: ${e.message}`); }
  };
  return html`<${Sheet} title=${`Edit ${tag.name}`} onClose=${onClose}
    actions=${html`<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" onClick=${save}>Save</button>`}>
    <label class="field"><span>Name</span><input value=${name} onInput=${(e) => setName(e.target.value)} /></label>
    <div class="field"><span>Colour</span><${ColorPicker} value=${color} onChange=${setColor} /></div>
  <//>`;
}

/** Ask what to do when the name is already on the list. Resolves 'bump' | 'add' | null. */
export function DuplicateSheet({ name, existing, onChoose }) {
  return html`<${Sheet} title=${`${name} is already on the list`} onClose=${() => onChoose(null)}
    actions=${html`<button class="btn" onClick=${() => onChoose('add')}>Add anyway</button>
      <button class="btn primary" onClick=${() => onChoose('bump')}>Bump the quantity</button>`}>
    <p class="lede">${existing.qty ? `It's there with quantity ${existing.qty}.` : 'It\'s there with no quantity.'} Bump the quantity on that one, or add a second entry?</p>
  <//>`;
}

/** Add or edit one item: name, quantity, notes, categories, stores, who it's for, notify. */
export function ItemEditor({ st, hid, me, members, tags, groceries, item, initialName, onClose }) {
  const isEdit = !!item?.id;
  const [f, setF] = useState(() => ({
    name: item?.name ?? initialName ?? '', qty: item?.qty ?? '', notes: item?.notes ?? '',
    categoryIds: item?.categoryIds ?? [], storeIds: item?.storeIds ?? [], forIds: item?.forIds ?? [],
    notify: item?.notify ?? false, toLater: false,
  }));
  const [newKind, setNewKind] = useState(null);
  const [dupe, setDupe] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const toggle = (field, id) => set({ [field]: f[field].includes(id) ? f[field].filter((x) => x !== id) : [...f[field], id] });

  const fields = () => ({
    name: f.name.trim(), qty: f.qty.trim(), notes: f.notes.trim(),
    categoryIds: f.categoryIds, storeIds: f.storeIds, forIds: f.forIds, notify: f.notify,
  });

  const save = async (force) => {
    const name = f.name.trim();
    if (!name) return toast('Give it a name first');
    setSaving(true);
    try {
      if (isEdit) {
        await st.update(hid, 'groceries', item.id, fields());
        toast('Item saved');
        return onClose();
      }
      const existing = groceries.find((g) => statusOf(g) === 'active' && g.name.trim().toLowerCase() === name.toLowerCase());
      if (existing && !force) { setSaving(false); return setDupe(existing); }
      await st.add(hid, 'groceries', {
        ...fields(), addedBy: me, sortOrder: nextSortOrder(groceries),
        ...statusPatch(f.toLater ? 'later' : 'active', me),
      });
      toast(f.toLater ? `${name} added to Ready to add back` : `${name} added`);
      onClose();
    } catch (e) { toast(`Couldn't save: ${e.message}`); setSaving(false); }
  };

  const onDupe = async (choice) => {
    const existing = dupe;
    setDupe(null);
    if (choice === 'bump') {
      try { await st.update(hid, 'groceries', existing.id, { qty: bumpQty(existing.qty, f.qty) }); toast(`${existing.name}: quantity bumped`); onClose(); }
      catch (e) { toast(`Couldn't update it: ${e.message}`); }
    } else if (choice === 'add') save(true);
  };

  const tagRow = (kind, field) => {
    const list = tags.filter((t) => t.kind === kind);
    return html`<fieldset><legend>${KIND_LABEL[kind][1]}</legend>
      <div class="chip-row">
        ${list.map((t) => html`<${TagChip} tag=${t} on=${f[field].includes(t.id)} onClick=${() => toggle(field, t.id)} />`)}
        <button type="button" class="tag tag-new" onClick=${() => setNewKind(kind)}><${Icon} name="plus" size=${16} /> New</button>
      </div></fieldset>`;
  };

  return html`<${Sheet} title=${isEdit ? 'Edit item' : 'Add an item'} onClose=${onClose}
    actions=${html`<button class="btn" onClick=${onClose}>Cancel</button>
      <button class="btn primary" disabled=${saving} onClick=${() => save(false)}>${isEdit ? 'Save item' : 'Add item'}</button>`}>
    <div class="two">
      <label class="field"><span>Name</span><input value=${f.name} onInput=${(e) => set({ name: e.target.value })} placeholder="Oat milk" autofocus=${!isEdit} /></label>
      <label class="field qty"><span>Quantity</span><input value=${f.qty} onInput=${(e) => set({ qty: e.target.value })} placeholder="2, 1 dozen" /></label>
    </div>
    <label class="field"><span>Notes</span><input value=${f.notes} onInput=${(e) => set({ notes: e.target.value })} placeholder="The barista kind, not the sad kind" /></label>
    ${tagRow('category', 'categoryIds')}
    ${tagRow('store', 'storeIds')}
    <fieldset><legend>Who's it for?</legend>
      <div class="chip-row">${members.map((m) => html`<${Chip} m=${m} on=${f.forIds.includes(m.id)} onClick=${() => toggle('forIds', m.id)} />`)}</div>
    </fieldset>
    <label class="switch-row">
      <span><b>Tell the others</b><small>Shows a heads-up on roommates' screens while their app is open.</small></span>
      <input type="checkbox" role="switch" checked=${f.notify} onChange=${(e) => set({ notify: e.target.checked })} />
    </label>
    ${!isEdit && html`<label class="switch-row">
      <span><b>Straight to Ready to add back</b><small>For staples: park it there instead of the shopping list.</small></span>
      <input type="checkbox" role="switch" checked=${f.toLater} onChange=${(e) => set({ toLater: e.target.checked })} />
    </label>`}
    ${newKind && html`<${NewTagSheet} st=${st} hid=${hid} kind=${newKind} count=${tags.length}
      onClose=${() => setNewKind(null)} onCreated=${(id) => toggle(newKind === 'category' ? 'categoryIds' : 'storeIds', id)} />`}
    ${dupe && html`<${DuplicateSheet} name=${f.name.trim()} existing=${dupe} onChoose=${onDupe} />`}
  <//>`;
}
