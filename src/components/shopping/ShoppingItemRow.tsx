import { useState } from 'react';
import { Check, Trash2, Edit2, X, Save } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import type { ShoppingItem } from '@/types';
import { UNIT_INFO } from '@/types/units';
import styles from './ShoppingItemRow.module.css';

interface ShoppingItemRowProps {
  item: ShoppingItem;
  onToggle: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ShoppingItem>) => void;
  onDelete: (id: string) => void;
}

export function ShoppingItemRow({ item, onToggle, onUpdate, onDelete }: ShoppingItemRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editQuantity, setEditQuantity] = useState(item.quantity?.toString() || '');
  const [editNotes, setEditNotes] = useState(item.notes || '');

  const formatQuantity = () => {
    if (item.quantity === null) return '';

    const qty = item.quantity;
    const unitInfo = item.unit ? UNIT_INFO[item.unit] : null;
    const unitStr = unitInfo?.abbreviation || item.unit || '';

    // Format quantity nicely (avoid showing 1.0000000001)
    const formattedQty = Number.isInteger(qty) ? qty.toString() : qty.toFixed(2).replace(/\.?0+$/, '');

    return unitStr ? `${formattedQty} ${unitStr}` : formattedQty;
  };

  const handleSave = () => {
    onUpdate(item.id, {
      name: editName.trim(),
      quantity: editQuantity ? parseFloat(editQuantity) : null,
      notes: editNotes.trim() || undefined,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(item.name);
    setEditQuantity(item.quantity?.toString() || '');
    setEditNotes(item.notes || '');
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className={styles.row}>
        <div className={styles.editForm}>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Item name"
            className={styles.editName}
          />
          <Input
            type="number"
            value={editQuantity}
            onChange={(e) => setEditQuantity(e.target.value)}
            placeholder="Qty"
            className={styles.editQuantity}
          />
          <Input
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            placeholder="Notes"
            className={styles.editNotes}
          />
          <div className={styles.editActions}>
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X size={16} />
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave}>
              <Save size={16} />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.row} ${item.isChecked ? styles.checked : ''}`}>
      <button
        type="button"
        className={styles.checkbox}
        onClick={() => onToggle(item.id)}
        aria-label={item.isChecked ? 'Uncheck item' : 'Check item'}
      >
        {item.isChecked && <Check size={14} />}
      </button>

      <div className={styles.content}>
        <span className={styles.name}>{item.name}</span>
        {formatQuantity() && <span className={styles.quantity}>{formatQuantity()}</span>}
        {item.notes && <span className={styles.notes}>{item.notes}</span>}
        {item.isManual && <span className={styles.badge}>Manual</span>}
      </div>

      <div className={styles.actions}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsEditing(true)}
          aria-label="Edit item"
          className="no-print"
        >
          <Edit2 size={16} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(item.id)}
          aria-label="Delete item"
          className="no-print"
        >
          <Trash2 size={16} />
        </Button>
      </div>
    </div>
  );
}
