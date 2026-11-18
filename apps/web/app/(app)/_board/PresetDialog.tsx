'use client';

import type { BoardFilter } from '@blueline/contracts';
import { Button } from '@blueline/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import styles from './board.module.css';

/** "Save as preset": names the current filters and POSTs them to /api/presets. */
export function PresetDialog({
  open,
  onClose,
  filter,
}: {
  open: boolean;
  onClose: () => void;
  filter: Partial<BoardFilter>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const nameId = useId();
  const titleId = useId();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const empty = Object.keys(filter).length === 0;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name the preset.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/presets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), filter }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setName('');
      onClose();
      router.refresh();
    } catch {
      setError('The preset was not saved. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className={styles.dialogBody}>
        <h2 id={titleId} className={styles.dialogTitle}>
          Save as preset
        </h2>
        {empty ? (
          <p className={styles.sub}>Set at least one filter first, then save it as a preset.</p>
        ) : (
          <>
            <label htmlFor={nameId} className={styles.sortLabel}>
              Preset name
            </label>
            <input
              id={nameId}
              className={styles.select}
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rebound overs"
            />
          </>
        )}
        {error ? (
          <p role="alert" className={styles.alert}>
            {error}
          </p>
        ) : null}
        <div className={styles.dialogActions}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {empty ? null : (
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving preset…' : 'Save preset'}
            </Button>
          )}
        </div>
      </form>
    </dialog>
  );
}
