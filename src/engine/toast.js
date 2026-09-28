// ===== toasts: shadcn Toast (Base UI toast manager), with loading.dev loaders =====
// Same small API the engine already uses (toast(), toast.loading/success/..., update,
// dismiss, `id` to update in place). Base UI upserts when an id is reused, so a
// "Jev is deciding" loader turns into the result toast without flicker.
import { toast as manager } from '@/components/ui/toast';

const DEFAULT_MS = 4000;

export function toast(title, o = {}) {
  const type = o.type || 'default';
  const timeout = o.duration === Infinity ? 0 : (o.duration ?? (type === 'loading' ? 0 : DEFAULT_MS));
  return manager.add({
    id: o.id != null ? String(o.id) : undefined,
    title,
    description: o.description,
    type,
    timeout,
    priority: type === 'error' ? 'high' : 'low',
    data: { accent: o.accent, loader: o.loader },
  });
}
toast.success = (title, o = {}) => toast(title, { ...o, type: 'success' });
toast.error = (title, o = {}) => toast(title, { ...o, type: 'error' });
toast.info = (title, o = {}) => toast(title, { ...o, type: 'info' });
toast.warning = (title, o = {}) => toast(title, { ...o, type: 'warning' });
toast.loading = (title, o = {}) => toast(title, { ...o, type: 'loading' });
toast.update = (id, o = {}) => toast(o.title ?? '', { ...o, id });
toast.dismiss = id => manager.close(id != null ? String(id) : undefined);
